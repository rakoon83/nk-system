import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260422";
import { createTopbar } from "/assets/js/shared/topbar.js";

checkAuth();
preparePageContent("app-nav", "page-content");
renderNav({ mountId: "app-nav" });

const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const LOG_TABLE = "invoice_progress_log";
const SAP_DOC_TABLE = "sap_doc";
const SAP_ITEM_TABLE = "sap_item";
const SCAN_IN_LOG_TABLE = "scan_in_log";
const REPAIR_LOG_TABLE = "worklog_scan";
const SCAN_OUT_LOG_TABLE = "scan_out_log";
const LOAD_LOG_TABLE = "scan_load_log";

const FETCH_PAGE_SIZE = 1000;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const btnRefresh = document.getElementById("btn-refresh-log");
const elCount = document.getElementById("log-count");
const elNormal = document.getElementById("log-normal");
const elCheck = document.getElementById("log-check");
const elUpdated = document.getElementById("log-updated");
const elStatus = document.getElementById("page-status");

createTopbar({
  mountId: "page-topbar",
  title: "인보이스 진행현황 로그",
  subtitle: "계산 결과 저장 전용",
  rightHtml: `<div class="wms-topbar-chip">USER<strong>${esc(currentUserName)}</strong></div>`
});

init();

async function init() {
  bindEvents();
  await loadSummary();
}

function bindEvents() {
  btnRefresh?.addEventListener("click", refreshLog);
}

async function refreshLog() {
  btnRefresh.disabled = true;
  setStatus("자료 불러오는 중...");

  try {
    const [
      sapDocRows,
      oldLogRows,
      sapItemRows,
      scanInRows,
      repairRows,
      scanOutRows,
      scanLoadRows
    ] = await Promise.all([
      fetchAllRows(SAP_DOC_TABLE),
      fetchAllRows(LOG_TABLE),
      fetchAllRows(SAP_ITEM_TABLE),
      fetchAllRows(SCAN_IN_LOG_TABLE),
      fetchAllRows(REPAIR_LOG_TABLE),
      fetchAllRows(SCAN_OUT_LOG_TABLE),
      fetchAllRows(LOAD_LOG_TABLE)
    ]);

    if (!sapDocRows.length) {
      setStatus("sap_doc 데이터가 없습니다.");
      return;
    }

    setStatus("인보이스 계산 중...");

    const groups = groupByInvoice(sapDocRows);
    const activeDisplays = new Set();
    const saveRows = [];

    for (const [invoice, docs] of groups.entries()) {
      const oldSameInvoice = oldLogRows.filter(row => clean(row.invoice_base) === invoice);
      const displays = makeDisplayList(invoice, docs.length, oldSameInvoice);

      docs.forEach((doc, index) => {
        const display = displays[index];
        activeDisplays.add(display);

        const scanIn = getItemProgress(invoice, sapItemRows, scanInRows, false);
        const repair = getItemProgress(invoice, sapItemRows, repairRows, true);
        const scanOut = getItemProgress(invoice, sapItemRows, scanOutRows, false);
        const load = getLoadProgress(invoice, scanLoadRows);

        saveRows.push({
          invoice_base: invoice,
          invoice_display: display,

          ship_date: clean(doc.ship_date),
          country: clean(doc.country),
          outbound_qty: toNum(doc.outbound_qty),
          type: clean(doc.type),
          container: clean(doc.container),

          scan_in_status: scanIn.text,
          scan_in_done: scanIn.done,
          scan_in_total: scanIn.total,

          repair_status: repair.text,
          repair_done: repair.done,
          repair_total: repair.total,

          scan_out_status: scanOut.text,
          scan_out_done: scanOut.done,
          scan_out_total: scanOut.total,

          load_status: load.text,
          load_done: load.done,
          load_total: load.total,

          row_status: "정상"
        });
      });
    }

    setStatus(`저장 중... ${num(saveRows.length)}건`);

    await upsertChunk(LOG_TABLE, saveRows, "invoice_display");

    const missingRows = oldLogRows.filter(row => !activeDisplays.has(clean(row.invoice_display)));

    if (missingRows.length) {
      const checkRows = missingRows.map(row => ({
        invoice_base: row.invoice_base,
        invoice_display: row.invoice_display,

        ship_date: row.ship_date,
        country: row.country,
        outbound_qty: row.outbound_qty,
        type: row.type,
        container: row.container,

        scan_in_status: row.scan_in_status,
        scan_in_done: row.scan_in_done,
        scan_in_total: row.scan_in_total,

        repair_status: row.repair_status,
        repair_done: row.repair_done,
        repair_total: row.repair_total,

        scan_out_status: row.scan_out_status,
        scan_out_done: row.scan_out_done,
        scan_out_total: row.scan_out_total,

        load_status: row.load_status,
        load_done: row.load_done,
        load_total: row.load_total,

        row_status: "확인"
      }));

      await upsertChunk(LOG_TABLE, checkRows, "invoice_display");
    }

    setStatus(`결과갱신 완료 / 저장 ${num(saveRows.length)}건 / 확인 ${num(missingRows.length)}건`);
    await loadSummary();
  } catch (error) {
    console.error("invoice_progress_log 오류:", error);
    setStatus("오류 발생 - F12 Console 확인");
  } finally {
    btnRefresh.disabled = false;
  }
}

function groupByInvoice(rows) {
  const map = new Map();

  rows.forEach(row => {
    const invoice = clean(row.invoice);
    if (!invoice) return;

    if (!map.has(invoice)) map.set(invoice, []);
    map.get(invoice).push(row);
  });

  return map;
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

function getItemProgress(invoice, itemRows, logRows, repairOnly) {
  let items = itemRows.filter(row => clean(row.invoice) === invoice);

  if (repairOnly) {
    items = items.filter(row => toNum(row.total_qty) > 0);
  }

  const totalSet = new Set(
    items.map(row => clean(row.material_no)).filter(Boolean)
  );

  if (!totalSet.size) {
    return { text: "미검수", done: 0, total: 0 };
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
    return { text: "미검수", done, total };
  }

  if (done >= total) {
    return { text: "검수완료", done, total };
  }

  return { text: "부분완료", done, total };
}

function getLoadProgress(invoice, scanLoadRows) {
  const exists = scanLoadRows.some(row => clean(row.invoice) === invoice);

  if (exists) {
    return { text: "검수완료", done: 1, total: 1 };
  }

  return { text: "미검수", done: 0, total: 1 };
}

async function upsertChunk(tableName, rows, conflictKey) {
  if (!rows.length) return;

  const size = 500;

  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);

    const { error } = await supabaseClient
      .from(tableName)
      .upsert(chunk, { onConflict: conflictKey });

    if (error) throw error;
  }
}

async function loadSummary() {
  const rows = await fetchAllRows(LOG_TABLE);

  const total = rows.length;
  const normal = rows.filter(row => clean(row.row_status) === "정상").length;
  const check = rows.filter(row => clean(row.row_status) === "확인").length;

  const latest = rows
    .map(row => row.updated_at || row.created_at)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  elCount.textContent = num(total);
  elNormal.textContent = num(normal);
  elCheck.textContent = num(check);
  elUpdated.textContent = latest ? formatDateTime(latest) : "-";

  setStatus(`현재 저장 ${num(total)}건`);
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

function setStatus(text) {
  if (elStatus) elStatus.textContent = text;
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

function formatDateTime(value) {
  if (!value) return "";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}