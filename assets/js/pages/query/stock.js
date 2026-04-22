import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260421";
import { createTopbar } from "/assets/js/shared/topbar.js";
import { createToolbar } from "/assets/js/shared/toolbar.js";
import { createTableManager, compareTableValue } from "/assets/js/shared/table.js";
import { createModal, openConfirm } from "/assets/js/shared/modal.js";
import { downloadExcelFile } from "/assets/js/shared/excel.js";
import { loadStorageRows, saveStorageRows } from "/assets/js/shared/storage.js";

checkAuth();
preparePageContent("app-nav", "page-content");

renderNav({
  mountId: "app-nav"
});

const STORAGE_KEY = "wms_stock_test_rows_v9";

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("stock-tbody");

let editId = "";

const defaultRows = [
  { id: uid(), no: 1, country: "KR", code: "100001", box: "BOX-001", name: "테스트 자재 A", note: "", qty: 120, writer: "남경관리자" },
  { id: uid(), no: 2, country: "US", code: "100002", box: "BOX-002", name: "테스트 자재 B", note: "샘플", qty: 80, writer: "남경관리자" },
  { id: uid(), no: 3, country: "JP", code: "100003", box: "BOX-003", name: "테스트 자재 C", note: "", qty: 45, writer: "남경관리자" }
];

createTopbar({
  mountId: "page-topbar",
  title: "재고 조회",
  subtitle: "창고별 재고 / 테스트 화면",
  rightHtml: `<div class="wms-topbar-chip">모드<strong>TEST</strong></div>`
});

const toolbar = createToolbar({
  mountId: "stock-toolbar",
  currentUserName,
  searchPlaceholder: "검색",
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
  tableId: "stock-table",
  tbodyId: "stock-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "stock_table_columns",
  defaultSortKey: "no",
  defaultSortDir: "asc",
  columns: [
    { key: "no", label: "NO", width: 80, visible: true },
    { key: "country", label: "국가", width: 120, visible: true },
    { key: "code", label: "코드", width: 140, visible: true },
    { key: "box", label: "박스번호", width: 180, visible: true },
    { key: "name", label: "자재내역", width: 220, visible: true },
    { key: "note", label: "비고", width: 180, visible: true },
    { key: "qty", label: "재고", width: 100, visible: true },
    { key: "writer", label: "등록자", width: 130, visible: true }
  ],
  sortMap: {
    no: 'thead th[data-col-key="no"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    code: 'thead th[data-col-key="code"] .th-inner',
    box: 'thead th[data-col-key="box"] .th-inner',
    name: 'thead th[data-col-key="name"] .th-inner',
    note: 'thead th[data-col-key="note"] .th-inner',
    qty: 'thead th[data-col-key="qty"] .th-inner',
    writer: 'thead th[data-col-key="writer"] .th-inner'
  },
  onSortChange: () => renderTable(),
  onSelectionChange: (ids) => {
    toolbar.setDisabled("edit", ids.length !== 1);
    toolbar.setDisabled("remove", ids.length < 1);
  },
  onColumnChange: () => {
    renderTable();
  }
});

const formModal = createModal({
  mountId: "modal-root",
  modalId: "stock-form-modal",
  title: "개별 등록",
  bodyHtml: getFormModalHtml(),
  confirmText: "저장",
  cancelText: "닫기"
});

const pasteModal = createModal({
  mountId: "modal-root",
  modalId: "stock-paste-modal",
  title: "대량 등록",
  bodyHtml: getPasteModalHtml(),
  confirmText: "등록",
  cancelText: "닫기"
});

init();

function init() {
  const currentRows = loadStorageRows(STORAGE_KEY, []);
  if (!currentRows.length) {
    saveRows(defaultRows);
  }

  bindEvents();
  tableManager.init();
  renderTable();
}

function bindEvents() {
  toolbar.on("add", openAddModal);
  toolbar.on("paste", openPasteModal);
  toolbar.on("edit", editSelectedRow);
  toolbar.on("remove", deleteSelectedRows);
  toolbar.on("download", downloadExcel);
  toolbar.on("print", () => window.print());
  toolbar.on("sum", sumSelectedQty);

  toolbar.searchInput?.addEventListener("input", renderTable);

  formModal.onConfirm(() => saveFormRow());
  pasteModal.onConfirm(() => savePasteRows());
}

function getRows() {
  return loadStorageRows(STORAGE_KEY, defaultRows);
}

function saveRows(rows) {
  saveStorageRows(STORAGE_KEY, rows);
}

function getFilteredRows() {
  const keyword = toolbar.getSearchKeyword();
  let rows = getRows();

  if (keyword) {
    rows = rows.filter((row) => {
      return [
        row.no,
        row.country,
        row.code,
        row.box,
        row.name,
        row.note,
        row.qty,
        row.writer
      ].some(v => String(v ?? "").toLowerCase().includes(keyword));
    });
  }

  const { sortKey, sortDir } = tableManager.getSortState();
  rows = [...rows].sort((a, b) => compareTableValue(a[sortKey], b[sortKey], sortDir));

  return rows;
}

function renderTable() {
  const rows = getFilteredRows();
  const visibleColumns = tableManager.getColumnState().filter(col => col.visible);

  tbody.innerHTML = rows.map(row => `
    <tr data-row-id="${row.id}">
      <td><input type="checkbox" class="chk row-chk" data-id="${row.id}"></td>
      ${visibleColumns.map(col => renderCell(col.key, row)).join("")}
    </tr>
  `).join("");

  tableManager.refreshAfterRender();
  tableManager.setStatus(`${num(rows.length)}건`);
}

function renderCell(key, row) {
  if (key === "no") return `<td data-col-key="no" class="mono-num">${esc(row.no)}</td>`;
  if (key === "country") return `<td data-col-key="country">${esc(row.country)}</td>`;
  if (key === "code") return `<td data-col-key="code" class="mono-num">${esc(row.code)}</td>`;
  if (key === "box") return `<td data-col-key="box">${esc(row.box)}</td>`;
  if (key === "name") return `<td data-col-key="name">${esc(row.name)}</td>`;
  if (key === "note") return `<td data-col-key="note">${esc(row.note)}</td>`;
  if (key === "qty") return `<td data-col-key="qty" class="mono-num">${num(row.qty)}</td>`;
  if (key === "writer") return `<td data-col-key="writer">${esc(row.writer || "")}</td>`;
  return "";
}

function getSelectedIds() {
  return tableManager.getSelectedIds();
}

function openAddModal() {
  editId = "";
  formModal.setTitle("개별 등록");
  setFormValues({
    country: "",
    code: "",
    box: "",
    name: "",
    note: "",
    qty: ""
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

  const row = getRows().find(item => item.id === ids[0]);
  if (!row) return;

  editId = row.id;
  formModal.setTitle("선택 수정");
  setFormValues({
    country: row.country ?? "",
    code: row.code ?? "",
    box: row.box ?? "",
    name: row.name ?? "",
    note: row.note ?? "",
    qty: row.qty ?? ""
  });
  formModal.open();
}

function deleteSelectedRows() {
  const ids = getSelectedIds();

  if (!ids.length) {
    tableManager.setStatus("삭제할 행을 선택");
    return;
  }

  openConfirm({
    mountId: "modal-root",
    title: "삭제 확인",
    message: `선택한 ${num(ids.length)}건을 삭제할까요?`,
    onConfirm: () => {
      const nextRows = getRows().filter(row => !ids.includes(row.id));
      saveRows(nextRows);
      renderTable();
      tableManager.setStatus(`${num(ids.length)}건 삭제 완료`);
    }
  });
}

function sumSelectedQty() {
  const ids = getSelectedIds();
  let targetRows = [];

  if (ids.length) {
    targetRows = getRows().filter(row => ids.includes(row.id));
  } else {
    targetRows = getFilteredRows();
  }

  const total = targetRows.reduce((acc, row) => acc + toNumber(row.qty), 0);

  if (ids.length) {
    tableManager.setStatus(`선택 수량 합계: ${num(total)}`);
  } else {
    tableManager.setStatus(`전체 수량 합계: ${num(total)}`);
  }
}

function countFilledFields(data) {
  const values = [
    data.country,
    data.code,
    data.box,
    data.name,
    data.note,
    data.qty
  ];

  return values.filter(v => {
    if (v === null || v === undefined) return false;
    if (typeof v === "number") return v !== 0;
    return String(v).trim() !== "";
  }).length;
}

function saveFormRow() {
  const rows = getRows();
  const values = getFormValues();

  const data = {
    id: editId || uid(),
    no: editId ? findExistingNo(editId, rows) : nextNo(rows),
    country: values.country,
    code: values.code,
    box: values.box,
    name: values.name,
    note: values.note,
    qty: toNumber(values.qty),
    writer: currentUserName
  };

  if (countFilledFields(data) < 2) {
    tableManager.setStatus("신규 / 수정은 2개 이상 입력");
    return false;
  }

  if (editId) {
    const idx = rows.findIndex(row => row.id === editId);
    if (idx > -1) rows[idx] = data;
    tableManager.setStatus("수정 완료");
  } else {
    rows.push(data);
    tableManager.setStatus("등록 완료");
  }

  saveRows(rows);
  renderTable();
  return true;
}

function savePasteRows() {
  const text = getPasteTextarea().value.trim();

  if (!text) {
    tableManager.setStatus("붙여넣기 데이터가 없습니다");
    return false;
  }

  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows = getRows();
  let nextNumber = nextNo(rows);
  const newRows = [];

  for (const line of lines) {
    const cols = line.split("\t");
    if (cols.length < 7) continue;

    const row = {
      id: uid(),
      no: toNumber(cols[0]) || nextNumber++,
      country: String(cols[1] || "").trim(),
      code: String(cols[2] || "").trim(),
      box: String(cols[3] || "").trim(),
      name: String(cols[4] || "").trim(),
      note: String(cols[5] || "").trim(),
      qty: toNumber(cols[6]),
      writer: currentUserName
    };

    if (countFilledFields(row) >= 2) {
      newRows.push(row);
    }
  }

  if (!newRows.length) {
    tableManager.setStatus("2개 이상 입력된 행이 없습니다");
    return false;
  }

  rows.push(...newRows);
  saveRows(rows);
  renderTable();
  tableManager.setStatus(`${num(newRows.length)}건 등록 완료`);
  return true;
}

function downloadExcel() {
  const rows = getFilteredRows().map(row => ({
    NO: row.no,
    국가: row.country,
    코드: row.code,
    박스번호: row.box,
    자재내역: row.name,
    비고: row.note,
    재고: row.qty,
    등록자: row.writer || ""
  }));

  downloadExcelFile({
    fileName: "stock.xlsx",
    sheetName: "stock",
    rows
  });

  tableManager.setStatus("엑셀 다운로드 완료");
}

function nextNo(rows) {
  const maxNo = rows.reduce((max, row) => Math.max(max, toNumber(row.no)), 0);
  return maxNo + 1;
}

function findExistingNo(id, rows) {
  const found = rows.find(row => row.id === id);
  return found ? toNumber(found.no) : nextNo(rows);
}

function getFormModalHtml() {
  return `
    <div class="wms-form-grid">
      <div class="wms-form-row">
        <label class="wms-form-label" for="f-country">국가</label>
        <input id="f-country" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-code">코드</label>
        <input id="f-code" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-box">박스번호</label>
        <input id="f-box" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-qty">재고</label>
        <input id="f-qty" class="wms-form-input" type="number">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-name">자재내역</label>
        <input id="f-name" class="wms-form-input" type="text">
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
    <div class="wms-help-text">열 순서 : NO / 국가 / 코드 / 박스번호 / 자재내역 / 비고 / 재고</div>
  `;
}

function getFormElements() {
  return {
    country: document.getElementById("f-country"),
    code: document.getElementById("f-code"),
    box: document.getElementById("f-box"),
    name: document.getElementById("f-name"),
    note: document.getElementById("f-note"),
    qty: document.getElementById("f-qty")
  };
}

function setFormValues(values) {
  const form = getFormElements();
  form.country.value = values.country ?? "";
  form.code.value = values.code ?? "";
  form.box.value = values.box ?? "";
  form.name.value = values.name ?? "";
  form.note.value = values.note ?? "";
  form.qty.value = values.qty ?? "";
}

function getFormValues() {
  const form = getFormElements();
  return {
    country: form.country.value.trim(),
    code: form.code.value.trim(),
    box: form.box.value.trim(),
    name: form.name.value.trim(),
    note: form.note.value.trim(),
    qty: form.qty.value
  };
}

function getPasteTextarea() {
  return document.getElementById("paste-text");
}

function uid() {
  return "R" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function toNumber(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function num(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}