import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260422";
import { createTopbar } from "/assets/js/shared/topbar.js";
import { createToolbar } from "/assets/js/shared/toolbar.js";
import { createTableManager, compareTableValue } from "/assets/js/shared/table.js";
import { downloadExcelFile } from "/assets/js/shared/excel.js";

checkAuth();
preparePageContent("app-nav", "page-content");
renderNav({ mountId: "app-nav" });

const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE_NAME = "invoice_progress";
const SAP_DOC_TABLE = "sap_doc";
const SAP_ITEM_TABLE = "sap_item";
const SCAN_IN_LOG_TABLE = "scan_in_log";
const REPAIR_LOG_TABLE = "worklog_scan";
const SCAN_OUT_LOG_TABLE = "scan_out_log";
const LOAD_LOG_TABLE = "scan_load_log";

const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("invoice-progress-tbody");
const printArea = document.getElementById("print-area");

let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

let sapItemRows = [];
let scanInRows = [];
let repairRows = [];
let scanOutRows = [];
let scanLoadRows = [];

createTopbar({
  mountId: "page-topbar",
  title: "인보이스 진행현황",
  subtitle: "입고 → 보수 → 출고 → 상차",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "invoice-progress-toolbar",
  currentUserName,
  searchPlaceholder: "로케이션 / 출고일 / 국가 / 유형 / 컨테이너 검색",
  buttons: {
    add: false,
    paste: false,
    edit: false,
    remove: false,
    sum: false,
    download: true,
    print: true,
    config: true,
    search: true,
    currentUser: true
  }
});

const tableManager = createTableManager({
  tableId: "invoice-progress-table",
  tbodyId: "invoice-progress-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "invoice_progress_table_columns",
  defaultSortKey: "ship_date",
  defaultSortDir: "asc",
  columns: [
    { key: "no", label: "NO", width: 60, visible: true },
    { key: "invoice_display", label: "로케이션", width: 160, visible: true },
    { key: "ship_date", label: "출고일", width: 120, visible: true },
    { key: "country", label: "국가", width: 100, visible: true },
    { key: "outbound_qty", label: "출고", width: 100, visible: true },
    { key: "type", label: "유형", width: 100, visible: true },
    { key: "container", label: "컨테이너", width: 150, visible: true },
    { key: "scan_in_status", label: "입고검수", width: 140, visible: true },
    { key: "repair_status", label: "보수검수", width: 140, visible: true },
    { key: "scan_out_status", label: "출고검수", width: 140, visible: true },
    { key: "load_status", label: "상차검수", width: 140, visible: true },
    { key: "row_status", label: "구분", width: 110, visible: true }
  ],
  sortMap: {
    no: 'thead th[data-col-key="no"] .th-inner',
    invoice_display: 'thead th[data-col-key="invoice_display"] .th-inner',
    ship_date: 'thead th[data-col-key="ship_date"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    outbound_qty: 'thead th[data-col-key="outbound_qty"] .th-inner',
    type: 'thead th[data-col-key="type"] .th-inner',
    container: 'thead th[data-col-key="container"] .th-inner',
    scan_in_status: 'thead th[data-col-key="scan_in_status"] .th-inner',
    repair_status: 'thead th[data-col-key="repair_status"] .th-inner',
    scan_out_status: 'thead th[data-col-key="scan_out_status"] .th-inner',
    load_status: 'thead th[data-col-key="load_status"] .th-inner',
    row_status: 'thead th[data-col-key="row_status"] .th-inner'
  },
  onSortChange: () => renderTable(true),
  onColumnChange: () => renderTable(true)
});

init();

async function init() {
  bindEvents();
  tableManager.init();

  try {
    tableManager.setStatus("자동 동기화 중...");
    await syncInvoiceProgress();

    tableManager.setStatus("검수 로그 불러오는 중...");
    await loadBaseData();

    tableManager.setStatus("진행현황 불러오는 중...");
    await loadProgressRows();
  } catch (error) {
    console.error("invoice_progress 오류:", error);
    tableManager.setStatus("오류 발생 - F12 Console 확인");
  }
}

function bindEvents() {
  toolbar.on("download", downloadExcel);
  toolbar.on("print", () => window.print());
  toolbar.searchInput?.addEventListener("input", () => renderTable(true));

  if (printArea) {
    printArea.addEventListener("scroll", onTableScroll, { passive: true });
  }
}

async function syncInvoiceProgress() {
  const sapDocRows = await fetchAllRows(SAP_DOC_TABLE);
  const oldRows = await fetchAllRows(TABLE_NAME);

  if (!sapDocRows.length) return;

  const groups = new Map();

  sapDocRows.forEach(row => {
    const invoice = clean(row.invoice);
    if (!invoice) return;

    if (!groups.has(invoice)) groups.set(invoice, []);
    groups.get(invoice).push(row);
  });

  const activeDisplays = new Set();
  const upsertRows = [];

  for (const [invoice, docs] of groups.entries()) {
    const oldSameInvoice = oldRows.filter(row => clean(row.invoice_base) === invoice);
    const displays = makeDisplayList(invoice, docs.length, oldSameInvoice);

    docs.forEach((doc, index) => {
      const display = displays[index];
      activeDisplays.add(display);

      upsertRows.push({
        invoice_base: invoice,
        invoice_display: display,
        ship_date: clean(doc.ship_date),
        country: clean(doc.country),
        outbound_qty: toNum(doc.outbound_qty),
        type: clean(doc.type),
        container: clean(doc.container),
        row_status: "정상"
      });
    });
  }

  if (upsertRows.length) {
    const { error } = await supabaseClient
      .from(TABLE_NAME)
      .upsert(upsertRows, { onConflict: "invoice_display" });

    if (error) throw error;
  }

  const missingRows = oldRows.filter(row => !activeDisplays.has(clean(row.invoice_display)));

  if (missingRows.length) {
    const updateRows = missingRows.map(row => ({
      invoice_base: row.invoice_base,
      invoice_display: row.invoice_display,
      ship_date: row.ship_date,
      country: row.country,
      outbound_qty: row.outbound_qty,
      type: row.type,
      container: row.container,
      row_status: "확인"
    }));

    const { error } = await supabaseClient
      .from(TABLE_NAME)
      .upsert(updateRows, { onConflict: "invoice_display" });

    if (error) throw error;
  }
}

function makeDisplayList(invoice, count, oldRows) {
  if (count <= 1) {
    const normal = oldRows.find(row => clean(row.invoice_display) === invoice);
    if (normal) return [invoice];

    const first = oldRows[0];
    if (first) return [clean(first.invoice_display)];

    return [invoice];
  }

  const result = [];

  for (let i = 1; i <= count; i++) {
    const display = `${invoice}-${i}`;
    const old = oldRows.find(row => clean(row.invoice_display) === display);
    result.push(old ? clean(old.invoice_display) : display);
  }

  return result;
}

async function loadBaseData() {
  const result = await Promise.all([
    fetchAllRows(SAP_ITEM_TABLE),
    fetchAllRows(SCAN_IN_LOG_TABLE),
    fetchAllRows(REPAIR_LOG_TABLE),
    fetchAllRows(SCAN_OUT_LOG_TABLE),
    fetchAllRows(LOAD_LOG_TABLE)
  ]);

  sapItemRows = result[0];
  scanInRows = result[1];
  repairRows = result[2];
  scanOutRows = result[3];
  scanLoadRows = result[4];
}

async function loadProgressRows() {
  const rows = await fetchAllRows(TABLE_NAME);

  allRows = rows.map(row => {
    const invoice = clean(row.invoice_base);

    return {
      ...row,
      scan_in_status: getItemProgress(invoice, sapItemRows, scanInRows, false),
      repair_status: getItemProgress(invoice, sapItemRows, repairRows, true),
      scan_out_status: getItemProgress(invoice, sapItemRows, scanOutRows, false),
      load_status: getLoadProgress(invoice, sapItemRows, scanLoadRows)
    };
  });

  renderTable(true);
}

function getItemProgress(invoice, itemRows, logRows, repairOnly) {
  let items = itemRows.filter(row => clean(row.invoice) === invoice);

  if (repairOnly) {
    items = items.filter(row => toNum(row.total_qty) > 0);
  }

  const totalSet = new Set(
    items.map(row => clean(row.material_no)).filter(Boolean)
  );

  if (!totalSet.size) {
    return { text: "미검수", done: 0, total: 0, className: "progress-none" };
  }

  const doneSet = new Set();

  logRows.forEach(row => {
    if (clean(row.invoice) !== invoice) return;

    const materialNo = clean(row.material_no);
    if (totalSet.has(materialNo)) {
      doneSet.add(materialNo);
    }
  });

  const done = doneSet.size;
  const total = totalSet.size;

  if (done <= 0) {
    return { text: "미검수", done, total, className: "progress-none" };
  }

  if (done >= total) {
    return { text: "검수완료", done, total, className: "progress-done" };
  }

  return { text: "부분완료", done, total, className: "progress-part" };
}

function getLoadProgress(invoice, itemRows, scanLoadRows) {

  const totalSet = new Set(
    itemRows
      .filter(row => clean(row.invoice) === invoice)
      .map(row => clean(row.material_no))
      .filter(Boolean)
  );

  if (!totalSet.size) {
    return { text: "미검수", done: 0, total: 0, className: "progress-none" };
  }

  const doneSet = new Set();

  scanLoadRows.forEach(row => {

    if (clean(row.invoice) !== invoice) return;

    const materialNo = clean(row.material_no);

    if (totalSet.has(materialNo)) {
      doneSet.add(materialNo);
    }

  });

  const done = doneSet.size;
  const total = totalSet.size;

  if (done <= 0) {
    return { text: "미검수", done, total, className: "progress-none" };
  }

  if (done >= total) {
    return { text: "검수완료", done, total, className: "progress-done" };
  }

  return { text: "부분완료", done, total, className: "progress-part" };
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

    if (error) {
      console.error(`${tableName} 조회 실패`, error);
      return [];
    }

    const rows = Array.isArray(data) ? data : [];
    merged = merged.concat(rows);

    if (rows.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }

  return merged;
}

function getFilteredRows() {
  const keyword = toolbar.getSearchKeyword();
  let rows = [...allRows];

  if (keyword) {
    const key = keyword.toLowerCase();

    rows = rows.filter(row => {
      return [
        row.invoice_base,
        row.invoice_display,
        row.ship_date,
        row.country,
        row.outbound_qty,
        row.type,
        row.container,
        row.row_status
      ].some(v => String(v ?? "").toLowerCase().includes(key));
    });
  }

  const { sortKey, sortDir } = tableManager.getSortState();

  rows.sort((a, b) => {
    const av = isProgressKey(sortKey) ? a[sortKey]?.done : a[sortKey];
    const bv = isProgressKey(sortKey) ? b[sortKey]?.done : b[sortKey];
    return compareTableValue(av, bv, sortDir);
  });

  rows.forEach((row, index) => {
    row.no = index + 1;
  });

  return rows;
}

function isProgressKey(key) {
  return ["scan_in_status", "repair_status", "scan_out_status", "load_status"].includes(key);
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
  if (key === "invoice_display") return `<td data-col-key="invoice_display" class="mono-num">${esc(row.invoice_display)}</td>`;
  if (key === "ship_date") return `<td data-col-key="ship_date" class="mono-num">${esc(row.ship_date)}</td>`;
  if (key === "country") return `<td data-col-key="country">${esc(row.country)}</td>`;
  if (key === "outbound_qty") return `<td data-col-key="outbound_qty" class="mono-num">${num(row.outbound_qty)}</td>`;
  if (key === "type") return `<td data-col-key="type">${esc(row.type)}</td>`;
  if (key === "container") return `<td data-col-key="container">${esc(row.container)}</td>`;

  if (key === "scan_in_status") return renderProgressCell(key, row.scan_in_status);
  if (key === "repair_status") return renderProgressCell(key, row.repair_status);
  if (key === "scan_out_status") return renderProgressCell(key, row.scan_out_status);
  if (key === "load_status") return renderProgressCell(key, row.load_status);

  if (key === "row_status") {
    const status = clean(row.row_status) || "정상";
    const cls = status === "확인" ? "progress-check" : "progress-done";

    return `
      <td data-col-key="row_status">
        <span class="progress-badge ${cls}">${esc(status)}</span>
      </td>
    `;
  }

  return "";
}

function renderProgressCell(key, data) {
  const item = data || { text: "미검수", done: 0, total: 0, className: "progress-none" };

  return `
    <td data-col-key="${esc(key)}">
      <span class="progress-badge ${esc(item.className)}">${esc(item.text)}</span>
      <span class="sub-rate">${num(item.done)} / ${num(item.total)}</span>
    </td>
  `;
}

function onTableScroll() {
  if (!printArea) return;
  if (isAppending) return;
  if (renderedCount >= filteredRowsCache.length) return;

  const remain = printArea.scrollHeight - printArea.scrollTop - printArea.clientHeight;
  if (remain < 300) appendNextRows();
}

function downloadExcel() {
  const rows = filteredRowsCache.map(row => ({
    NO: row.no,
    로케이션: row.invoice_display,
    조회인보이스: row.invoice_base,
    출고일: row.ship_date,
    국가: row.country,
    출고: row.outbound_qty,
    유형: row.type,
    컨테이너: row.container,
    입고검수: `${row.scan_in_status.text} ${row.scan_in_status.done}/${row.scan_in_status.total}`,
    보수검수: `${row.repair_status.text} ${row.repair_status.done}/${row.repair_status.total}`,
    출고검수: `${row.scan_out_status.text} ${row.scan_out_status.done}/${row.scan_out_status.total}`,
    상차검수: `${row.load_status.text} ${row.load_status.done}/${row.load_status.total}`,
    구분: row.row_status
  }));

  downloadExcelFile({
    fileName: "invoice_progress.xlsx",
    sheetName: "invoice_progress",
    rows
  });

  tableManager.setStatus("엑셀 다운로드 완료");
}

function clean(value) {
  return String(value ?? "").trim();
}

function toNum(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^\d.-]/g, ""));
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