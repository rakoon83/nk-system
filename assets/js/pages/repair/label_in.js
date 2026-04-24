import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260422";
import { createTopbar } from "/assets/js/shared/topbar.js";
import { createToolbar } from "/assets/js/shared/toolbar.js";
import { createTableManager, compareTableValue } from "/assets/js/shared/table.js";
import { createModal } from "/assets/js/shared/modal.js";
import { downloadExcelFile } from "/assets/js/shared/excel.js";

checkAuth();
preparePageContent("app-nav", "page-content");

renderNav({
  mountId: "app-nav"
});

const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE_NAME = "label_in";
const SAP_DOC_TABLE = "sap_doc";

const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("label-in-tbody");
const printArea = document.getElementById("print-area");

let editId = "";
let allRows = [];
let sapDocRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

createTopbar({
  mountId: "page-topbar",
  title: "라벨 입고",
  subtitle: "인보이스 입력 → SAP문서 자동불러오기",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "label-in-toolbar",
  currentUserName,
  searchPlaceholder: "인보이스 / 출고일 / 국가 / 납품처명 / 담당자 / 사용자 / 비고 검색",
  buttons: {
    add: true,
    paste: false,
    edit: true,
    remove: true,
    sum: false,
    download: true,
    print: true,
    config: true,
    search: true,
    currentUser: true
  }
});

const tableManager = createTableManager({
  tableId: "label-in-table",
  tbodyId: "label-in-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "label_in_table_columns",
  defaultSortKey: "id",
  defaultSortDir: "desc",
  columns: [
    { key: "no", label: "NO", width: 60, visible: true },
    { key: "invoice", label: "인보이스", width: 170, visible: true },
    { key: "ship_date", label: "출고일", width: 120, visible: true },
    { key: "country", label: "국가", width: 100, visible: true },
    { key: "product_qty", label: "제품", width: 100, visible: true },
    { key: "outer_box_qty", label: "외박스", width: 100, visible: true },
    { key: "total_qty", label: "합계", width: 100, visible: true },
    { key: "customer_name", label: "납품처명", width: 220, visible: true },
    { key: "manager", label: "담당자", width: 140, visible: true },
    { key: "user_name", label: "사용자", width: 140, visible: true },
    { key: "note", label: "비고", width: 260, visible: true },
    { key: "created_at", label: "등록일", width: 170, visible: true }
  ],
  sortMap: {
    no: 'thead th[data-col-key="no"] .th-inner',
    invoice: 'thead th[data-col-key="invoice"] .th-inner',
    ship_date: 'thead th[data-col-key="ship_date"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    product_qty: 'thead th[data-col-key="product_qty"] .th-inner',
    outer_box_qty: 'thead th[data-col-key="outer_box_qty"] .th-inner',
    total_qty: 'thead th[data-col-key="total_qty"] .th-inner',
    customer_name: 'thead th[data-col-key="customer_name"] .th-inner',
    manager: 'thead th[data-col-key="manager"] .th-inner',
    user_name: 'thead th[data-col-key="user_name"] .th-inner',
    note: 'thead th[data-col-key="note"] .th-inner',
    created_at: 'thead th[data-col-key="created_at"] .th-inner'
  },
  onSortChange: () => renderTable(true),
  onSelectionChange: (ids) => {
    toolbar.setDisabled("edit", ids.length !== 1);
    toolbar.setDisabled("remove", ids.length < 1);
  },
  onColumnChange: () => renderTable(true)
});

const formModal = createModal({
  mountId: "modal-root",
  modalId: "label-in-form-modal",
  title: "라벨 입고 등록",
  bodyHtml: getFormModalHtml(),
  confirmText: "저장",
  cancelText: "닫기"
});

init();

async function init() {
  bindEvents();
  tableManager.init();

  sapDocRows = await fetchAllRows(SAP_DOC_TABLE);
  await syncFromSapDoc();
  await loadRows();
}

function bindEvents() {
  toolbar.on("add", openAddModal);
  toolbar.on("edit", editSelectedRow);
  toolbar.on("remove", deleteSelectedRows);
  toolbar.on("download", downloadExcel);
  toolbar.on("print", () => window.print());

  toolbar.searchInput?.addEventListener("input", () => renderTable(true));
  formModal.onConfirm(() => saveFormRow());

  if (printArea) {
    printArea.addEventListener("scroll", onTableScroll, { passive: true });
  }
}

async function syncFromSapDoc() {
  tableManager.setStatus("SAP문서 자동 수정 중...");

  try {
    const labelRows = await fetchAllRows(TABLE_NAME);
    const updates = [];

    labelRows.forEach(row => {
      const sap = findSapDoc(row.invoice);
      if (!sap) return;

      const updateData = makeAutoData(sap);

      if (
        clean(row.ship_date) !== clean(updateData.ship_date) ||
        clean(row.country) !== clean(updateData.country) ||
        Number(row.product_qty || 0) !== Number(updateData.product_qty || 0) ||
        Number(row.outer_box_qty || 0) !== Number(updateData.outer_box_qty || 0) ||
        Number(row.total_qty || 0) !== Number(updateData.total_qty || 0) ||
        clean(row.customer_name) !== clean(updateData.customer_name) ||
        clean(row.manager) !== clean(updateData.manager)
      ) {
        updates.push({
          id: row.id,
          updateData
        });
      }
    });

    for (const item of updates) {
      await supabaseClient
        .from(TABLE_NAME)
        .update(item.updateData)
        .eq("id", item.id);
    }

    tableManager.setStatus(`자동 수정 ${num(updates.length)}건`);
  } catch (error) {
    console.error(error);
    tableManager.setStatus("SAP문서 자동 수정 실패");
  }
}

function findSapDoc(invoice) {
  const key = clean(invoice);
  if (!key) return null;

  return sapDocRows.find(row => clean(row.invoice) === key) || null;
}

function makeAutoData(sap) {
  return {
    ship_date: clean(sap.ship_date),
    country: clean(sap.country),
    product_qty: toInt(sap.product_qty),
    outer_box_qty: toInt(sap.outer_box_qty),
    total_qty: toInt(sap.total_qty),
    customer_name: clean(sap.customer_name),
    manager: clean(sap.manager)
  };
}

function openAddModal() {
  editId = "";
  formModal.setTitle("라벨 입고 등록");

  setFormValues({
    invoice: "",
    note: ""
  });

  formModal.open();
}

function editSelectedRow() {
  const ids = tableManager.getSelectedIds().map(v => Number(v));

  if (ids.length !== 1) {
    tableManager.setStatus("수정은 1건만 선택");
    return;
  }

  const row = allRows.find(item => Number(item.id) === Number(ids[0]));
  if (!row) return;

  editId = row.id;
  formModal.setTitle("라벨 입고 수정");

  setFormValues({
    invoice: row.invoice,
    note: row.note
  });

  formModal.open();
}

async function saveFormRow() {
  const values = getFormValues();

  if (!values.invoice) {
    tableManager.setStatus("인보이스 입력 필요");
    return false;
  }

  const sap = findSapDoc(values.invoice);
  const autoData = sap ? makeAutoData(sap) : {};

  const data = {
    invoice: values.invoice,
    ship_date: autoData.ship_date || "",
    country: autoData.country || "",
    product_qty: autoData.product_qty || 0,
    outer_box_qty: autoData.outer_box_qty || 0,
    total_qty: autoData.total_qty || 0,
    customer_name: autoData.customer_name || "",
    manager: autoData.manager || "",
    user_name: currentUserName,
    note: values.note
  };

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
  tableManager.setStatus(sap ? "등록 완료" : "등록 완료 / SAP문서 매칭 없음");
  return true;
}

async function deleteSelectedRows() {
  const ids = tableManager.getSelectedIds().map(v => Number(v));

  if (!ids.length) {
    tableManager.setStatus("삭제할 행 선택");
    return;
  }

  if (!confirm(`${ids.length}건 삭제할까요?`)) return;

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
  tableManager.setStatus("삭제 완료");
}

async function fetchAllRows(tableName) {
  let from = 0;
  let merged = [];

  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;

    const { data, error } = await supabaseClient
      .from(tableName)
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
    const data = await fetchAllRows(TABLE_NAME);
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
    rows = rows.filter(row => {
      return [
        row.id,
        row.invoice,
        row.ship_date,
        row.country,
        row.product_qty,
        row.outer_box_qty,
        row.total_qty,
        row.customer_name,
        row.manager,
        row.user_name,
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
        <td colspan="13" class="table-empty">데이터가 없습니다.</td>
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

  const html = nextRows.map(row => {
    return `
      <tr data-row-id="${row.id}">
        <td><input type="checkbox" class="chk row-chk" data-id="${row.id}"></td>
        ${visibleColumns.map(col => renderCell(col.key, row)).join("")}
      </tr>
    `;
  }).join("");

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
  if (key === "ship_date") return `<td data-col-key="ship_date" class="mono-num">${esc(row.ship_date)}</td>`;
  if (key === "country") return `<td data-col-key="country">${esc(row.country)}</td>`;
  if (key === "product_qty") return `<td data-col-key="product_qty" class="mono-num">${num(row.product_qty)}</td>`;
  if (key === "outer_box_qty") return `<td data-col-key="outer_box_qty" class="mono-num">${num(row.outer_box_qty)}</td>`;
  if (key === "total_qty") return `<td data-col-key="total_qty" class="mono-num">${num(row.total_qty)}</td>`;
  if (key === "customer_name") return `<td data-col-key="customer_name">${esc(row.customer_name)}</td>`;
  if (key === "manager") return `<td data-col-key="manager">${esc(row.manager)}</td>`;
  if (key === "user_name") return `<td data-col-key="user_name">${esc(row.user_name)}</td>`;
  if (key === "note") return `<td data-col-key="note">${esc(row.note)}</td>`;
  if (key === "created_at") return `<td data-col-key="created_at" class="mono-num">${esc(formatDate(row.created_at))}</td>`;
  return "";
}

function downloadExcel() {
  const rows = filteredRowsCache.map(row => ({
    NO: row.no,
    인보이스: row.invoice,
    출고일: row.ship_date,
    국가: row.country,
    제품: row.product_qty,
    외박스: row.outer_box_qty,
    합계: row.total_qty,
    납품처명: row.customer_name,
    담당자: row.manager,
    사용자: row.user_name,
    비고: row.note,
    등록일: formatDate(row.created_at)
  }));

  downloadExcelFile({
    fileName: "label_in.xlsx",
    sheetName: "label_in",
    rows
  });

  tableManager.setStatus("엑셀 다운로드 완료");
}

function onTableScroll() {
  if (!printArea) return;
  if (isAppending) return;
  if (renderedCount >= filteredRowsCache.length) return;

  const remain = printArea.scrollHeight - printArea.scrollTop - printArea.clientHeight;
  if (remain < 300) appendNextRows();
}

function getFormModalHtml() {
  return `
    <div class="wms-form-grid">
      <div class="wms-form-row">
        <label class="wms-form-label" for="f-invoice">인보이스</label>
        <input id="f-invoice" class="wms-form-input" type="text" placeholder="인보이스 입력">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-note">비고</label>
        <input id="f-note" class="wms-form-input" type="text" placeholder="특이사항 입력">
      </div>
    </div>
  `;
}

function getFormElements() {
  return {
    invoice: document.getElementById("f-invoice"),
    note: document.getElementById("f-note")
  };
}

function setFormValues(values) {
  const form = getFormElements();

  form.invoice.value = values.invoice ?? "";
  form.note.value = values.note ?? "";
}

function getFormValues() {
  const form = getFormElements();

  return {
    invoice: form.invoice.value.trim(),
    note: form.note.value.trim()
  };
}

function clean(value) {
  return String(value ?? "").trim();
}

function toInt(value) {
  const n = Number(String(value ?? "").replaceAll(",", "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function formatDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
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