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

const TABLE_NAME = "scan_in_log";
const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("scan-log-tbody");
const printArea = document.getElementById("print-area");

const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const rankList = document.getElementById("rank-list");
const speedList = document.getElementById("speed-list");

let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

createTopbar({
  mountId: "page-topbar",
  title: "입고 검수 로그",
  subtitle: "검수 이력 / 사용자 순위 / 검수속도",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "scan-log-toolbar",
  currentUserName,
  searchPlaceholder: "Invoice / 국가 / 출고일 / 사용자 / 번호 / 검수 / 박스번호 / 코드 / 자재내역 / 바코드 검색",
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
  tableId: "scan-log-table",
  tbodyId: "scan-log-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "scan_in_log_table_columns_v2",
  defaultSortKey: "created_at",
  defaultSortDir: "desc",
  columns: [
    { key: "no", label: "NO", width: 70, visible: true },
    { key: "invoice", label: "Invoice", width: 150, visible: true },
    { key: "country", label: "국가", width: 100, visible: true },
    { key: "ship_date", label: "출고일", width: 130, visible: true },
    { key: "scan_user", label: "사용자", width: 130, visible: true },
    { key: "list_no", label: "번호", width: 90, visible: true },
    { key: "scan_status", label: "검수", width: 140, visible: true },
    { key: "box_no", label: "박스번호", width: 160, visible: true },
    { key: "material_no", label: "코드", width: 150, visible: true },
    { key: "material_name", label: "자재내역", width: 320, visible: true },
    { key: "barcode", label: "바코드", width: 180, visible: true },
    { key: "location", label: "상차위치", width: 150, visible: true },
    { key: "container", label: "컨테이너", width: 150, visible: true },
    { key: "created_at", label: "검수일시", width: 180, visible: true }
  ],
  sortMap: {
    no: 'thead th[data-col-key="no"] .th-inner',
    invoice: 'thead th[data-col-key="invoice"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    ship_date: 'thead th[data-col-key="ship_date"] .th-inner',
    scan_user: 'thead th[data-col-key="scan_user"] .th-inner',
    list_no: 'thead th[data-col-key="list_no"] .th-inner',
    scan_status: 'thead th[data-col-key="scan_status"] .th-inner',
    box_no: 'thead th[data-col-key="box_no"] .th-inner',
    material_no: 'thead th[data-col-key="material_no"] .th-inner',
    material_name: 'thead th[data-col-key="material_name"] .th-inner',
    barcode: 'thead th[data-col-key="barcode"] .th-inner',
    location: 'thead th[data-col-key="location"] .th-inner',
    container: 'thead th[data-col-key="container"] .th-inner',
    created_at: 'thead th[data-col-key="created_at"] .th-inner'
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

  addDeleteOldButton();
}

function addDeleteOldButton() {
  const toolbarEl = document.getElementById("scan-log-toolbar");
  if (!toolbarEl) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn";
  btn.textContent = "60일삭제";
  btn.title = "60일 이전 로그 삭제";
  btn.addEventListener("click", deleteOldRows);

  toolbarEl.appendChild(btn);
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
    allRows = Array.isArray(data) ? removeSameDuplicateLogs(data) : [];
    renderTable(true);
  } catch (error) {
    console.error(error);
    tableManager.setStatus("데이터 조회 실패");
  }
}

function removeSameDuplicateLogs(rows) {
  const seen = new Set();

  return rows.filter(row => {
    const key = [
      clean(row.invoice),
      clean(row.material_no),
      clean(row.box_no),
      clean(row.barcode),
      clean(row.scan_user)
    ].join("|");

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function getFilteredRows() {
  const keyword = toolbar.getSearchKeyword();
  let rows = [...allRows];

  if (keyword) {
    rows = rows.filter(row => {
      return [
        row.id,
        row.invoice,
        row.country,
        row.ship_date,
        row.scan_user,
        row.list_no,
        row.scan_status,
        row.box_no,
        row.material_no,
        row.material_name,
        row.barcode,
        row.location,
        row.container,
        row.created_at
      ].some(v => String(v ?? "").toLowerCase().includes(keyword));
    });
  }

  renderSummary(rows);

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

function renderSummary(rows) {
  const total = rows.length;
  const done = rows.filter(row =>
    clean(row.scan_status) === "입고검수완료" ||
    clean(row.scan_status) === "검수완료" ||
    clean(row.scan_status) === "부분입고검수"
  ).length;

  const percent = total ? Math.round((done / total) * 100) : 0;

  progressBar.style.width = `${percent}%`;
  progressText.textContent = `${num(done)} / ${num(total)}건 (${percent}%)`;

  renderRank(rows);
  renderSpeed(rows);
}

function renderRank(rows) {
  const map = new Map();

  rows.forEach(row => {
    const user = clean(row.scan_user) || "-";
    map.set(user, (map.get(user) || 0) + 1);
  });

  const rank = [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  rankList.innerHTML = rank.length
    ? rank.map((item, idx) => `${idx + 1}. ${esc(item[0])} ${num(item[1])}건`).join("<br>")
    : "-";
}

function renderSpeed(rows) {
  const map = new Map();

  rows.forEach(row => {
    const user = clean(row.scan_user) || "-";
    const hour = getHourText(row.created_at);
    const key = `${user}|${hour}`;

    map.set(key, (map.get(key) || 0) + 1);
  });

  const speed = [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  speedList.innerHTML = speed.length
    ? speed.map(([key, count]) => {
        const [user, hour] = key.split("|");
        return `${esc(user)} / ${esc(hour)}시 : ${num(count)}건`;
      }).join("<br>")
    : "-";
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
  if (key === "country") return `<td data-col-key="country">${esc(row.country)}</td>`;
  if (key === "ship_date") return `<td data-col-key="ship_date" class="mono-num">${esc(row.ship_date)}</td>`;
  if (key === "scan_user") return `<td data-col-key="scan_user">${esc(row.scan_user)}</td>`;
  if (key === "list_no") return `<td data-col-key="list_no" class="mono-num">${esc(row.list_no)}</td>`;

  if (key === "scan_status") {
    const status = clean(row.scan_status);
    const cls = status.includes("부분") ? "part" : status ? "done" : "etc";
    return `<td data-col-key="scan_status"><span class="status-badge ${cls}">${esc(status)}</span></td>`;
  }

  if (key === "box_no") return `<td data-col-key="box_no" class="mono-num">${esc(row.box_no)}</td>`;
  if (key === "material_no") return `<td data-col-key="material_no" class="mono-num">${esc(row.material_no)}</td>`;
  if (key === "material_name") return `<td data-col-key="material_name">${esc(row.material_name)}</td>`;
  if (key === "barcode") return `<td data-col-key="barcode" class="mono-num">${esc(row.barcode)}</td>`;
  if (key === "location") return `<td data-col-key="location">${esc(row.location)}</td>`;
  if (key === "container") return `<td data-col-key="container">${esc(row.container)}</td>`;
  if (key === "created_at") return `<td data-col-key="created_at" class="mono-num">${esc(formatDateTime(row.created_at))}</td>`;

  return "";
}

function getSelectedIds() {
  return tableManager.getSelectedIds().map(v => Number(v));
}

async function deleteSelectedRows() {
  const ids = getSelectedIds();

  if (!ids.length) {
    tableManager.setStatus("삭제할 로그를 선택");
    return;
  }

  openConfirm({
    mountId: "modal-root",
    title: "삭제 확인",
    message: `선택한 ${num(ids.length)}건의 검수 로그를 삭제할까요?`,
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

async function deleteOldRows() {
  openConfirm({
    mountId: "modal-root",
    title: "60일 이전 로그 삭제",
    message: "60일 이전 검수 로그를 삭제할까요?",
    onConfirm: async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 60);

      const { error } = await supabaseClient
        .from(TABLE_NAME)
        .delete()
        .lt("created_at", cutoff.toISOString());

      if (error) {
        console.error(error);
        tableManager.setStatus("60일 이전 삭제 실패");
        return;
      }

      await loadRows();
      tableManager.setStatus("60일 이전 로그 삭제 완료");
    }
  });
}

function downloadExcel() {
  const rows = filteredRowsCache.map(row => ({
    NO: row.no,
    Invoice: row.invoice,
    국가: row.country,
    출고일: row.ship_date,
    사용자: row.scan_user,
    번호: row.list_no,
    검수: row.scan_status,
    박스번호: row.box_no,
    코드: row.material_no,
    자재내역: row.material_name,
    바코드: row.barcode,
    상차위치: row.location,
    컨테이너: row.container,
    검수일시: formatDateTime(row.created_at)
  }));

  downloadExcelFile({
    fileName: "scan_in_log.xlsx",
    sheetName: "scan_in_log",
    rows
  });

  tableManager.setStatus("엑셀 다운로드 완료");
}

function getHourText(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return String(d.getHours()).padStart(2, "0");
}

function formatDateTime(value) {
  if (!value) return "";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleString("ko-KR");
}

function clean(value) {
  return String(value ?? "").trim();
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