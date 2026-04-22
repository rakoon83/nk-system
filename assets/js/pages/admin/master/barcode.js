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

const TABLE_NAME = "barcode_master";
const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("barcode-tbody");
const printArea = document.getElementById("print-area");

let editId = "";
let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

createTopbar({
  mountId: "page-topbar",
  title: "바코드 마스터",
  subtitle: "barcode_master / Supabase 연동",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "barcode-toolbar",
  currentUserName,
  searchPlaceholder: "자재번호 / 박스번호 / 자재내역 / 바코드 검색",
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
  tableId: "barcode-table",
  tbodyId: "barcode-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "barcode_master_table_columns",
  defaultSortKey: "id",
  defaultSortDir: "desc",
  columns: [
    { key: "no", label: "NO", width: 70, visible: true },
    { key: "material_no", label: "자재번호", width: 160, visible: true },
    { key: "box_no", label: "박스번호", width: 140, visible: true },
    { key: "material_name", label: "자재내역", width: 300, visible: true },
    { key: "pack_qty", label: "입수", width: 100, visible: true },
    { key: "exp_date", label: "유통기한", width: 140, visible: true },
    { key: "barcode", label: "바코드", width: 220, visible: true },
    { key: "created_at", label: "등록일시", width: 180, visible: true }
  ],
  sortMap: {
    no: 'thead th[data-col-key="no"] .th-inner',
    material_no: 'thead th[data-col-key="material_no"] .th-inner',
    box_no: 'thead th[data-col-key="box_no"] .th-inner',
    material_name: 'thead th[data-col-key="material_name"] .th-inner',
    pack_qty: 'thead th[data-col-key="pack_qty"] .th-inner',
    exp_date: 'thead th[data-col-key="exp_date"] .th-inner',
    barcode: 'thead th[data-col-key="barcode"] .th-inner',
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
  modalId: "barcode-form-modal",
  title: "개별 등록",
  bodyHtml: getFormModalHtml(),
  confirmText: "저장",
  cancelText: "닫기"
});

const pasteModal = createModal({
  mountId: "modal-root",
  modalId: "barcode-paste-modal",
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
  toolbar.on("sum", sumSelectedQty);

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
        row.material_no,
        row.box_no,
        row.material_name,
        row.pack_qty,
        row.exp_date,
        row.barcode,
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
        <td colspan="9" class="table-empty">데이터가 없습니다.</td>
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
  if (key === "material_no") return `<td data-col-key="material_no" class="mono-num">${esc(row.material_no)}</td>`;
  if (key === "box_no") return `<td data-col-key="box_no" class="mono-num">${esc(row.box_no)}</td>`;
  if (key === "material_name") return `<td data-col-key="material_name">${esc(row.material_name)}</td>`;
  if (key === "pack_qty") return `<td data-col-key="pack_qty" class="mono-num">${num(row.pack_qty)}</td>`;
  if (key === "exp_date") return `<td data-col-key="exp_date">${esc(row.exp_date)}</td>`;
  if (key === "barcode") return `<td data-col-key="barcode" class="mono-num">${esc(row.barcode)}</td>`;
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
    material_no: "",
    box_no: "",
    material_name: "",
    pack_qty: "",
    exp_date: "",
    barcode: ""
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
    material_no: row.material_no ?? "",
    box_no: row.box_no ?? "",
    material_name: row.material_name ?? "",
    pack_qty: row.pack_qty ?? 0,
    exp_date: row.exp_date ?? "",
    barcode: row.barcode ?? ""
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

function sumSelectedQty() {
  const ids = getSelectedIds();
  let targetRows = [];

  if (ids.length) {
    targetRows = allRows.filter(row => ids.includes(Number(row.id)));
  } else {
    targetRows = filteredRowsCache;
  }

  const total = targetRows.reduce((acc, row) => acc + toNumber(row.pack_qty), 0);

  if (ids.length) {
    tableManager.setStatus(`선택 입수 합계: ${num(total)}`);
  } else {
    tableManager.setStatus(`전체 입수 합계: ${num(total)}`);
  }
}

async function saveFormRow() {
  const values = getFormValues();

  const data = {
    material_no: values.material_no,
    box_no: values.box_no,
    material_name: values.material_name,
    pack_qty: toNumber(values.pack_qty),
    exp_date: values.exp_date,
    barcode: values.barcode
  };

  if (!data.material_no && !data.box_no && !data.barcode) {
    tableManager.setStatus("자재번호 / 박스번호 / 바코드 중 1개 이상 입력");
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
    if (cols.length < 6) continue;

    const firstCol = String(cols[0] || "").trim();
    const secondCol = String(cols[1] || "").trim();
    const thirdCol = String(cols[2] || "").trim();

    if (
      firstCol === "자재번호" ||
      firstCol === "코드" ||
      secondCol === "박스번호" ||
      thirdCol === "자재내역"
    ) {
      continue;
    }

    const row = {
      material_no: firstCol,
      box_no: secondCol,
      material_name: thirdCol,
      pack_qty: toNumber(cols[3]),
      exp_date: String(cols[4] || "").trim(),
      barcode: String(cols[5] || "").trim()
    };

    if (row.material_no || row.box_no || row.barcode) {
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
    자재번호: row.material_no,
    박스번호: row.box_no,
    자재내역: row.material_name,
    입수: row.pack_qty,
    유통기한: row.exp_date,
    바코드: row.barcode,
    등록일시: formatDateTime(row.created_at)
  }));

  downloadExcelFile({
    fileName: "barcode_master.xlsx",
    sheetName: "barcode_master",
    rows
  });

  tableManager.setStatus("엑셀 다운로드 완료");
}

function getFormModalHtml() {
  return `
    <div class="wms-form-grid">
      <div class="wms-form-row">
        <label class="wms-form-label" for="f-material-no">자재번호</label>
        <input id="f-material-no" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-box-no">박스번호</label>
        <input id="f-box-no" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-material-name">자재내역</label>
        <input id="f-material-name" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-pack-qty">입수</label>
        <input id="f-pack-qty" class="wms-form-input" type="number">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-exp-date">유통기한</label>
        <input id="f-exp-date" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-barcode">바코드</label>
        <input id="f-barcode" class="wms-form-input" type="text">
      </div>
    </div>
  `;
}

function getPasteModalHtml() {
  return `
    <textarea id="paste-text" class="wms-form-textarea" placeholder="엑셀에서 복사 후 Ctrl+V"></textarea>
    <div class="wms-help-text">열 순서 : 자재번호 / 박스번호 / 자재내역 / 입수 / 유통기한 / 바코드</div>
  `;
}

function getFormElements() {
  return {
    material_no: document.getElementById("f-material-no"),
    box_no: document.getElementById("f-box-no"),
    material_name: document.getElementById("f-material-name"),
    pack_qty: document.getElementById("f-pack-qty"),
    exp_date: document.getElementById("f-exp-date"),
    barcode: document.getElementById("f-barcode")
  };
}

function setFormValues(values) {
  const form = getFormElements();
  form.material_no.value = values.material_no ?? "";
  form.box_no.value = values.box_no ?? "";
  form.material_name.value = values.material_name ?? "";
  form.pack_qty.value = values.pack_qty ?? "";
  form.exp_date.value = values.exp_date ?? "";
  form.barcode.value = values.barcode ?? "";
}

function getFormValues() {
  const form = getFormElements();
  return {
    material_no: form.material_no.value.trim(),
    box_no: form.box_no.value.trim(),
    material_name: form.material_name.value.trim(),
    pack_qty: form.pack_qty.value,
    exp_date: form.exp_date.value.trim(),
    barcode: form.barcode.value.trim()
  };
}

function getPasteTextarea() {
  return document.getElementById("paste-text");
}

function toNumber(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
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