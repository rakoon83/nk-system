import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260422";
import { createTopbar } from "/assets/js/shared/topbar.js";

checkAuth();
preparePageContent("app-nav", "page-content");
renderNav({ mountId: "app-nav" });

const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const LOG_TABLE = "scan_load_log";
const FETCH_PAGE_SIZE = 1000;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const invoiceInput = document.getElementById("invoiceInput");
const keywordInput = document.getElementById("keywordInput");
const btnSearch = document.getElementById("btnSearch");
const btnReset = document.getElementById("btnReset");
const btnDelete = document.getElementById("btnDelete");
const checkAll = document.getElementById("checkAll");

const tbody = document.getElementById("scan-load-log-tbody");
const logSummary = document.getElementById("logSummary");
const pageStatus = document.getElementById("page-status");

let logRows = [];
let viewRows = [];
let sortKey = "created_at";
let sortDir = "desc";

createTopbar({
  mountId: "page-topbar",
  title: "상차검수 로그",
  subtitle: "상차검수 완료 이력 조회 / 삭제",
  rightHtml: `<div class="wms-topbar-chip">USER<strong>${esc(currentUserName)}</strong></div>`
});

init();

function init() {
  bindEvents();
  loadLogs();
}

function bindEvents() {
  btnSearch?.addEventListener("click", applyFilter);

  btnReset?.addEventListener("click", () => {
    invoiceInput.value = "";
    keywordInput.value = "";
    applyFilter();
  });

  invoiceInput?.addEventListener("keydown", e => {
    if (e.key === "Enter") applyFilter();
  });

  keywordInput?.addEventListener("keydown", e => {
    if (e.key === "Enter") applyFilter();
  });

  btnDelete?.addEventListener("click", deleteSelected);

  checkAll?.addEventListener("change", () => {
    document.querySelectorAll(".row-check").forEach(chk => {
      chk.checked = checkAll.checked;
    });
  });

  document.querySelectorAll("#scan-load-log-table thead th[data-sort-key]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sortKey;

      if (sortKey === key) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = key;
        sortDir = "asc";
      }

      renderTable();
    });
  });
}

async function fetchAllRows() {
  let from = 0;
  let merged = [];

  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;

    const { data, error } = await supabaseClient
      .from(LOG_TABLE)
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

async function loadLogs() {
  setPageStatus("조회 중...");

  try {
    logRows = await fetchAllRows();
    applyFilter();
    setPageStatus(`조회 완료 / 전체 ${num(logRows.length)}건`);
  } catch (error) {
    console.error(error);
    setPageStatus("조회 실패");
    tbody.innerHTML = `
      <tr>
        <td colspan="13" class="table-empty">로그 조회 실패</td>
      </tr>
    `;
  }
}

function applyFilter() {
  const invoice = clean(invoiceInput.value);
  const keyword = clean(keywordInput.value).toUpperCase();

  viewRows = logRows.filter(row => {
    const invoiceOk = !invoice || clean(row.invoice).includes(invoice);

    const text = [
      row.material_no,
      row.box_no,
      row.barcode,
      row.scan_user,
      row.material_name,
      row.scan_status
    ].map(v => clean(v).toUpperCase()).join(" ");

    const keywordOk = !keyword || text.includes(keyword);

    return invoiceOk && keywordOk;
  });

  renderTable();
}

function renderTable() {
  if (checkAll) checkAll.checked = false;

  logSummary.textContent = `${num(viewRows.length)}건`;

  if (!viewRows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="13" class="table-empty">조회된 로그가 없습니다.</td>
      </tr>
    `;
    return;
  }

  const rows = [...viewRows].sort((a, b) => compareValue(a[sortKey], b[sortKey], sortDir));

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>
        <input class="row-check" type="checkbox" value="${esc(row.id)}">
      </td>
      <td class="mono-num">${esc(row.invoice)}</td>
      <td class="mono-num">${esc(row.list_no)}</td>
      <td><span class="badge ok">${esc(row.scan_status)}</span></td>
      <td class="mono-num">${esc(row.box_no)}</td>
      <td>${esc(row.material_name)}</td>
      <td class="mono-num">${esc(row.material_no)}</td>
      <td class="mono-num">${esc(row.barcode)}</td>
      <td>${esc(row.scan_user)}</td>
      <td>${esc(row.country)}</td>
      <td class="mono-num">${esc(row.ship_date)}</td>
      <td class="mono-num">${esc(row.container)}</td>
      <td class="mono-num">${formatDateTime(row.created_at)}</td>
    </tr>
  `).join("");
}

async function deleteSelected() {
  const ids = [...document.querySelectorAll(".row-check:checked")]
    .map(chk => Number(chk.value))
    .filter(Boolean);

  if (!ids.length) {
    alert("삭제할 로그를 선택하세요.");
    return;
  }

  if (!confirm(`${ids.length}건 삭제할까요?`)) return;

  setPageStatus("삭제 중...");

  const { error } = await supabaseClient
    .from(LOG_TABLE)
    .delete()
    .in("id", ids);

  if (error) {
    console.error(error);
    setPageStatus("삭제 실패");
    alert("삭제 실패");
    return;
  }

  logRows = logRows.filter(row => !ids.includes(Number(row.id)));
  applyFilter();

  setPageStatus(`${ids.length}건 삭제 완료`);
}

function compareValue(a, b, dir) {
  const av = clean(a);
  const bv = clean(b);

  const an = Number(av);
  const bn = Number(bv);

  let result = 0;

  if (av !== "" && bv !== "" && Number.isFinite(an) && Number.isFinite(bn)) {
    result = an - bn;
  } else {
    result = av.localeCompare(bv, "ko-KR", { numeric:true });
  }

  return dir === "asc" ? result : -result;
}

function formatDateTime(value) {
  if (!value) return "";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return clean(value);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function setPageStatus(text) {
  if (pageStatus) pageStatus.textContent = text;
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