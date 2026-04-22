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

const TABLE_NAME = "wms_attribute_b";

const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("wms-attribute-b-tbody");
const printArea = document.getElementById("print-area");

let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

createTopbar({
  mountId: "page-topbar",
  title: "WMS 속성 업로드",
  subtitle: "wms_attribute_b / Supabase",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "wms-attribute-b-toolbar",
  currentUserName,
  searchPlaceholder: "Invoice / 코드 / 자재내역 검색",
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
  tableId: "wms-attribute-b-table",
  tbodyId: "wms-attribute-b-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "wms_attribute_b_columns",
  defaultSortKey: "id",
  defaultSortDir: "desc",

  columns: [
    { key: "no", label: "NO", width: 70, visible: true },
    { key: "invoice", label: "Invoice", width: 150, visible: true },
    { key: "material_no", label: "코드", width: 140, visible: true },
    { key: "box_no", label: "박스번호", width: 140, visible: true },
    { key: "material_name", label: "자재내역", width: 350, visible: true },
    { key: "inbound_qty", label: "수량", width: 100, visible: true },
    { key: "mfg_date", label: "제조일자", width: 140, visible: true },
    { key: "exp_date", label: "유통기한", width: 140, visible: true },
    { key: "created_at", label: "등록일", width: 180, visible: true }
  ],

  sortMap: {
    invoice: 'thead th[data-col-key="invoice"] .th-inner',
    material_no: 'thead th[data-col-key="material_no"] .th-inner',
    box_no: 'thead th[data-col-key="box_no"] .th-inner',
    material_name: 'thead th[data-col-key="material_name"] .th-inner',
    inbound_qty: 'thead th[data-col-key="inbound_qty"] .th-inner',
    mfg_date: 'thead th[data-col-key="mfg_date"] .th-inner',
    exp_date: 'thead th[data-col-key="exp_date"] .th-inner',
    created_at: 'thead th[data-col-key="created_at"] .th-inner'
  },

  onSortChange: () => renderTable(true)
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

    rows = rows.filter(row => {

      return [

        row.invoice,
        row.material_no,
        row.box_no,
        row.material_name,
        row.inbound_qty,
        row.mfg_date,
        row.exp_date

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
        <td colspan="10" class="table-empty">데이터가 없습니다.</td>
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

  tableManager.setStatus(`${filteredRowsCache.length}건 / 화면 ${renderedCount}건`);

  isAppending = false;
}

function renderCell(key, row) {

  if (key === "no") return `<td class="mono-num">${row.no}</td>`;

  if (key === "invoice") return `<td>${row.invoice ?? ""}</td>`;

  if (key === "material_no") return `<td>${row.material_no ?? ""}</td>`;

  if (key === "box_no") return `<td>${row.box_no ?? ""}</td>`;

  if (key === "material_name") return `<td>${row.material_name ?? ""}</td>`;

  if (key === "inbound_qty") return `<td class="mono-num">${row.inbound_qty ?? 0}</td>`;

  if (key === "mfg_date") return `<td>${row.mfg_date ?? ""}</td>`;

  if (key === "exp_date") return `<td>${row.exp_date ?? ""}</td>`;

  if (key === "created_at") return `<td>${row.created_at ?? ""}</td>`;

  return "";
}

function getSelectedIds() {
  return tableManager.getSelectedIds().map(v => Number(v));
}

async function deleteSelectedRows() {

  const ids = getSelectedIds();

  if (!ids.length) {
    tableManager.setStatus("삭제할 행 선택");
    return;
  }

  openConfirm({

    mountId: "modal-root",

    title: "삭제 확인",

    message: `${ids.length}건 삭제할까요?`,

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

      tableManager.setStatus("삭제 완료");
    }
  });
}

function downloadExcel() {

  const rows = filteredRowsCache.map(r => ({

    Invoice: r.invoice,
    코드: r.material_no,
    박스번호: r.box_no,
    자재내역: r.material_name,
    수량: r.inbound_qty,
    제조일자: r.mfg_date,
    유통기한: r.exp_date

  }));

  downloadExcelFile(rows, "wms_attribute_b.xlsx");
}