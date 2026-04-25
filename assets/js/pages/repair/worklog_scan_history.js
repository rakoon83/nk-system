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

const TABLE_NAME = "worklog_scan_history";
const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("worklog-tbody");
const printArea = document.getElementById("print-area");

let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;
let filterMode = "date";

createTopbar({
  mountId: "page-topbar",
  title: "작업로그 히스토리",
  subtitle: "90일 이전 보관 내역",
  rightHtml: `<div class="wms-topbar-chip">USER<strong>${esc(currentUserName)}</strong></div>`
});

const toolbar = createToolbar({
  mountId: "worklog-toolbar",
  currentUserName,
  searchPlaceholder: "인보이스 / 코드 / 박스번호 / 자재내역 / 작업자 검색",
  buttons: {
    add: false,
    paste: false,
    edit: false,
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
  tableId: "worklog-table",
  tbodyId: "worklog-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "worklog_scan_history_table_columns_v1",
  defaultSortKey: "created_at",
  defaultSortDir: "desc",
  columns: [
    { key: "list_no", label: "NO", width: 70, visible: true },
    { key: "scan_type", label: "입고검수", width: 90, visible: true },
    { key: "invoice", label: "인보이스", width: 150, visible: true },
    { key: "ship_date", label: "출고일", width: 110, visible: true },
    { key: "country", label: "국가", width: 90, visible: true },
    { key: "location", label: "위치", width: 120, visible: true },
    { key: "material_no", label: "코드", width: 120, visible: true },
    { key: "box_no", label: "박스번호", width: 120, visible: true },
    { key: "material_name", label: "자재내역", width: 260, visible: true },
    { key: "outbound_qty", label: "출고", width: 80, visible: true },
    { key: "inbound_qty", label: "입고", width: 80, visible: true },
    { key: "comparison", label: "비교", width: 100, visible: true },
    { key: "mfg_date", label: "제조일자", width: 120, visible: true },
    { key: "exp_date", label: "유통기한", width: 120, visible: true },
    { key: "product_qty", label: "제품", width: 80, visible: true },
    { key: "outer_box_qty", label: "외박스", width: 80, visible: true },
    { key: "total_qty", label: "합계", width: 90, visible: true },
    { key: "work_type", label: "구분", width: 90, visible: true },
    { key: "check_status", label: "검수", width: 120, visible: true },
    { key: "scan_time", label: "작업시간", width: 160, visible: true },
    { key: "user_name", label: "작업자", width: 140, visible: true }
  ],
  sortMap: {
    list_no: 'thead th[data-col-key="list_no"] .th-inner',
    scan_type: 'thead th[data-col-key="scan_type"] .th-inner',
    invoice: 'thead th[data-col-key="invoice"] .th-inner',
    ship_date: 'thead th[data-col-key="ship_date"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    location: 'thead th[data-col-key="location"] .th-inner',
    material_no: 'thead th[data-col-key="material_no"] .th-inner',
    box_no: 'thead th[data-col-key="box_no"] .th-inner',
    material_name: 'thead th[data-col-key="material_name"] .th-inner',
    outbound_qty: 'thead th[data-col-key="outbound_qty"] .th-inner',
    inbound_qty: 'thead th[data-col-key="inbound_qty"] .th-inner',
    comparison: 'thead th[data-col-key="comparison"] .th-inner',
    mfg_date: 'thead th[data-col-key="mfg_date"] .th-inner',
    exp_date: 'thead th[data-col-key="exp_date"] .th-inner',
    product_qty: 'thead th[data-col-key="product_qty"] .th-inner',
    outer_box_qty: 'thead th[data-col-key="outer_box_qty"] .th-inner',
    total_qty: 'thead th[data-col-key="total_qty"] .th-inner',
    work_type: 'thead th[data-col-key="work_type"] .th-inner',
    check_status: 'thead th[data-col-key="check_status"] .th-inner',
    scan_time: 'thead th[data-col-key="scan_time"] .th-inner',
    user_name: 'thead th[data-col-key="user_name"] .th-inner'
  },
  onSortChange: () => renderTable(true),
  onSelectionChange: (ids) => {
    toolbar.setDisabled("remove", ids.length < 1);
  },
  onColumnChange: () => renderTable(true)
});

init();

async function init() {
  setDefaultDates();
  bindEvents();
  tableManager.init();
  await loadRows();
}

function bindEvents() {
  toolbar.on("remove", deleteSelectedRows);
  toolbar.on("download", downloadExcel);
  toolbar.on("print", () => window.print());

  toolbar.searchInput?.addEventListener("input", () => renderTable(true));

  document.getElementById("btnDateSearch")?.addEventListener("click", () => {
    filterMode = "date";
    loadRows();
  });

  document.getElementById("btnAll")?.addEventListener("click", () => {
    filterMode = "all";
    loadRows();
  });

  if (printArea) {
    printArea.addEventListener("scroll", onTableScroll, { passive: true });
  }
}

function setDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);

  setValue("dateStart", toDateInputText(start));
  setValue("dateEnd", toDateInputText(end));
}

async function loadRows() {
  tableManager.setStatus("불러오는 중...");

  try {
    allRows = await fetchRowsByFilter();
    renderTable(true);
  } catch (error) {
    console.error(error);
    tableManager.setStatus("데이터 조회 실패");
  }
}

async function fetchRowsByFilter() {
  let from = 0;
  let merged = [];

  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;

    let query = supabaseClient
      .from(TABLE_NAME)
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (filterMode === "date") {
      const s = document.getElementById("dateStart")?.value;
      const e = document.getElementById("dateEnd")?.value;
      if (s) query = query.gte("created_at", `${s}T00:00:00`);
      if (e) query = query.lt("created_at", `${addOneDay(e)}T00:00:00`);
    }

    const { data, error } = await query;
    if (error) throw error;

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
    rows = rows.filter(row => {
      return [
        row.list_no,
        row.scan_type,
        row.invoice,
        row.ship_date,
        row.country,
        row.location,
        row.material_no,
        row.box_no,
        row.material_name,
        row.work_type,
        row.check_status,
        row.user_name
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
    tbody.innerHTML = `<tr><td colspan="22" class="table-empty">데이터가 없습니다.</td></tr>`;
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

  const html = nextRows.map((row, index) => `
    <tr data-row-id="${row.id}">
      <td><input type="checkbox" class="chk row-chk" data-id="${row.id}"></td>
      ${visibleColumns.map(col => renderCell(col.key, row, renderedCount + index)).join("")}
    </tr>
  `).join("");

  if (renderedCount === 0) tbody.innerHTML = html;
  else tbody.insertAdjacentHTML("beforeend", html);

  renderedCount += nextRows.length;

  tableManager.refreshAfterRender();
  tableManager.setStatus(`${num(filteredRowsCache.length)}건 / 화면 ${num(renderedCount)}건`);

  isAppending = false;
}

function renderCell(key, row, rowIndex = 0) {
  if (key === "list_no") return `<td data-col-key="list_no" class="mono-num">${rowIndex + 1}</td>`;
  if (key === "scan_type") return `<td data-col-key="scan_type">${esc(row.scan_type)}</td>`;
  if (key === "invoice") return `<td data-col-key="invoice" class="mono-num">${esc(row.invoice)}</td>`;
  if (key === "ship_date") return `<td data-col-key="ship_date" class="mono-num">${esc(row.ship_date)}</td>`;
  if (key === "country") return `<td data-col-key="country">${esc(row.country)}</td>`;
  if (key === "location") return `<td data-col-key="location">${esc(row.location)}</td>`;
  if (key === "material_no") return `<td data-col-key="material_no" class="mono-num">${esc(row.material_no)}</td>`;
  if (key === "box_no") return `<td data-col-key="box_no" class="mono-num">${esc(row.box_no)}</td>`;
  if (key === "material_name") return `<td data-col-key="material_name">${esc(row.material_name)}</td>`;
  if (key === "outbound_qty") return `<td data-col-key="outbound_qty" class="mono-num">${num(row.outbound_qty)}</td>`;
  if (key === "inbound_qty") return `<td data-col-key="inbound_qty" class="mono-num">${num(row.inbound_qty)}</td>`;
  if (key === "comparison") return `<td data-col-key="comparison" class="mono-num">${num(row.comparison)}</td>`;
  if (key === "mfg_date") return `<td data-col-key="mfg_date">${esc(row.mfg_date)}</td>`;
  if (key === "exp_date") return `<td data-col-key="exp_date">${esc(row.exp_date)}</td>`;
  if (key === "product_qty") return `<td data-col-key="product_qty" class="mono-num">${num(row.product_qty)}</td>`;
  if (key === "outer_box_qty") return `<td data-col-key="outer_box_qty" class="mono-num">${num(row.outer_box_qty)}</td>`;
  if (key === "total_qty") return `<td data-col-key="total_qty" class="mono-num">${num(row.total_qty)}</td>`;
  if (key === "work_type") return `<td data-col-key="work_type">${renderWorkType(row.work_type)}</td>`;
  if (key === "check_status") return `<td data-col-key="check_status">${renderCheck(row.check_status)}</td>`;
  if (key === "scan_time") return `<td data-col-key="scan_time" class="mono-num">${esc(formatDateTime(row.scan_time || row.created_at))}</td>`;
  if (key === "user_name") return `<td data-col-key="user_name">${esc(row.user_name)}</td>`;
  return "";
}

function renderWorkType(value) {
  const v = clean(value);
  if (v === "CELL") return `<span class="badge badge-cell">CELL</span>`;
  if (v === "매대") return `<span class="badge badge-rack">매대</span>`;
  if (v === "설비") return `<span class="badge badge-eq">설비</span>`;
  return "";
}

function renderCheck(value) {
  const v = clean(value);
  if (v === "검수완료") return `<span class="badge badge-done">검수완료</span>`;
  if (v === "부분검수") return `<span class="badge badge-part">부분검수</span>`;
  return `<span class="badge badge-wait">대기</span>`;
}

async function deleteSelectedRows() {
  const ids = tableManager.getSelectedIds().map(v => Number(v));

  if (!ids.length) return tableManager.setStatus("삭제할 행 선택");
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

function downloadExcel() {
  const rows = filteredRowsCache.map((row, index) => ({
    NO: index + 1,
    입고검수: row.scan_type,
    인보이스: row.invoice,
    출고일: row.ship_date,
    국가: row.country,
    위치: row.location,
    코드: row.material_no,
    박스번호: row.box_no,
    자재내역: row.material_name,
    출고: row.outbound_qty,
    입고: row.inbound_qty,
    비교: row.comparison,
    제조일자: row.mfg_date,
    유통기한: row.exp_date,
    제품: row.product_qty,
    외박스: row.outer_box_qty,
    합계: row.total_qty,
    구분: row.work_type,
    검수: row.check_status,
    작업시간: formatDateTime(row.scan_time || row.created_at),
    작업자: row.user_name
  }));

  downloadExcelFile({
    fileName: "worklog_scan_history.xlsx",
    sheetName: "history",
    rows
  });

  tableManager.setStatus("엑셀 다운로드 완료");
}

function onTableScroll() {
  if (!printArea || isAppending || renderedCount >= filteredRowsCache.length) return;

  const remain = printArea.scrollHeight - printArea.scrollTop - printArea.clientHeight;
  if (remain < 300) appendNextRows();
}

function addOneDay(value) {
  const d = new Date(`${value}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return toDateInputText(d);
}

function toDateInputText(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

function clean(value) {
  return String(value ?? "").trim();
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 19);
  return d.toLocaleString("ko-KR", { hour12:false });
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