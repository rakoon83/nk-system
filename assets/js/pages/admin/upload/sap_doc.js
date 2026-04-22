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

const TABLE_NAME = "sap_doc";
const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("sap-doc-tbody");
const printArea = document.getElementById("print-area");

let editId = "";
let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

createTopbar({
  mountId: "page-topbar",
  title: "SAP 문서 업로드",
  subtitle: "sap_doc / Supabase 연동",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "sap-doc-toolbar",
  currentUserName,
  searchPlaceholder: "인보이스 / 출고일 / 국가 / 담당자 검색",
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
  tableId: "sap-doc-table",
  tbodyId: "sap-doc-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "sap_doc_table_columns",
  defaultSortKey: "id",
  defaultSortDir: "desc",
  columns: [
    { key: "no", label: "NO", width: 70, visible: true },
    { key: "invoice", label: "인보이스", width: 140, visible: true },
    { key: "ship_date", label: "출고일", width: 110, visible: true },
    { key: "country", label: "국가", width: 120, visible: true },
    { key: "country_key", label: "Country Key", width: 110, visible: true },
    { key: "outbound_qty", label: "출고", width: 90, visible: true },
    { key: "product_qty", label: "제품", width: 90, visible: true },
    { key: "outer_box_qty", label: "외박스", width: 90, visible: true },
    { key: "total_qty", label: "합계", width: 90, visible: true },
    { key: "type", label: "유형", width: 140, visible: true },
    { key: "container", label: "컨테이너", width: 140, visible: true },
    { key: "customer_name", label: "납품처명", width: 220, visible: true },
    { key: "manager", label: "담당자", width: 120, visible: true },
    { key: "created_at", label: "등록일시", width: 180, visible: true }
  ],
  sortMap: {
    no: 'thead th[data-col-key="no"] .th-inner',
    invoice: 'thead th[data-col-key="invoice"] .th-inner',
    ship_date: 'thead th[data-col-key="ship_date"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    country_key: 'thead th[data-col-key="country_key"] .th-inner',
    outbound_qty: 'thead th[data-col-key="outbound_qty"] .th-inner',
    product_qty: 'thead th[data-col-key="product_qty"] .th-inner',
    outer_box_qty: 'thead th[data-col-key="outer_box_qty"] .th-inner',
    total_qty: 'thead th[data-col-key="total_qty"] .th-inner',
    type: 'thead th[data-col-key="type"] .th-inner',
    container: 'thead th[data-col-key="container"] .th-inner',
    customer_name: 'thead th[data-col-key="customer_name"] .th-inner',
    manager: 'thead th[data-col-key="manager"] .th-inner',
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
  modalId: "sap-doc-form-modal",
  title: "개별 등록",
  bodyHtml: getFormModalHtml(),
  confirmText: "저장",
  cancelText: "닫기"
});

const pasteModal = createModal({
  mountId: "modal-root",
  modalId: "sap-doc-paste-modal",
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

    if (merged.length >= 10000) break;
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
        row.country_key,
        row.outbound_qty,
        row.product_qty,
        row.outer_box_qty,
        row.total_qty,
        row.type,
        row.container,
        row.customer_name,
        row.manager,
        row.created_at
      ].some(v => String(v ?? "").toLowerCase().includes(keyword));
    });
  }

  const { sortKey, sortDir } = tableManager.getSortState();

  rows = rows.map((row, index) => ({
    ...row,
    no: rows.length - index
  }));

  rows.sort((a, b) => {
    if (sortKey === "ship_date") {
      return compareShipDate(a.ship_date, b.ship_date, sortDir);
    }
    return compareTableValue(a[sortKey], b[sortKey], sortDir);
  });

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
  if (key === "ship_date") return `<td data-col-key="ship_date">${esc(row.ship_date)}</td>`;
  if (key === "country") return `<td data-col-key="country">${esc(row.country)}</td>`;
  if (key === "country_key") return `<td data-col-key="country_key">${esc(row.country_key)}</td>`;
  if (key === "outbound_qty") return `<td data-col-key="outbound_qty" class="mono-num">${num(row.outbound_qty)}</td>`;
  if (key === "product_qty") return `<td data-col-key="product_qty" class="mono-num">${num(row.product_qty)}</td>`;
  if (key === "outer_box_qty") return `<td data-col-key="outer_box_qty" class="mono-num">${num(row.outer_box_qty)}</td>`;
  if (key === "total_qty") return `<td data-col-key="total_qty" class="mono-num">${num(row.total_qty)}</td>`;
  if (key === "type") return `<td data-col-key="type">${esc(row.type)}</td>`;
  if (key === "container") return `<td data-col-key="container">${esc(row.container)}</td>`;
  if (key === "customer_name") return `<td data-col-key="customer_name">${esc(row.customer_name)}</td>`;
  if (key === "manager") return `<td data-col-key="manager">${esc(row.manager)}</td>`;
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
    country_key: "",
    outbound_qty: "",
    product_qty: "",
    outer_box_qty: "",
    total_qty: "",
    type: "",
    container: "",
    customer_name: "",
    manager: currentUserName
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
    country_key: row.country_key ?? "",
    outbound_qty: row.outbound_qty ?? 0,
    product_qty: row.product_qty ?? 0,
    outer_box_qty: row.outer_box_qty ?? 0,
    total_qty: row.total_qty ?? 0,
    type: row.type ?? "",
    container: row.container ?? "",
    customer_name: row.customer_name ?? "",
    manager: row.manager ?? ""
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
    ship_date: values.ship_date,
    country: values.country,
    country_key: values.country_key,
    outbound_qty: toNumber(values.outbound_qty),
    product_qty: toNumber(values.product_qty),
    outer_box_qty: toNumber(values.outer_box_qty),
    total_qty: toNumber(values.total_qty),
    type: values.type,
    container: values.container,
    customer_name: values.customer_name,
    manager: values.manager
  };

  if (!data.invoice && !data.ship_date && !data.country) {
    tableManager.setStatus("인보이스 / 출고일 / 국가 중 1개 이상 입력");
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
      firstCol === "인보이스" ||
      firstCol.toLowerCase() === "invoice" ||
      secondCol === "출고일" ||
      thirdCol === "국가"
    ) {
      continue;
    }

    const row = {
      invoice: firstCol,
      ship_date: secondCol,
      country: thirdCol,
      country_key: String(cols[3] || "").trim(),
      outbound_qty: toNumber(cols[4]),
      product_qty: toNumber(cols[5]),
      outer_box_qty: toNumber(cols[6]),
      total_qty: toNumber(cols[7]),
      type: String(cols[8] || "").trim(),
      container: String(cols[9] || "").trim(),
      customer_name: String(cols[10] || "").trim(),
      manager: String(cols[11] || "").trim() || currentUserName
    };

    if (row.invoice || row.ship_date || row.country) {
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
    인보이스: row.invoice,
    출고일: row.ship_date,
    국가: row.country,
    "Country Key": row.country_key,
    출고: row.outbound_qty,
    제품: row.product_qty,
    외박스: row.outer_box_qty,
    합계: row.total_qty,
    유형: row.type,
    컨테이너: row.container,
    납품처명: row.customer_name,
    담당자: row.manager,
    등록일시: formatDateTime(row.created_at)
  }));

  downloadExcelFile({
    fileName: "sap_doc.xlsx",
    sheetName: "sap_doc",
    rows
  });

  tableManager.setStatus("엑셀 다운로드 완료");
}

function getFormModalHtml() {
  return `
    <div class="wms-form-grid">
      <div class="wms-form-row">
        <label class="wms-form-label" for="f-invoice">인보이스</label>
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
        <label class="wms-form-label" for="f-country-key">Country Key</label>
        <input id="f-country-key" class="wms-form-input" type="text">
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
        <label class="wms-form-label" for="f-type">유형</label>
        <input id="f-type" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-container">컨테이너</label>
        <input id="f-container" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-customer-name">납품처명</label>
        <input id="f-customer-name" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-manager">담당자</label>
        <input id="f-manager" class="wms-form-input" type="text">
      </div>
    </div>
  `;
}

function getPasteModalHtml() {
  return `
    <textarea id="paste-text" class="wms-form-textarea" placeholder="엑셀에서 복사 후 Ctrl+V"></textarea>
    <div class="wms-help-text">열 순서 : 인보이스 / 출고일 / 국가 / Country Key / 출고 / 제품 / 외박스 / 합계 / 유형 / 컨테이너 / 납품처명 / 담당자</div>
  `;
}

function getFormElements() {
  return {
    invoice: document.getElementById("f-invoice"),
    ship_date: document.getElementById("f-ship-date"),
    country: document.getElementById("f-country"),
    country_key: document.getElementById("f-country-key"),
    outbound_qty: document.getElementById("f-outbound-qty"),
    product_qty: document.getElementById("f-product-qty"),
    outer_box_qty: document.getElementById("f-outer-box-qty"),
    total_qty: document.getElementById("f-total-qty"),
    type: document.getElementById("f-type"),
    container: document.getElementById("f-container"),
    customer_name: document.getElementById("f-customer-name"),
    manager: document.getElementById("f-manager")
  };
}

function setFormValues(values) {
  const form = getFormElements();
  form.invoice.value = values.invoice ?? "";
  form.ship_date.value = values.ship_date ?? "";
  form.country.value = values.country ?? "";
  form.country_key.value = values.country_key ?? "";
  form.outbound_qty.value = values.outbound_qty ?? "";
  form.product_qty.value = values.product_qty ?? "";
  form.outer_box_qty.value = values.outer_box_qty ?? "";
  form.total_qty.value = values.total_qty ?? "";
  form.type.value = values.type ?? "";
  form.container.value = values.container ?? "";
  form.customer_name.value = values.customer_name ?? "";
  form.manager.value = values.manager ?? "";
}

function getFormValues() {
  const form = getFormElements();
  return {
    invoice: form.invoice.value.trim(),
    ship_date: form.ship_date.value.trim(),
    country: form.country.value.trim(),
    country_key: form.country_key.value.trim(),
    outbound_qty: form.outbound_qty.value,
    product_qty: form.product_qty.value,
    outer_box_qty: form.outer_box_qty.value,
    total_qty: form.total_qty.value,
    type: form.type.value.trim(),
    container: form.container.value.trim(),
    customer_name: form.customer_name.value.trim(),
    manager: form.manager.value.trim()
  };
}

function getPasteTextarea() {
  return document.getElementById("paste-text");
}

function compareShipDate(a, b, dir = "asc") {
  const av = parseMonthDay(a);
  const bv = parseMonthDay(b);

  if (av === bv) return 0;
  return dir === "asc" ? av - bv : bv - av;
}

function parseMonthDay(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);

  if (!match) return 999999;

  const month = Number(match[1]);
  const day = Number(match[2]);

  return (month * 100) + day;
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