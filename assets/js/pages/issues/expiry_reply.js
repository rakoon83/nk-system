import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260422";
import { createTopbar } from "/assets/js/shared/topbar.js";
import { createToolbar } from "/assets/js/shared/toolbar.js";
import { createTableManager, compareTableValue } from "/assets/js/shared/table.js";

checkAuth();
preparePageContent("app-nav", "page-content");

renderNav({
  mountId: "app-nav"
});

const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE_NAME = "expiry_reply";
const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("expiry-reply-tbody");
const printArea = document.getElementById("print-area");

let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

createTopbar({
  mountId: "page-topbar",
  title: "유통기한 회신",
  subtitle: "expiry_reply / Supabase",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "expiry-reply-toolbar",
  currentUserName,
  searchPlaceholder: "로케이션 / 코드 / 박스번호 / 자재내역 / 납품처명 검색",
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
  tableId: "expiry-reply-table",
  tbodyId: "expiry-reply-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "expiry_reply_columns",

  defaultSortKey: "id",
  defaultSortDir: "desc",

  columns: [
    { key: "no", label: "NO", width: 70, visible: true },
    { key: "invoice", label: "로케이션", width: 160, visible: true },
    { key: "ship_date", label: "출고일", width: 120, visible: true },
    { key: "country", label: "국가", width: 100, visible: true },
    { key: "material_no", label: "코드", width: 160, visible: true },
    { key: "box_no", label: "박스번호", width: 140, visible: true },
    { key: "material_name", label: "자재내역", width: 300, visible: true },
    { key: "customer_name", label: "납품처명", width: 220, visible: true },
    { key: "manager", label: "담당자", width: 140, visible: true },
    { key: "created_at", label: "등록일", width: 170, visible: true },
    { key: "reply_at", label: "처리일", width: 170, visible: true },
    { key: "reply_status", label: "확인", width: 120, visible: true },
    { key: "note", label: "비고", width: 240, visible: true }
  ],

  sortMap: {
    invoice: 'thead th[data-col-key="invoice"] .th-inner',
    ship_date: 'thead th[data-col-key="ship_date"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    material_no: 'thead th[data-col-key="material_no"] .th-inner',
    box_no: 'thead th[data-col-key="box_no"] .th-inner'
  },

  onSortChange: () => renderTable(true),
  onColumnChange: () => renderTable(true)
});

init();

async function init() {
  bindEvents();
  tableManager.init();
  await loadRows();
}

function bindEvents() {

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

        row.invoice,
        row.ship_date,
        row.country,
        row.material_no,
        row.box_no,
        row.material_name,
        row.customer_name,
        row.manager,
        row.note

      ].some(v => String(v ?? "").toLowerCase().includes(keyword));

    });

  }

  rows = rows.map((row, index) => ({
    ...row,
    no: rows.length - index
  }));

  return rows;

}

function renderTable(reset = false) {

  filteredRowsCache = getFilteredRows();

  if (reset) {
    renderedCount = 0;
    tbody.innerHTML = "";
  }

  appendNextRows(true);

}

function appendNextRows(force = false) {

  if (isAppending && !force) return;
  if (renderedCount >= filteredRowsCache.length) return;

  isAppending = true;

  const nextRows = filteredRowsCache.slice(renderedCount, renderedCount + RENDER_PAGE_SIZE);

  const html = nextRows.map(row => `

<tr>

<td><input type="checkbox" class="chk row-chk" data-id="${row.id}"></td>

<td>${row.no}</td>
<td>${esc(row.invoice)}</td>
<td>${esc(row.ship_date)}</td>
<td>${esc(row.country)}</td>
<td>${esc(row.material_no)}</td>
<td>${esc(row.box_no)}</td>
<td>${esc(row.material_name)}</td>
<td>${esc(row.customer_name)}</td>
<td>${esc(row.manager)}</td>
<td>${esc(row.created_at)}</td>
<td>${esc(row.reply_at || "")}</td>

<td>
<button class="reply-btn ${row.reply_status === "완료" ? "done" : ""}"
onclick="confirmReply(${row.id})">

${row.reply_status === "완료" ? "완료" : "확인"}

</button>
</td>

<td>${esc(row.note)}</td>

</tr>

`).join("");

  if (renderedCount === 0) {
    tbody.innerHTML = html;
  } else {
    tbody.insertAdjacentHTML("beforeend", html);
  }

  renderedCount += nextRows.length;

  tableManager.refreshAfterRender();
  tableManager.setStatus(`${num(filteredRowsCache.length)}건`);

  isAppending = false;

}

window.confirmReply = async function(id){

  const today = new Date().toISOString().slice(0,10);

  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .update({
      reply_status:"완료",
      reply_at: today
    })
    .eq("id",id);

  if(error){
    console.error(error);
    return;
  }

  await loadRows();

}

function downloadExcel() {

  const rows = filteredRowsCache.map(row => ({
    로케이션: row.invoice,
    출고일: row.ship_date,
    국가: row.country,
    코드: row.material_no,
    박스번호: row.box_no,
    자재내역: row.material_name,
    납품처명: row.customer_name,
    담당자: row.manager,
    등록일: row.created_at,
    처리일: row.reply_at,
    확인: row.reply_status,
    비고: row.note
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "expiry_reply");

  XLSX.writeFile(wb, "expiry_reply.xlsx");

}

function num(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function esc(value) {

  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");

}

function onTableScroll(){

  if(!printArea) return;
  if(isAppending) return;
  if(renderedCount >= filteredRowsCache.length) return;

  const remain = printArea.scrollHeight - printArea.scrollTop - printArea.clientHeight;

  if(remain < 300){
    appendNextRows();
  }

}