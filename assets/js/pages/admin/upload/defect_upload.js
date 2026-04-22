import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260422";
import { createTopbar } from "/assets/js/shared/topbar.js";
import { createToolbar } from "/assets/js/shared/toolbar.js";
import { createTableManager, compareTableValue } from "/assets/js/shared/table.js";
import { createModal, openConfirm } from "/assets/js/shared/modal.js";
import { downloadExcelFile } from "/assets/js/shared/excel.js";

checkAuth();
preparePageContent("app-nav", "page-content");

renderNav({
  mountId: "app-nav"
});

const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE_NAME = "defect_upload";
const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("defect-upload-tbody");
const printArea = document.getElementById("print-area");

let editId = "";
let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

createTopbar({
  mountId: "page-topbar",
  title: "결품 업로드",
  subtitle: "defect_upload / Supabase 연동",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "defect-upload-toolbar",
  currentUserName,
  searchPlaceholder: "Invoice / 국가 / 유형 / 결품 / 위치 검색",
  buttons: {
    add: true,
    paste: true,
    edit: true,
    remove: true,
    sum: true,
    download: true,
    print: true,
    config: true,
    search: true,
    currentUser: true
  }
});

const tableManager = createTableManager({
  tableId: "defect-upload-table",
  tbodyId: "defect-upload-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "defect_upload_table_columns",
  defaultSortKey: "id",
  defaultSortDir: "desc",
  columns: [
    { key: "no", label: "NO", width: 70, visible: true },
    { key: "invoice", label: "Invoice", width: 140, visible: true },
    { key: "ship_date", label: "출고일", width: 120, visible: true },
    { key: "country", label: "국가", width: 100, visible: true },
    { key: "type", label: "유형", width: 100, visible: true },
    { key: "defect", label: "결품", width: 180, visible: true },
    { key: "location", label: "위치", width: 120, visible: true },
    { key: "location_detail", label: "상세위치", width: 180, visible: true },
    { key: "load_time", label: "상차시간", width: 120, visible: true },
    { key: "created_at", label: "등록일시", width: 180, visible: true }
  ],
  sortMap: {
    no: 'thead th[data-col-key="no"] .th-inner',
    invoice: 'thead th[data-col-key="invoice"] .th-inner',
    ship_date: 'thead th[data-col-key="ship_date"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    type: 'thead th[data-col-key="type"] .th-inner',
    defect: 'thead th[data-col-key="defect"] .th-inner',
    location: 'thead th[data-col-key="location"] .th-inner',
    location_detail: 'thead th[data-col-key="location_detail"] .th-inner',
    load_time: 'thead th[data-col-key="load_time"] .th-inner',
    created_at: 'thead th[data-col-key="created_at"] .th-inner'
  },
  onSortChange: () => renderTable(true),
  onSelectionChange: (ids) => {
    toolbar.setDisabled("edit", ids.length !== 1);
    toolbar.setDisabled("remove", ids.length < 1);
  },
  onColumnChange: () => {
    renderTable(true);
  }
});

const formModal = createModal({
  mountId: "modal-root",
  modalId: "defect-upload-form-modal",
  title: "개별 등록",
  bodyHtml: getFormModalHtml(),
  confirmText: "저장",
  cancelText: "닫기"
});

const pasteModal = createModal({
  mountId: "modal-root",
  modalId: "defect-upload-paste-modal",
  title: "대량 등록",
  bodyHtml: getPasteModalHtml(),
  confirmText: "등록",
  cancelText: "닫기"
});

init();

async function init() {
  bindEvents();
  tableManager.init();
  await loadRows();
}

function bindEvents() {
  toolbar.on("add", openAddModal);
  toolbar.on("paste", openPasteModal);
  toolbar.on("edit", editSelectedRow);
  toolbar.on("remove", deleteSelectedRows);
  toolbar.on("download", downloadExcel);
  toolbar.on("print", () => window.print());
  toolbar.on("sum", sumSelectedRows);

  toolbar.searchInput?.addEventListener("input", () => renderTable(true));

  formModal.onConfirm(() => saveFormRow());
  pasteModal.onConfirm(() => savePasteRows());

  if (printArea) {
    printArea.addEventListener("scroll", onTableScroll, { passive: true });
  }
}

function onTableScroll() {
  if (!printArea) return;
  if (isAppending) return;
  if (renderedCount >= filteredRowsCache.length) return;

  const remain = printArea.scrollHeight - printArea.scrollTop - printArea.clientHeight;
  if (remain < 300) {
    appendNextRows();
  }
}

async function fetchAllRows() {
  let from = 0;
  let merged = [];

  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;

    const { data, error } = await supabaseClient
      .from(TABLE_NAME)
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    merged = merged.concat(rows);

    if (rows.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }

  return merged;
}

async function loadRows() {
  tableManager.setStatus("불러오는 중...");

  try {
    const data = await fetchAllRows();
    allRows = Array.isArray(data) ? data : [];
    renderTable(true);
  } catch (error) {
    console.error(error);
    tableManager.setStatus("데이터 조회 실패");
  }
}

function getFilteredRows() {
  const keyword = toolbar.getSearchKeyword();
  let rows = [...allRows];

  if (keyword) {
    rows = rows.filter((row) => {
      return [
        row.id,
        row.invoice,
        row.ship_date,
        row.country,
        row.type,
        row.defect,
        row.location,
        row.location_detail,
        row.load_time,
        row.created_at
      ].some(v => String(v ?? "").toLowerCase().includes(keyword));
    });
  }

  const { sortKey, sortDir } = tableManager.getSortState();

  rows = rows.map((row, index) => ({
    ...row,
    no: rows.length - index
  }));

  rows.sort((a, b) => compareTableValue(a[sortKey], b[sortKey], sortDir));
  rows.forEach((row, index) => {
    row.no = index + 1;
  });

  return rows;
}

function renderTable(reset = false) {
  filteredRowsCache = getFilteredRows();

  if (reset) {
    renderedCount = 0;
    tbody.innerHTML = "";
  }

  if (!filteredRowsCache.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="table-empty">데이터가 없습니다.</td>
      </tr>
    `;
    tableManager.refreshAfterRender();
    tableManager.setStatus("0건");
    return;
  }

  appendNextRows(true);
}

function appendNextRows(force = false) {
  if (isAppending && !force) return;
  if (renderedCount >= filteredRowsCache.length) return;

  isAppending = true;

  const visibleColumns = tableManager.getColumnState().filter(col => col.visible);
  const nextRows = filteredRowsCache.slice(renderedCount, renderedCount + RENDER_PAGE_SIZE);

  const html = nextRows.map(row => `
    <tr data-row-id="${row.id}">
      <td><input type="checkbox" class="chk row-chk" data-id="${row.id}"></td>
      ${visibleColumns.map(col => renderCell(col.key, row)).join("")}
    </tr>
  `).join("");

  if (renderedCount === 0) {
    tbody.innerHTML = html;
  } else {
    tbody.insertAdjacentHTML("beforeend", html);
  }

  renderedCount += nextRows.length;

  tableManager.refreshAfterRender();
  tableManager.setStatus(`${num(filteredRowsCache.length)}건 / 화면 ${num(renderedCount)}건`);

  isAppending = false;
}

function renderCell(key, row) {
  if (key === "no") return `<td data-col-key="no" class="mono-num">${esc(row.no)}</td>`;
  if (key === "invoice") return `<td data-col-key="invoice" class="mono-num">${esc(row.invoice)}</td>`;
  if (key === "ship_date") return `<td data-col-key="ship_date">${esc(row.ship_date)}</td>`;
  if (key === "country") return `<td data-col-key="country">${esc(row.country)}</td>`;
  if (key === "type") return `<td data-col-key="type">${esc(row.type)}</td>`;
  if (key === "defect") return `<td data-col-key="defect">${esc(row.defect)}</td>`;
  if (key === "location") return `<td data-col-key="location">${esc(row.location)}</td>`;
  if (key === "location_detail") return `<td data-col-key="location_detail">${esc(row.location_detail)}</td>`;
  if (key === "load_time") return `<td data-col-key="load_time">${esc(row.load_time)}</td>`;
  if (key === "created_at") return `<td data-col-key="created_at">${esc(formatDateTime(row.created_at))}</td>`;
  return "";
}

function getSelectedIds() {
  return tableManager.getSelectedIds().map(v => Number(v));
}

function openAddModal() {
  editId = "";
  formModal.setTitle("개별 등록");
  setFormValues({
    invoice: "",
    ship_date: "",
    country: "",
    type: "",
    defect: "",
    location: "",
    location_detail: "",
    load_time: ""
  });
  formModal.open();
}

function openPasteModal() {
  getPasteTextarea().value = "";
  pasteModal.open();
  setTimeout(() => getPasteTextarea().focus(), 30);
}

function editSelectedRow() {
  const ids = getSelectedIds();

  if (ids.length !== 1) {
    tableManager.setStatus("수정은 1건만 선택");
    return;
  }

  const row = allRows.find(item => Number(item.id) === Number(ids[0]));
  if (!row) return;

  editId = row.id;
  formModal.setTitle("선택 수정");
  setFormValues({
    invoice: row.invoice ?? "",
    ship_date: row.ship_date ?? "",
    country: row.country ?? "",
    type: row.type ?? "",
    defect: row.defect ?? "",
    location: row.location ?? "",
    location_detail: row.location_detail ?? "",
    load_time: row.load_time ?? ""
  });
  formModal.open();
}

async function deleteSelectedRows() {
  const ids = getSelectedIds();

  if (!ids.length) {
    tableManager.setStatus("삭제할 행을 선택");
    return;
  }

  openConfirm({
    mountId: "modal-root",
    title: "삭제 확인",
    message: `선택한 ${num(ids.length)}건을 삭제할까요?`,
    onConfirm: async () => {
      const { error } = await supabaseClient
        .from(TABLE_NAME)
        .delete()
        .in("id", ids);

      if (error) {
        console.error(error);
        tableManager.setStatus("삭제 실패");
        return;
      }

      await loadRows();
      tableManager.setStatus(`${num(ids.length)}건 삭제 완료`);
    }
  });
}

function sumSelectedRows() {
  const ids = getSelectedIds();
  const count = ids.length ? ids.length : filteredRowsCache.length;

  if (ids.length) {
    tableManager.setStatus(`선택 건수: ${num(count)}건`);
  } else {
    tableManager.setStatus(`전체 건수: ${num(count)}건`);
  }
}

async function saveFormRow() {
  const values = getFormValues();

  const data = {
    invoice: values.invoice,
    ship_date: values.ship_date,
    country: values.country,
    type: values.type,
    defect: values.defect,
    location: values.location,
    location_detail: values.location_detail,
    load_time: values.load_time
  };

  if (!data.invoice && !data.defect && !data.location) {
    tableManager.setStatus("Invoice / 결품 / 위치 중 1개 이상 입력");
    return false;
  }

  if (editId) {
    const { error } = await supabaseClient
      .from(TABLE_NAME)
      .update(data)
      .eq("id", editId);

    if (error) {
      console.error(error);
      tableManager.setStatus("수정 실패");
      return false;
    }

    await loadRows();
    tableManager.setStatus("수정 완료");
    return true;
  }

  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .insert([data]);

  if (error) {
    console.error(error);
    tableManager.setStatus("등록 실패");
    return false;
  }

  await loadRows();
  tableManager.setStatus("등록 완료");
  return true;
}

async function savePasteRows() {
  const text = getPasteTextarea().value.trim();

  if (!text) {
    tableManager.setStatus("붙여넣기 데이터가 없습니다");
    return false;
  }

  const lines = text.split(/\r?\n/).filter(Boolean);
  const newRows = [];

  for (const line of lines) {
    const cols = line.split("\t");
    if (cols.length < 8) continue;

    const firstCol = String(cols[0] || "").trim();
    const secondCol = String(cols[1] || "").trim();
    const thirdCol = String(cols[2] || "").trim();

    if (
      firstCol === "Invoice" ||
      firstCol === "인보이스" ||
      secondCol === "출고일" ||
      thirdCol === "국가"
    ) {
      continue;
    }

    const row = {
      invoice: firstCol,
      ship_date: secondCol,
      country: thirdCol,
      type: String(cols[3] || "").trim(),
      defect: String(cols[4] || "").trim(),
      location: String(cols[5] || "").trim(),
      location_detail: String(cols[6] || "").trim(),
      load_time: String(cols[7] || "").trim()
    };

    if (row.invoice || row.defect || row.location) {
      newRows.push(row);
    }
  }

  if (!newRows.length) {
    tableManager.setStatus("등록할 데이터가 없습니다");
    return false;
  }

  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .insert(newRows);

  if (error) {
    console.error(error);
    tableManager.setStatus("대량 등록 실패");
    return false;
  }

  await loadRows();
  tableManager.setStatus(`${num(newRows.length)}건 등록 완료`);
  return true;
}

function downloadExcel() {
  const rows = filteredRowsCache.map(row => ({
    NO: row.no,
    Invoice: row.invoice,
    출고일: row.ship_date,
    국가: row.country,
    유형: row.type,
    결품: row.defect,
    위치: row.location,
    상세위치: row.location_detail,
    상차시간: row.load_time,
    등록일시: formatDateTime(row.created_at)
  }));

  downloadExcelFile({
    fileName: "defect_upload.xlsx",
    sheetName: "defect_upload",
    rows
  });

  tableManager.setStatus("엑셀 다운로드 완료");
}

function getFormModalHtml() {
  return `
    <div class="wms-form-grid">
      <div class="wms-form-row">
        <label class="wms-form-label" for="f-invoice">Invoice</label>
        <input id="f-invoice" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-ship-date">출고일</label>
        <input id="f-ship-date" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-country">국가</label>
        <input id="f-country" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-type">유형</label>
        <input id="f-type" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-defect">결품</label>
        <input id="f-defect" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-location">위치</label>
        <input id="f-location" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-location-detail">상세위치</label>
        <input id="f-location-detail" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-load-time">상차시간</label>
        <input id="f-load-time" class="wms-form-input" type="text">
      </div>
    </div>
  `;
}

function getPasteModalHtml() {
  return `
    <textarea id="paste-text" class="wms-form-textarea" placeholder="엑셀에서 복사 후 Ctrl+V"></textarea>
    <div class="wms-help-text">열 순서 : Invoice / 출고일 / 국가 / 유형 / 결품 / 위치 / 상세위치 / 상차시간</div>
  `;
}

function getFormElements() {
  return {
    invoice: document.getElementById("f-invoice"),
    ship_date: document.getElementById("f-ship-date"),
    country: document.getElementById("f-country"),
    type: document.getElementById("f-type"),
    defect: document.getElementById("f-defect"),
    location: document.getElementById("f-location"),
    location_detail: document.getElementById("f-location-detail"),
    load_time: document.getElementById("f-load-time")
  };
}

function setFormValues(values) {
  const form = getFormElements();
  form.invoice.value = values.invoice ?? "";
  form.ship_date.value = values.ship_date ?? "";
  form.country.value = values.country ?? "";
  form.type.value = values.type ?? "";
  form.defect.value = values.defect ?? "";
  form.location.value = values.location ?? "";
  form.location_detail.value = values.location_detail ?? "";
  form.load_time.value = values.load_time ?? "";
}

function getFormValues() {
  const form = getFormElements();
  return {
    invoice: form.invoice.value.trim(),
    ship_date: form.ship_date.value.trim(),
    country: form.country.value.trim(),
    type: form.type.value.trim(),
    defect: form.defect.value.trim(),
    location: form.location.value.trim(),
    location_detail: form.location_detail.value.trim(),
    load_time: form.load_time.value.trim()
  };
}

function getPasteTextarea() {
  return document.getElementById("paste-text");
}

function num(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("ko-KR");
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}