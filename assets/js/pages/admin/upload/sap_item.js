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

const TABLE_NAME = "sap_item";
const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("sap-item-tbody");
const printArea = document.getElementById("print-area");

let editId = "";
let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

createTopbar({
  mountId: "page-topbar",
  title: "SAP 자재 업로드",
  subtitle: "sap_item / Supabase 연동",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "sap-item-toolbar",
  currentUserName,
  searchPlaceholder: "Invoice / 코드 / 자재내역 / 비고 검색",
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
  tableId: "sap-item-table",
  tbodyId: "sap-item-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "sap_item_table_columns",
  defaultSortKey: "id",
  defaultSortDir: "desc",
  columns: [
    { key: "no", label: "NO", width: 70, visible: true },
    { key: "invoice", label: "Invoice", width: 140, visible: true },
    { key: "list_no", label: "번호", width: 90, visible: true },
    { key: "material_no", label: "코드", width: 120, visible: true },
    { key: "material_name", label: "자재내역", width: 300, visible: true },
    { key: "outbound_qty", label: "출고", width: 80, visible: true },
    { key: "product_qty", label: "제품", width: 80, visible: true },
    { key: "outer_box_qty", label: "외박스", width: 80, visible: true },
    { key: "total_qty", label: "합계", width: 80, visible: true },
    { key: "cbm", label: "CBM", width: 90, visible: true },
    { key: "packing", label: "중량", width: 90, visible: true },
    { key: "weight", label: "단위", width: 80, visible: true },
    { key: "note", label: "비고", width: 200, visible: true },
    { key: "created_at", label: "등록일시", width: 180, visible: true }
  ],
  sortMap: {
    no: 'thead th[data-col-key="no"] .th-inner',
    invoice: 'thead th[data-col-key="invoice"] .th-inner',
    list_no: 'thead th[data-col-key="list_no"] .th-inner',
    material_no: 'thead th[data-col-key="material_no"] .th-inner',
    material_name: 'thead th[data-col-key="material_name"] .th-inner',
    outbound_qty: 'thead th[data-col-key="outbound_qty"] .th-inner',
    product_qty: 'thead th[data-col-key="product_qty"] .th-inner',
    outer_box_qty: 'thead th[data-col-key="outer_box_qty"] .th-inner',
    total_qty: 'thead th[data-col-key="total_qty"] .th-inner',
    cbm: 'thead th[data-col-key="cbm"] .th-inner',
    packing: 'thead th[data-col-key="packing"] .th-inner',
    weight: 'thead th[data-col-key="weight"] .th-inner',
    note: 'thead th[data-col-key="note"] .th-inner',
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
  modalId: "sap-item-form-modal",
  title: "개별 등록",
  bodyHtml: getFormModalHtml(),
  confirmText: "저장",
  cancelText: "닫기"
});

const pasteModal = createModal({
  mountId: "modal-root",
  modalId: "sap-item-paste-modal",
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
        row.invoice,
        row.list_no,
        row.material_no,
        row.material_name,
        row.outbound_qty,
        row.product_qty,
        row.outer_box_qty,
        row.total_qty,
        row.cbm,
        row.packing,
        row.weight,
        row.note,
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
        <td colspan="15" class="table-empty">데이터가 없습니다.</td>
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
  if (key === "list_no") return `<td data-col-key="list_no" class="mono-num">${esc(row.list_no)}</td>`;
  if (key === "material_no") return `<td data-col-key="material_no" class="mono-num">${esc(row.material_no)}</td>`;
  if (key === "material_name") return `<td data-col-key="material_name">${esc(row.material_name)}</td>`;
  if (key === "outbound_qty") return `<td data-col-key="outbound_qty" class="mono-num">${num(row.outbound_qty)}</td>`;
  if (key === "product_qty") return `<td data-col-key="product_qty" class="mono-num">${num(row.product_qty)}</td>`;
  if (key === "outer_box_qty") return `<td data-col-key="outer_box_qty" class="mono-num">${num(row.outer_box_qty)}</td>`;
  if (key === "total_qty") return `<td data-col-key="total_qty" class="mono-num">${num(row.total_qty)}</td>`;
  if (key === "cbm") return `<td data-col-key="cbm" class="mono-num">${numDecimal(row.cbm)}</td>`;
  if (key === "packing") return `<td data-col-key="packing" class="mono-num">${numDecimal(row.packing)}</td>`;
  if (key === "weight") return `<td data-col-key="weight">${esc(row.weight)}</td>`;
  if (key === "note") return `<td data-col-key="note">${esc(row.note)}</td>`;
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
    list_no: "",
    material_no: "",
    material_name: "",
    outbound_qty: "",
    product_qty: "",
    outer_box_qty: "",
    total_qty: "",
    cbm: "",
    packing: "",
    weight: "",
    note: ""
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
    list_no: row.list_no ?? "",
    material_no: row.material_no ?? "",
    material_name: row.material_name ?? "",
    outbound_qty: row.outbound_qty ?? 0,
    product_qty: row.product_qty ?? 0,
    outer_box_qty: row.outer_box_qty ?? 0,
    total_qty: row.total_qty ?? 0,
    cbm: row.cbm ?? "",
    packing: row.packing ?? "",
    weight: row.weight ?? "",
    note: row.note ?? ""
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

  const total = targetRows.reduce((acc, row) => acc + toNumber(row.total_qty), 0);

  if (ids.length) {
    tableManager.setStatus(`선택 합계: ${num(total)}`);
  } else {
    tableManager.setStatus(`전체 합계: ${num(total)}`);
  }
}

async function saveFormRow() {
  const values = getFormValues();

  const data = {
    invoice: values.invoice,
    list_no: values.list_no,
    material_no: values.material_no,
    material_name: values.material_name,
    outbound_qty: toNumber(values.outbound_qty),
    product_qty: toNumber(values.product_qty),
    outer_box_qty: toNumber(values.outer_box_qty),
    total_qty: toNumber(values.total_qty),
    cbm: toDecimal(values.cbm),
    packing: toDecimal(values.packing),
    weight: values.weight,
    note: values.note
  };

  if (!data.invoice && !data.material_no && !data.material_name) {
    tableManager.setStatus("Invoice / 코드 / 자재내역 중 1개 이상 입력");
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
    if (cols.length < 12) continue;

    const firstCol = String(cols[0] || "").trim();
    const secondCol = String(cols[1] || "").trim();
    const thirdCol = String(cols[2] || "").trim();

    if (
      firstCol === "Invoice" ||
      firstCol === "인보이스" ||
      secondCol === "번호" ||
      thirdCol === "코드"
    ) {
      continue;
    }

    const row = {
      invoice: firstCol,
      list_no: secondCol,
      material_no: thirdCol,
      material_name: String(cols[3] || "").trim(),
      outbound_qty: toNumber(cols[4]),
      product_qty: toNumber(cols[5]),
      outer_box_qty: toNumber(cols[6]),
      total_qty: toNumber(cols[7]),
      cbm: toDecimal(cols[8]),
      packing: toDecimal(cols[9]),
      weight: String(cols[10] || "").trim(),
      note: String(cols[11] || "").trim()
    };

    if (row.invoice || row.material_no || row.material_name) {
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
    번호: row.list_no,
    코드: row.material_no,
    자재내역: row.material_name,
    출고: row.outbound_qty,
    제품: row.product_qty,
    외박스: row.outer_box_qty,
    합계: row.total_qty,
    CBM: row.cbm,
    중량: row.packing,
    단위: row.weight,
    비고: row.note,
    등록일시: formatDateTime(row.created_at)
  }));

  downloadExcelFile({
    fileName: "sap_item.xlsx",
    sheetName: "sap_item",
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
        <label class="wms-form-label" for="f-list-no">번호</label>
        <input id="f-list-no" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-material-no">코드</label>
        <input id="f-material-no" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-material-name">자재내역</label>
        <input id="f-material-name" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-outbound-qty">출고</label>
        <input id="f-outbound-qty" class="wms-form-input" type="number">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-product-qty">제품</label>
        <input id="f-product-qty" class="wms-form-input" type="number">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-outer-box-qty">외박스</label>
        <input id="f-outer-box-qty" class="wms-form-input" type="number">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-total-qty">합계</label>
        <input id="f-total-qty" class="wms-form-input" type="number">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-cbm">CBM</label>
        <input id="f-cbm" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-packing">중량</label>
        <input id="f-packing" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-weight">단위</label>
        <input id="f-weight" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-note">비고</label>
        <input id="f-note" class="wms-form-input" type="text">
      </div>
    </div>
  `;
}

function getPasteModalHtml() {
  return `
    <textarea id="paste-text" class="wms-form-textarea" placeholder="엑셀에서 복사 후 Ctrl+V"></textarea>
    <div class="wms-help-text">열 순서 : Invoice / 번호 / 코드 / 자재내역 / 출고 / 제품 / 외박스 / 합계 / CBM / 중량 / 단위 / 비고</div>
  `;
}

function getFormElements() {
  return {
    invoice: document.getElementById("f-invoice"),
    list_no: document.getElementById("f-list-no"),
    material_no: document.getElementById("f-material-no"),
    material_name: document.getElementById("f-material-name"),
    outbound_qty: document.getElementById("f-outbound-qty"),
    product_qty: document.getElementById("f-product-qty"),
    outer_box_qty: document.getElementById("f-outer-box-qty"),
    total_qty: document.getElementById("f-total-qty"),
    cbm: document.getElementById("f-cbm"),
    packing: document.getElementById("f-packing"),
    weight: document.getElementById("f-weight"),
    note: document.getElementById("f-note")
  };
}

function setFormValues(values) {
  const form = getFormElements();
  form.invoice.value = values.invoice ?? "";
  form.list_no.value = values.list_no ?? "";
  form.material_no.value = values.material_no ?? "";
  form.material_name.value = values.material_name ?? "";
  form.outbound_qty.value = values.outbound_qty ?? "";
  form.product_qty.value = values.product_qty ?? "";
  form.outer_box_qty.value = values.outer_box_qty ?? "";
  form.total_qty.value = values.total_qty ?? "";
  form.cbm.value = values.cbm ?? "";
  form.packing.value = values.packing ?? "";
  form.weight.value = values.weight ?? "";
  form.note.value = values.note ?? "";
}

function getFormValues() {
  const form = getFormElements();
  return {
    invoice: form.invoice.value.trim(),
    list_no: form.list_no.value.trim(),
    material_no: form.material_no.value.trim(),
    material_name: form.material_name.value.trim(),
    outbound_qty: form.outbound_qty.value,
    product_qty: form.product_qty.value,
    outer_box_qty: form.outer_box_qty.value,
    total_qty: form.total_qty.value,
    cbm: form.cbm.value.trim(),
    packing: form.packing.value.trim(),
    weight: form.weight.value.trim(),
    note: form.note.value.trim()
  };
}

function getPasteTextarea() {
  return document.getElementById("paste-text");
}

function toNumber(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function toDecimal(value) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function num(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function numDecimal(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 6 });
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