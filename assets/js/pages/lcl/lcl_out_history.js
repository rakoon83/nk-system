import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260422";
import { createTopbar } from "/assets/js/shared/topbar.js";
import { createToolbar } from "/assets/js/shared/toolbar.js";
import { createTableManager, compareTableValue } from "/assets/js/shared/table.js";
import { openConfirm } from "/assets/js/shared/modal.js";
import { downloadExcelFile } from "/assets/js/shared/excel.js";

checkAuth();
preparePageContent("app-nav", "page-content");

renderNav({
  mountId: "app-nav"
});

const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE_NAME = "lcl_out_history";
const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("lcl-history-tbody");
const printArea = document.getElementById("print-area");

let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

createTopbar({
  mountId: "page-topbar",
  title: "LCL 출고 이력",
  subtitle: "30일 이전 자동 아카이브 보관자료",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "lcl-history-toolbar",
  currentUserName,
  searchPlaceholder: "인보이스 / 국가 / 출고일 / 납품처명 / 담당자 / 비고 / 사용자 검색",
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
  tableId: "lcl-history-table",
  tbodyId: "lcl-history-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "lcl_out_history_table_columns_v1",
  defaultSortKey: "archived_at",
  defaultSortDir: "desc",
  columns: [
    { key: "no", label: "NO", width: 70, visible: true },
    { key: "status_flag", label: "구분", width: 90, visible: true },
    { key: "shipping_mark", label: "쉬핑마크", width: 100, visible: true },
    { key: "in_check_status", label: "입고검수", width: 100, visible: true },
    { key: "out_check_status", label: "출고검수", width: 100, visible: true },
    { key: "invoice", label: "인보이스", width: 170, visible: true },
    { key: "country", label: "국가", width: 100, visible: true },
    { key: "ship_date", label: "출고일", width: 120, visible: true },
    { key: "pallet_kpp", label: "KPP", width: 90, visible: true },
    { key: "pallet_aj", label: "AJ", width: 90, visible: true },
    { key: "pallet_oneway", label: "일회용", width: 90, visible: true },
    { key: "issue", label: "상세특이사항", width: 260, visible: true },
    { key: "total_qty", label: "합계", width: 100, visible: true },
    { key: "customer_name", label: "납품처명", width: 220, visible: true },
    { key: "manager", label: "담당자", width: 140, visible: true },
    { key: "note", label: "비고", width: 240, visible: true },
    { key: "type", label: "유형", width: 140, visible: true },
    { key: "outbound_qty", label: "수량", width: 100, visible: true },
    { key: "user_name", label: "사용자", width: 140, visible: true },
    { key: "created_at", label: "등록일", width: 170, visible: true },
    { key: "archived_at", label: "아카이브일", width: 170, visible: true }
  ],
  sortMap: {
    no: 'thead th[data-col-key="no"] .th-inner',
    status_flag: 'thead th[data-col-key="status_flag"] .th-inner',
    shipping_mark: 'thead th[data-col-key="shipping_mark"] .th-inner',
    in_check_status: 'thead th[data-col-key="in_check_status"] .th-inner',
    out_check_status: 'thead th[data-col-key="out_check_status"] .th-inner',
    invoice: 'thead th[data-col-key="invoice"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    ship_date: 'thead th[data-col-key="ship_date"] .th-inner',
    pallet_kpp: 'thead th[data-col-key="pallet_kpp"] .th-inner',
    pallet_aj: 'thead th[data-col-key="pallet_aj"] .th-inner',
    pallet_oneway: 'thead th[data-col-key="pallet_oneway"] .th-inner',
    issue: 'thead th[data-col-key="issue"] .th-inner',
    total_qty: 'thead th[data-col-key="total_qty"] .th-inner',
    customer_name: 'thead th[data-col-key="customer_name"] .th-inner',
    manager: 'thead th[data-col-key="manager"] .th-inner',
    note: 'thead th[data-col-key="note"] .th-inner',
    type: 'thead th[data-col-key="type"] .th-inner',
    outbound_qty: 'thead th[data-col-key="outbound_qty"] .th-inner',
    user_name: 'thead th[data-col-key="user_name"] .th-inner',
    created_at: 'thead th[data-col-key="created_at"] .th-inner',
    archived_at: 'thead th[data-col-key="archived_at"] .th-inner'
  },
  onSortChange: () => renderTable(true),
  onSelectionChange: (ids) => {
    toolbar.setDisabled("remove", ids.length < 1);
  },
  onColumnChange: () => renderTable(true)
});

init();

async function init() {
  bindEvents();
  tableManager.init();
  await loadRows();
}

function bindEvents() {
  toolbar.on("remove", deleteSelectedRows);
  toolbar.on("download", downloadExcel);
  toolbar.on("print", () => window.print());

  toolbar.searchInput?.addEventListener("input", () => renderTable(true));

  if (printArea) {
    printArea.addEventListener("scroll", onTableScroll, { passive: true });
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
      .order("archived_at", { ascending: false })
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
    rows = rows.filter(row => {
      const baseInvoice = getBaseInvoice(row.invoice);

      return [
        row.id,
        row.status_flag,
        row.shipping_mark,
        row.in_check_status,
        row.out_check_status,
        row.invoice,
        baseInvoice,
        row.base_invoice,
        row.country,
        row.ship_date,
        row.issue,
        row.total_qty,
        row.customer_name,
        row.manager,
        row.note,
        row.type,
        row.outbound_qty,
        row.user_name,
        row.created_at,
        row.archived_at
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
        <td colspan="22" class="table-empty">데이터가 없습니다.</td>
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
  if (key === "status_flag") return `<td data-col-key="status_flag">${renderStatusBadge(row)}</td>`;
  if (key === "shipping_mark") return `<td data-col-key="shipping_mark">${renderShippingBadge(row)}</td>`;
  if (key === "in_check_status") return `<td data-col-key="in_check_status">${renderCheckBadge(row.in_check_status)}</td>`;
  if (key === "out_check_status") return `<td data-col-key="out_check_status">${renderCheckBadge(row.out_check_status)}</td>`;
  if (key === "invoice") return `<td data-col-key="invoice" class="mono-num">${esc(row.invoice)}</td>`;
  if (key === "country") return `<td data-col-key="country">${esc(row.country)}</td>`;
  if (key === "ship_date") return `<td data-col-key="ship_date" class="mono-num">${esc(row.ship_date)}</td>`;
  if (key === "pallet_kpp") return `<td data-col-key="pallet_kpp" class="mono-num">${num(row.pallet_kpp)}</td>`;
  if (key === "pallet_aj") return `<td data-col-key="pallet_aj" class="mono-num">${num(row.pallet_aj)}</td>`;
  if (key === "pallet_oneway") return `<td data-col-key="pallet_oneway" class="mono-num">${num(row.pallet_oneway)}</td>`;
  if (key === "issue") return `<td data-col-key="issue">${esc(row.issue)}</td>`;
  if (key === "total_qty") return `<td data-col-key="total_qty" class="mono-num">${num(row.total_qty)}</td>`;
  if (key === "customer_name") return `<td data-col-key="customer_name">${esc(row.customer_name)}</td>`;
  if (key === "manager") return `<td data-col-key="manager">${esc(row.manager)}</td>`;
  if (key === "note") return `<td data-col-key="note">${esc(row.note)}</td>`;
  if (key === "type") return `<td data-col-key="type">${esc(row.type)}</td>`;
  if (key === "outbound_qty") return `<td data-col-key="outbound_qty" class="mono-num ${Number(row.outbound_qty || 0) === 0 ? "qty-zero" : ""}">${num(row.outbound_qty)}</td>`;
  if (key === "user_name") return `<td data-col-key="user_name">${esc(row.user_name)}</td>`;
  if (key === "created_at") return `<td data-col-key="created_at" class="mono-num">${esc(formatDate(row.created_at))}</td>`;
  if (key === "archived_at") return `<td data-col-key="archived_at" class="mono-num">${esc(formatDate(row.archived_at))}</td>`;

  return "";
}

function renderStatusBadge(row) {
  if (row.is_missing || clean(row.status_flag) === "확인") {
    return `<span class="badge badge-check">확인</span>`;
  }

  return esc(row.status_flag);
}

function renderShippingBadge(row) {
  const mark = clean(row.shipping_mark) || (clean(row.issue).includes("쉬핑") ? "쉬핑" : "");
  if (!mark) return "";
  return `<span class="badge badge-ship">${esc(mark)}</span>`;
}

function renderCheckBadge(value) {
  const v = clean(value);
  if (v === "검수완료") return `<span class="badge badge-done">검수완료</span>`;
  if (v === "부분검수") return `<span class="badge badge-part">부분검수</span>`;
  return "";
}

async function deleteSelectedRows() {
  const ids = tableManager.getSelectedIds().map(v => Number(v));

  if (!ids.length) {
    tableManager.setStatus("삭제할 이력 선택");
    return;
  }

  openConfirm({
    mountId: "modal-root",
    title: "이력 삭제 확인",
    message: `선택한 ${num(ids.length)}건의 LCL 출고 이력을 삭제할까요?`,
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

function downloadExcel() {
  const rows = filteredRowsCache.map(row => ({
    NO: row.no,
    구분: row.is_missing ? "확인" : row.status_flag,
    쉬핑마크: row.shipping_mark,
    입고검수: row.in_check_status,
    출고검수: row.out_check_status,
    인보이스: row.invoice,
    국가: row.country,
    출고일: row.ship_date,
    KPP: row.pallet_kpp,
    AJ: row.pallet_aj,
    일회용: row.pallet_oneway,
    상세특이사항: row.issue,
    합계: row.total_qty,
    납품처명: row.customer_name,
    담당자: row.manager,
    비고: row.note,
    유형: row.type,
    수량: row.outbound_qty,
    사용자: row.user_name,
    등록일: formatDate(row.created_at),
    아카이브일: formatDate(row.archived_at)
  }));

  downloadExcelFile({
    fileName: "lcl_out_history.xlsx",
    sheetName: "lcl_out_history",
    rows
  });

  tableManager.setStatus("엑셀 다운로드 완료");
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

function getBaseInvoice(value) {
  return clean(value).replace(/-\d+$/, "");
}

function clean(value) {
  return String(value ?? "").trim();
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