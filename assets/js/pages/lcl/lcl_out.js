import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260422";
import { createTopbar } from "/assets/js/shared/topbar.js";
import { createToolbar } from "/assets/js/shared/toolbar.js";
import { createTableManager, compareTableValue } from "/assets/js/shared/table.js";
import { createModal } from "/assets/js/shared/modal.js";
import { downloadExcelFile } from "/assets/js/shared/excel.js";

checkAuth();
preparePageContent("app-nav", "page-content");

renderNav({ mountId: "app-nav" });

const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE_NAME = "lcl_out";
const SAP_DOC_TABLE = "sap_doc";
const SAP_ITEM_TABLE = "sap_item";
const SPECIAL_NOTE_TABLE = "special_note";
const SCAN_IN_LOG_TABLE = "scan_in_log";
const SCAN_OUT_LOG_TABLE = "scan_out_log";

const TARGET_TYPE = "배송 의뢰서";
const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("lcl-out-tbody");
const printArea = document.getElementById("print-area");

let editId = "";
let allRows = [];
let sapDocRows = [];
let sapItemRows = [];
let specialNoteRows = [];
let scanInRows = [];
let scanOutRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

createTopbar({
  mountId: "page-topbar",
  title: "LCL 출고",
  subtitle: "조회는 저장된 결과만 / 결과갱신 시 원본 반영",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "lcl-out-toolbar",
  currentUserName,
  searchPlaceholder: "인보이스 / 국가 / 출고일 / 납품처명 / 담당자 / 비고 검색",
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
  tableId: "lcl-out-table",
  tbodyId: "lcl-out-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "lcl_out_table_columns_v4",
  defaultSortKey: "ship_date",
  defaultSortDir: "desc",
  columns: [
    { key: "status_flag", label: "구분", width: 80, visible: true },
    { key: "shipping_mark", label: "쉬핑마크", width: 90, visible: true },
    { key: "scan_in_status", label: "입고검수", width: 100, visible: true },
    { key: "scan_out_status", label: "출고검수", width: 100, visible: true },
    { key: "outbound_status", label: "출고구분", width: 110, visible: true },

    { key: "invoice", label: "인보이스", width: 170, visible: true },
    { key: "country", label: "국가", width: 100, visible: true },
    { key: "ship_date", label: "출고일", width: 120, visible: true },
    { key: "outbound_qty", label: "수량", width: 100, visible: true },

    { key: "pallet_kpp", label: "KPP", width: 70, visible: true },
    { key: "pallet_aj", label: "AJ", width: 70, visible: true },
    { key: "pallet_oneway", label: "일회용", width: 70, visible: true },
    { key: "total_qty", label: "합계", width: 100, visible: true },

    { key: "issue", label: "상세특이사항", width: 260, visible: true },
    { key: "customer_name", label: "납품처명", width: 220, visible: true },
    { key: "manager", label: "담당자", width: 140, visible: true },
    { key: "note", label: "비고", width: 240, visible: true },
    { key: "type", label: "유형", width: 140, visible: true },
    { key: "user_name", label: "사용자", width: 140, visible: true },
    { key: "created_at", label: "등록일", width: 170, visible: true }
  ],
  sortMap: {
    status_flag: 'thead th[data-col-key="status_flag"] .th-inner',
    shipping_mark: 'thead th[data-col-key="shipping_mark"] .th-inner',
    scan_in_status: 'thead th[data-col-key="scan_in_status"] .th-inner',
    scan_out_status: 'thead th[data-col-key="scan_out_status"] .th-inner',
    outbound_status: 'thead th[data-col-key="outbound_status"] .th-inner',

    invoice: 'thead th[data-col-key="invoice"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    outbound_qty: 'thead th[data-col-key="outbound_qty"] .th-inner',
    ship_date: 'thead th[data-col-key="ship_date"] .th-inner',

    pallet_kpp: 'thead th[data-col-key="pallet_kpp"] .th-inner',
    pallet_aj: 'thead th[data-col-key="pallet_aj"] .th-inner',
    pallet_oneway: 'thead th[data-col-key="pallet_oneway"] .th-inner',
    total_qty: 'thead th[data-col-key="total_qty"] .th-inner',

    issue: 'thead th[data-col-key="issue"] .th-inner',
    customer_name: 'thead th[data-col-key="customer_name"] .th-inner',
    manager: 'thead th[data-col-key="manager"] .th-inner',
    note: 'thead th[data-col-key="note"] .th-inner',
    type: 'thead th[data-col-key="type"] .th-inner',
    user_name: 'thead th[data-col-key="user_name"] .th-inner',
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
  modalId: "lcl-out-form-modal",
  title: "LCL 출고 등록",
  bodyHtml: getFormModalHtml(),
  confirmText: "저장",
  cancelText: "닫기"
});

init();

async function init() {
  bindEvents();
  tableManager.init();

  await archiveOldRows();
  await loadRows();
}

function bindEvents() {
  toolbar.on("add", openAddModal);
  toolbar.on("edit", editSelectedRow);
  toolbar.on("remove", deleteSelectedRows);
  toolbar.on("download", downloadExcel);
  toolbar.on("print", printTable);

  toolbar.searchInput?.addEventListener("input", () => renderTable(true));
  formModal.onConfirm(() => saveFormRow());

  if (printArea) {
    printArea.addEventListener("scroll", onTableScroll, { passive: true });
  }

  addRefreshButton();
  tbody.addEventListener("click", onTableClick);
}

function addRefreshButton() {
  const toolbarEl = document.getElementById("lcl-out-toolbar");
  if (!toolbarEl) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn";
  btn.textContent = "결과갱신";
  btn.title = "SAP / 특이사항 / 검수로그 반영";
  btn.addEventListener("click", refreshResult);

  toolbarEl.appendChild(btn);
}

async function refreshResult() {
  tableManager.setStatus("결과갱신 중...");

  sapDocRows = await fetchAllRows(SAP_DOC_TABLE);
  sapItemRows = await fetchAllRows(SAP_ITEM_TABLE);
  specialNoteRows = await fetchAllRows(SPECIAL_NOTE_TABLE);
  scanInRows = await safeFetchAllRows(SCAN_IN_LOG_TABLE);
  scanOutRows = await safeFetchAllRows(SCAN_OUT_LOG_TABLE);

  await syncFromSapDoc();
  await loadRows();

  tableManager.setStatus("결과갱신 완료");
}

async function archiveOldRows() {
  try {
    await supabaseClient.rpc("archive_lcl_out_old");
  } catch (error) {
    console.error(error);
  }
}

async function syncFromSapDoc() {
  const oldRows = await fetchAllRows(TABLE_NAME);
  const targetSapRows = sapDocRows.filter(row => clean(row.type).includes(TARGET_TYPE));
  const desiredRows = makeDesiredRows(targetSapRows);

  const oldByKey = new Map();
  oldRows.forEach(row => {
    if (clean(row.source_key)) oldByKey.set(clean(row.source_key), row);
  });

  const desiredKeySet = new Set();
  const inserts = [];
  const updates = [];

  desiredRows.forEach(item => {
    desiredKeySet.add(item.source_key);
    const old = oldByKey.get(item.source_key);

    if (!old) {
      inserts.push({
        ...item,
        user_name: currentUserName
      });
      return;
    }

    const updateData = {
      status_flag: "",
      shipping_mark: item.shipping_mark,
      scan_in_status: item.scan_in_status,
      scan_out_status: item.scan_out_status,
      base_invoice: item.base_invoice,
      invoice: item.invoice,
      country: item.country,
      ship_date: item.ship_date,
      total_qty: item.total_qty,
      issue: item.issue,
      customer_name: item.customer_name,
      manager: item.manager,
      type: item.type,
      outbound_qty: item.outbound_qty,
      is_missing: false
    };

    if (hasChanged(old, updateData)) {
      updates.push({ id: old.id, updateData });
    }
  });

  const missingUpdates = oldRows
    .filter(row => clean(row.source_key) && !desiredKeySet.has(clean(row.source_key)) && !row.is_missing)
    .map(row => ({
      id: row.id,
      updateData: {
        status_flag: "확인",
        is_missing: true
      }
    }));

  for (const row of inserts) {
    await supabaseClient.from(TABLE_NAME).insert([row]);
  }

  for (const item of updates.concat(missingUpdates)) {
    await supabaseClient
      .from(TABLE_NAME)
      .update(item.updateData)
      .eq("id", item.id);
  }

  tableManager.setStatus(`신규 ${num(inserts.length)}건 / 수정 ${num(updates.length)}건 / 확인 ${num(missingUpdates.length)}건`);
}

function makeDesiredRows(rows) {
  const grouped = new Map();

  rows.forEach(row => {
    const baseInvoice = clean(row.invoice);
    if (!baseInvoice) return;

    if (!grouped.has(baseInvoice)) grouped.set(baseInvoice, []);
    grouped.get(baseInvoice).push(row);
  });

  const result = [];

  grouped.forEach((items, baseInvoice) => {
    const isDup = items.length > 1;

    items.forEach((sap, index) => {
      const seq = index + 1;
      const invoice = isDup ? `${baseInvoice}-${seq}` : baseInvoice;
      const issue = findIssue(baseInvoice);
      const outboundQty = getOutboundQty(baseInvoice);
      const checkBase = outboundQty || toInt(sap.total_qty);

      result.push({
        source_key: `${baseInvoice}::${seq}`,
        status_flag: "",
        shipping_mark: issue.includes("쉬핑") ? "쉬핑" : "",
        scan_in_status: getCheckStatus(baseInvoice, checkBase, scanInRows),
        scan_out_status: getCheckStatus(baseInvoice, checkBase, scanOutRows),
        outbound_status: "출고대기",
        base_invoice: baseInvoice,
        invoice,
        country: clean(sap.country),
        ship_date: clean(sap.ship_date),
        pallet_kpp: 0,
        pallet_aj: 0,
        pallet_oneway: 0,
        total_qty: toInt(sap.total_qty),
        issue,
        customer_name: clean(sap.customer_name),
        manager: clean(sap.manager),
        note: "",
        type: clean(sap.type),
        outbound_qty: outboundQty,
        is_missing: false
      });
    });
  });

  return result;
}

function findIssue(baseInvoice) {
  const key = clean(baseInvoice);
  if (!key) return "";

  const row = specialNoteRows.find(item => clean(item.invoice) === key);
  if (!row) return "";

  return clean(row.issue) || clean(row.base_issue);
}

function getOutboundQty(baseInvoice) {
  return sapItemRows
    .filter(row => clean(row.invoice) === clean(baseInvoice))
    .reduce((sum, row) => sum + toInt(row.outbound_qty), 0);
}

function getCheckStatus(baseInvoice, totalQty, logRows) {
  const count = logRows.filter(row => clean(row.invoice) === clean(baseInvoice)).length;

  if (count <= 0) return "";
  if (totalQty > 0 && count >= totalQty) return "검수완료";
  return "부분검수";
}

function hasChanged(oldRow, newRow) {
  return Object.keys(newRow).some(key => {
    if (["total_qty", "outbound_qty"].includes(key)) {
      return Number(oldRow[key] || 0) !== Number(newRow[key] || 0);
    }

    if (key === "is_missing") {
      return Boolean(oldRow[key]) !== Boolean(newRow[key]);
    }

    return clean(oldRow[key]) !== clean(newRow[key]);
  });
}

function openAddModal() {
  editId = "";
  formModal.setTitle("LCL 출고 신규등록");

  setFormValues({
    invoice: "",
    country: "",
    ship_date: "",
    pallet_kpp: 0,
    pallet_aj: 0,
    pallet_oneway: 0,
    total_qty: 0,
    issue: "",
    customer_name: "",
    manager: "",
    note: "",
    type: TARGET_TYPE,
    outbound_qty: 0
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
  formModal.setTitle("LCL 출고 수정");

  setFormValues(row);
  formModal.open();
}

async function saveFormRow() {
  const values = getFormValues();

  if (!values.invoice) {
    tableManager.setStatus("인보이스 입력 필요");
    return false;
  }

  const baseInvoice = getBaseInvoice(values.invoice);

  const data = {
    base_invoice: baseInvoice,
    invoice: values.invoice,
    country: values.country,
    ship_date: values.ship_date,
    pallet_kpp: toInt(values.pallet_kpp),
    pallet_aj: toInt(values.pallet_aj),
    pallet_oneway: toInt(values.pallet_oneway),
    total_qty: toInt(values.total_qty),
    issue: values.issue,
    customer_name: values.customer_name,
    manager: values.manager,
    note: values.note,
    type: values.type || TARGET_TYPE,
    outbound_qty: toInt(values.outbound_qty),
    shipping_mark: values.issue.includes("쉬핑") ? "쉬핑마크" : "",
    user_name: currentUserName
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
    .insert([{
      ...data,
      source_key: null,
      status_flag: "",
      outbound_status: "출고대기",
      is_missing: false
    }]);

  if (error) {
    console.error(error);
    tableManager.setStatus("등록 실패");
    return false;
  }

  await loadRows();
  tableManager.setStatus("등록 완료");
  return true;
}

async function onTableClick(e) {
  const btn = e.target.closest(".out-btn");
  if (!btn) return;

  const id = Number(btn.dataset.id);
  const current = clean(btn.dataset.status);
  const next = current === "출고완료" ? "출고대기" : "출고완료";

  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .update({
      outbound_status: next,
      user_name: currentUserName
    })
    .eq("id", id);

  if (error) {
    console.error(error);
    tableManager.setStatus("출고구분 변경 실패");
    return;
  }

  const row = allRows.find(item => Number(item.id) === id);
  if (row) {
    row.outbound_status = next;
    row.user_name = currentUserName;
  }

  renderTable(true);
  tableManager.setStatus(`${next} 변경 완료`);
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

async function safeFetchAllRows(tableName) {
  try {
    return await fetchAllRows(tableName);
  } catch (error) {
    console.warn(`${tableName} 조회 실패`, error);
    return [];
  }
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
      const baseInvoice = getBaseInvoice(row.invoice);

      return [
        row.status_flag,
        row.shipping_mark,
        row.scan_in_status,
        row.scan_out_status,
        row.outbound_status,
        row.invoice,
        baseInvoice,
        row.base_invoice,
        row.country,
        row.outbound_qty,
        row.ship_date,
        row.issue,
        row.total_qty,
        row.customer_name,
        row.manager,
        row.note,
        row.type,
        row.user_name,
        row.created_at
      ].some(v => String(v ?? "").toLowerCase().includes(keyword));
    });
  }

  const { sortKey, sortDir } = tableManager.getSortState();

  rows.sort((a, b) => compareTableValue(a[sortKey], b[sortKey], sortDir));

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
        <td colspan="21" class="table-empty">데이터가 없습니다.</td>
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
  if (key === "status_flag") return `<td data-col-key="status_flag">${renderStatusBadge(row)}</td>`;
  if (key === "shipping_mark") return `<td data-col-key="shipping_mark">${renderShippingBadge(row)}</td>`;
  if (key === "scan_in_status") return `<td data-col-key="scan_in_status">${renderCheckBadge(row.scan_in_status)}</td>`;
  if (key === "scan_out_status") return `<td data-col-key="scan_out_status">${renderCheckBadge(row.scan_out_status)}</td>`;
  if (key === "outbound_status") return `<td data-col-key="outbound_status">${renderOutboundButton(row)}</td>`;

  if (key === "invoice") return `<td data-col-key="invoice" class="mono-num">${esc(row.invoice)}</td>`;
  if (key === "country") return `<td data-col-key="country">${esc(row.country)}</td>`;
  if (key === "outbound_qty") return `<td data-col-key="outbound_qty" class="mono-num ${Number(row.outbound_qty || 0) === 0 ? "qty-zero" : ""}">${num(row.outbound_qty)}</td>`;
  if (key === "ship_date") return `<td data-col-key="ship_date" class="mono-num">${esc(row.ship_date)}</td>`;

  if (key === "pallet_kpp") return `<td data-col-key="pallet_kpp" class="mono-num">${displayZeroDash(row.pallet_kpp)}</td>`;
  if (key === "pallet_aj") return `<td data-col-key="pallet_aj" class="mono-num">${displayZeroDash(row.pallet_aj)}</td>`;
  if (key === "pallet_oneway") return `<td data-col-key="pallet_oneway" class="mono-num">${displayZeroDash(row.pallet_oneway)}</td>`;
  if (key === "total_qty") return `<td data-col-key="total_qty" class="mono-num">${num(row.total_qty)}</td>`;

  if (key === "issue") return `<td data-col-key="issue">${esc(row.issue)}</td>`;
  if (key === "customer_name") return `<td data-col-key="customer_name">${esc(row.customer_name)}</td>`;
  if (key === "manager") return `<td data-col-key="manager">${esc(row.manager)}</td>`;
  if (key === "note") return `<td data-col-key="note">${esc(row.note)}</td>`;
  if (key === "type") return `<td data-col-key="type">${esc(row.type)}</td>`;
  if (key === "user_name") return `<td data-col-key="user_name">${esc(row.user_name)}</td>`;
  if (key === "created_at") return `<td data-col-key="created_at" class="mono-num">${esc(formatDate(row.created_at))}</td>`;

  return "";
}

function renderStatusBadge(row) {
  if (row.is_missing || clean(row.status_flag) === "확인") {
    return `<span class="badge badge-check">확인</span>`;
  }

  if (isNewRow(row.created_at)) {
    return `<span class="badge badge-new">신규</span>`;
  }

  return "";
}

function renderShippingBadge(row) {

  const saved = clean(row.shipping_mark);
  const issue = clean(row.issue);

  if (saved || issue.includes("쉬핑")) {
    return `<span class="badge badge-ship">쉬핑마크</span>`;
  }

  return "";
}

function renderCheckBadge(value) {
  const v = clean(value);
  if (v === "검수완료") return `<span class="badge badge-done">검수완료</span>`;
  if (v === "부분검수") return `<span class="badge badge-part">부분검수</span>`;
  return "";
}

function renderOutboundButton(row) {
  const status = clean(row.outbound_status) || "출고대기";
  const cls = status === "출고완료" ? "done" : "";

  return `
    <button type="button" class="out-btn ${cls}" data-id="${row.id}" data-status="${esc(status)}">
      ${esc(status)}
    </button>
  `;
}

function printTable() {
  const rows = document.querySelectorAll("#lcl-out-table tbody tr");

  rows.forEach(tr => {
    const status = tr.querySelector(".out-btn")?.innerText || "";
    if (status.includes("출고완료")) {
      tr.style.display = "none";
    }
  });

  window.print();

  rows.forEach(tr => {
    tr.style.display = "";
  });
}

function downloadExcel() {
  const rows = filteredRowsCache.map(row => ({
    구분: row.is_missing ? "확인" : (isNewRow(row.created_at) ? "신규" : ""),
    쉬핑마크: row.shipping_mark,
    입고검수: row.scan_in_status,
    출고검수: row.scan_out_status,
    출고구분: row.outbound_status,
    인보이스: row.invoice,
    국가: row.country,
    수량: row.outbound_qty,
    출고일: row.ship_date,
    KPP: row.pallet_kpp,
    AJ: row.pallet_aj,
    일회용: row.pallet_oneway,
    합계: row.total_qty,
    상세특이사항: row.issue,
    납품처명: row.customer_name,
    담당자: row.manager,
    비고: row.note,
    유형: row.type,
    사용자: row.user_name,
    등록일: formatDate(row.created_at)
  }));

  downloadExcelFile({
    fileName: "lcl_out.xlsx",
    sheetName: "lcl_out",
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

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-country">국가</label>
        <input id="f-country" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-outbound-qty">수량</label>
        <input id="f-outbound-qty" class="wms-form-input" type="number">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-ship-date">출고일</label>
        <input id="f-ship-date" class="wms-form-input" type="text" placeholder="2026-04-25">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-pallet-kpp">KPP</label>
        <input id="f-pallet-kpp" class="wms-form-input" type="number">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-pallet-aj">AJ</label>
        <input id="f-pallet-aj" class="wms-form-input" type="number">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-pallet-oneway">일회용</label>
        <input id="f-pallet-oneway" class="wms-form-input" type="number">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-total-qty">합계</label>
        <input id="f-total-qty" class="wms-form-input" type="number">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-customer-name">납품처명</label>
        <input id="f-customer-name" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-manager">담당자</label>
        <input id="f-manager" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-type">유형</label>
        <input id="f-type" class="wms-form-input" type="text" value="배송 의뢰서">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-issue">상세특이사항</label>
        <input id="f-issue" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-note">비고</label>
        <input id="f-note" class="wms-form-input" type="text" placeholder="사용자 입력">
      </div>
    </div>
  `;
}

function getFormElements() {
  return {
    invoice: document.getElementById("f-invoice"),
    country: document.getElementById("f-country"),
    outbound_qty: document.getElementById("f-outbound-qty"),
    ship_date: document.getElementById("f-ship-date"),
    pallet_kpp: document.getElementById("f-pallet-kpp"),
    pallet_aj: document.getElementById("f-pallet-aj"),
    pallet_oneway: document.getElementById("f-pallet-oneway"),
    total_qty: document.getElementById("f-total-qty"),
    issue: document.getElementById("f-issue"),
    customer_name: document.getElementById("f-customer-name"),
    manager: document.getElementById("f-manager"),
    note: document.getElementById("f-note"),
    type: document.getElementById("f-type")
  };
}

function setFormValues(values) {
  const form = getFormElements();

  form.invoice.value = values.invoice ?? "";
  form.country.value = values.country ?? "";
  form.outbound_qty.value = values.outbound_qty ?? 0;
  form.ship_date.value = values.ship_date ?? "";
  form.pallet_kpp.value = values.pallet_kpp ?? 0;
  form.pallet_aj.value = values.pallet_aj ?? 0;
  form.pallet_oneway.value = values.pallet_oneway ?? 0;
  form.total_qty.value = values.total_qty ?? 0;
  form.issue.value = values.issue ?? "";
  form.customer_name.value = values.customer_name ?? "";
  form.manager.value = values.manager ?? "";
  form.note.value = values.note ?? "";
  form.type.value = values.type ?? TARGET_TYPE;
}

function getFormValues() {
  const form = getFormElements();

  return {
    invoice: form.invoice.value.trim(),
    country: form.country.value.trim(),
    outbound_qty: form.outbound_qty.value.trim(),
    ship_date: form.ship_date.value.trim(),
    pallet_kpp: form.pallet_kpp.value.trim(),
    pallet_aj: form.pallet_aj.value.trim(),
    pallet_oneway: form.pallet_oneway.value.trim(),
    total_qty: form.total_qty.value.trim(),
    issue: form.issue.value.trim(),
    customer_name: form.customer_name.value.trim(),
    manager: form.manager.value.trim(),
    note: form.note.value.trim(),
    type: form.type.value.trim()
  };
}

function getBaseInvoice(value) {
  return clean(value).replace(/-\d+$/, "");
}

function isNewRow(createdAt) {
  if (!createdAt) return false;

  const created = new Date(createdAt).getTime();
  const now = Date.now();

  if (!Number.isFinite(created)) return false;

  return now - created <= 24 * 60 * 60 * 1000;
}

function displayZeroDash(value) {
  const n = Number(value || 0);
  if (!n) return "-";
  return n.toLocaleString("ko-KR");
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