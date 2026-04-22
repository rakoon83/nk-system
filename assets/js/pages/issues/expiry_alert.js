import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260422";
import { createTopbar } from "/assets/js/shared/topbar.js";
import { createToolbar } from "/assets/js/shared/toolbar.js";
import { createTableManager, compareTableValue } from "/assets/js/shared/table.js";
import { downloadExcelFile } from "/assets/js/shared/excel.js";

checkAuth();
preparePageContent("app-nav", "page-content");

renderNav({
  mountId: "app-nav"
});

const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const WMS_TABLE_CANDIDATES = ["wms_attribute_b"];
const BARCODE_TABLE_CANDIDATES = ["barcode_master"];
const SAP_DOC_TABLE_CANDIDATES = ["sap_doc", "sap_doc_master"];
const DEFECT_TABLE_CANDIDATES = ["defect_upload", "defect_master", "defect"];
const EXCLUDE_TABLE_CANDIDATES = ["expiry_exclude_master"];

const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("expiry-alert-tbody");
const printArea = document.getElementById("print-area");

let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

const state = {
  barcodeSchema: "basic",
  tables: {
    wms: "",
    barcode: "",
    sapDoc: "",
    defect: "",
    exclude: ""
  }
};

createTopbar({
  mountId: "page-topbar",
  title: "유통기한 알림",
  subtitle: "내역 조회",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "expiry-alert-toolbar",
  currentUserName,
  searchPlaceholder: "Invoice / 국가 / 위치 / 코드 / 박스번호 / 자재내역 검색",
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
  tableId: "expiry-alert-table",
  tbodyId: "expiry-alert-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "expiry_alert_table_columns",
  defaultSortKey: "expiry_rate",
  defaultSortDir: "asc",
  columns: [
    { key: "no", label: "NO", width: 70, visible: true },
    { key: "invoice", label: "Invoice", width: 140, visible: true },
    { key: "ship_date", label: "출고일", width: 110, visible: true },
    { key: "country", label: "국가", width: 90, visible: true },
    { key: "location", label: "위치", width: 110, visible: true },
    { key: "material_no", label: "코드", width: 120, visible: true },
    { key: "box_no", label: "박스번호", width: 120, visible: true },
    { key: "material_name", label: "자재내역", width: 320, visible: true },
    { key: "inbound_qty", label: "수량", width: 90, visible: true },
    { key: "mfg_date", label: "제조일자", width: 110, visible: true },
    { key: "exp_date", label: "유통기한", width: 110, visible: true },
    { key: "remaining_days", label: "잔여일", width: 90, visible: true },
    { key: "expiry_days", label: "기준일", width: 90, visible: true },
    { key: "expiry_rate", label: "잔존율", width: 90, visible: true }
  ],
  sortMap: {
    no: 'thead th[data-col-key="no"] .th-inner',
    invoice: 'thead th[data-col-key="invoice"] .th-inner',
    ship_date: 'thead th[data-col-key="ship_date"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    location: 'thead th[data-col-key="location"] .th-inner',
    material_no: 'thead th[data-col-key="material_no"] .th-inner',
    box_no: 'thead th[data-col-key="box_no"] .th-inner',
    material_name: 'thead th[data-col-key="material_name"] .th-inner',
    inbound_qty: 'thead th[data-col-key="inbound_qty"] .th-inner',
    mfg_date: 'thead th[data-col-key="mfg_date"] .th-inner',
    exp_date: 'thead th[data-col-key="exp_date"] .th-inner',
    remaining_days: 'thead th[data-col-key="remaining_days"] .th-inner',
    expiry_days: 'thead th[data-col-key="expiry_days"] .th-inner',
    expiry_rate: 'thead th[data-col-key="expiry_rate"] .th-inner'
  },
  onSortChange: () => renderTable(true),
  onSelectionChange: () => {},
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

function onTableScroll() {
  if (!printArea) return;
  if (isAppending) return;
  if (renderedCount >= filteredRowsCache.length) return;

  const remain = printArea.scrollHeight - printArea.scrollTop - printArea.clientHeight;
  if (remain < 300) {
    appendNextRows();
  }
}

async function resolveTableName(candidates, selectCols) {
  for (const tableName of candidates) {
    try {
      const { error } = await supabaseClient
        .from(tableName)
        .select(selectCols)
        .limit(1);

      if (!error) return tableName;
    } catch (_) {}
  }
  return "";
}

async function detectBarcodeSchema(tableName) {
  try {
    const { error } = await supabaseClient
      .from(tableName)
      .select("id, material_no, box_no, material_name, pack_qty, exp_date, barcode, created_at")
      .limit(1);

    if (!error) {
      state.barcodeSchema = "exp_date";
      return;
    }
  } catch (_) {}

  try {
    const { error } = await supabaseClient
      .from(tableName)
      .select("id, material_no, box_no, material_name, pack_qty, expiry_days, barcode, created_at")
      .limit(1);

    if (!error) {
      state.barcodeSchema = "expiry_days";
      return;
    }
  } catch (_) {}

  state.barcodeSchema = "basic";
}

function getBarcodeSelectCols() {
  if (state.barcodeSchema === "exp_date") {
    return "id, material_no, box_no, material_name, pack_qty, exp_date, barcode, created_at";
  }
  if (state.barcodeSchema === "expiry_days") {
    return "id, material_no, box_no, material_name, pack_qty, expiry_days, barcode, created_at";
  }
  return "id, material_no, box_no, material_name, pack_qty, barcode, created_at";
}

async function fetchAllRows(tableName, columns) {
  let from = 0;
  let merged = [];

  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;

    const { data, error } = await supabaseClient
      .from(tableName)
      .select(columns)
      .range(from, to);

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    merged = merged.concat(rows);

    if (rows.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }

  return merged;
}

async function initTables() {
  state.tables.wms = await resolveTableName(
    WMS_TABLE_CANDIDATES,
    "id, invoice, material_no, box_no, material_name, inbound_qty, mfg_date, exp_date, created_at"
  );

  state.tables.barcode = await resolveTableName(
    BARCODE_TABLE_CANDIDATES,
    "id, material_no, box_no, material_name, pack_qty, barcode, created_at"
  );

  state.tables.sapDoc = await resolveTableName(
    SAP_DOC_TABLE_CANDIDATES,
    "id, invoice, ship_date, country"
  );

  state.tables.defect = await resolveTableName(
    DEFECT_TABLE_CANDIDATES,
    "id, invoice, location"
  );

  state.tables.exclude = await resolveTableName(
    EXCLUDE_TABLE_CANDIDATES,
    "id, material_no"
  );

  if (!state.tables.wms) throw new Error("wms_attribute_b 테이블을 찾지 못했습니다.");
  if (!state.tables.barcode) throw new Error("barcode_master 테이블을 찾지 못했습니다.");

  await detectBarcodeSchema(state.tables.barcode);
}

async function loadRows() {
  tableManager.setStatus("불러오는 중...");

  try {
    await initTables();

    const jobs = [
      fetchAllRows(
        state.tables.wms,
        "id, invoice, material_no, box_no, material_name, inbound_qty, mfg_date, exp_date, created_at"
      ),
      fetchAllRows(
        state.tables.barcode,
        getBarcodeSelectCols()
      )
    ];

    if (state.tables.sapDoc) {
      jobs.push(fetchAllRows(state.tables.sapDoc, "id, invoice, ship_date, country"));
    } else {
      jobs.push(Promise.resolve([]));
    }

    if (state.tables.defect) {
      jobs.push(fetchAllRows(state.tables.defect, "id, invoice, location"));
    } else {
      jobs.push(Promise.resolve([]));
    }

    if (state.tables.exclude) {
      jobs.push(fetchAllRows(state.tables.exclude, "id, material_no"));
    } else {
      jobs.push(Promise.resolve([]));
    }

    const [wmsRows, barcodeRows, sapDocRows, defectRows, excludeRows] = await Promise.all(jobs);

    const barcodeMaps = buildBarcodeMap(barcodeRows);
    const sapDocMap = buildSapDocMap(sapDocRows);
    const defectMap = buildDefectMap(defectRows);
    const excludeSet = buildExcludeSet(excludeRows);

    allRows = mergeRows(wmsRows, barcodeMaps, sapDocMap, defectMap, excludeSet);
    renderTable(true);

    tableManager.setStatus(
      `WMS ${num(wmsRows.length)}건 / 바코드 ${num(barcodeRows.length)}건 / SAP문서 ${num(sapDocRows.length)}건 / 결품 ${num(defectRows.length)}건 / 제외 ${num(excludeRows.length)}건`
    );
  } catch (error) {
    console.error(error);
    allRows = [];
    filteredRowsCache = [];
    tbody.innerHTML = `
      <tr>
        <td colspan="15" class="table-empty">데이터 조회 실패</td>
      </tr>
    `;
    tableManager.refreshAfterRender();
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
        row.location,
        row.material_no,
        row.box_no,
        row.material_name,
        row.inbound_qty,
        row.mfg_date,
        row.exp_date,
        row.remaining_days,
        row.expiry_days,
        row.expiry_rate
      ].some(v => String(v ?? "").toLowerCase().includes(keyword));
    });
  }

  const { sortKey, sortDir } = tableManager.getSortState();

  rows = rows.map((row, index) => ({
    ...row,
    no: index + 1
  }));

  rows.sort((a, b) => compareExpiryRow(a, b, sortKey, sortDir));
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
    <tr data-row-id="${esc(row.no)}" class="${getRowClass(row)}">
      <td><input type="checkbox" class="chk row-chk" data-id="${esc(row.no)}"></td>
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
  if (key === "ship_date") return `<td data-col-key="ship_date" class="mono-num">${esc(row.ship_date)}</td>`;
  if (key === "country") return `<td data-col-key="country">${esc(row.country)}</td>`;
  if (key === "location") return `<td data-col-key="location">${esc(row.location)}</td>`;
  if (key === "material_no") return `<td data-col-key="material_no" class="mono-num">${esc(row.material_no)}</td>`;
  if (key === "box_no") return `<td data-col-key="box_no" class="mono-num">${esc(row.box_no)}</td>`;
  if (key === "material_name") return `<td data-col-key="material_name">${esc(row.material_name)}</td>`;
  if (key === "inbound_qty") return `<td data-col-key="inbound_qty" class="mono-num">${numOrBlank(row.inbound_qty)}</td>`;
  if (key === "mfg_date") return `<td data-col-key="mfg_date" class="mono-num">${esc(row.mfg_date)}</td>`;
  if (key === "exp_date") return `<td data-col-key="exp_date" class="mono-num">${esc(row.exp_date)}</td>`;
  if (key === "remaining_days") return `<td data-col-key="remaining_days" class="mono-num">${numOrBlank(row.remaining_days)}</td>`;
  if (key === "expiry_days") return `<td data-col-key="expiry_days" class="mono-num">${numOrBlank(row.expiry_days)}</td>`;
  if (key === "expiry_rate") {
    const text = row.is_excluded
      ? "확인"
      : (Number.isFinite(row.expiry_rate) ? `${row.expiry_rate}%` : "");
    return `<td data-col-key="expiry_rate" class="mono-num ${getRateClass(row)}">${esc(text)}</td>`;
  }
  return "";
}

function buildBarcodeMap(rows) {
  const exactMap = new Map();
  const materialMap = new Map();

  rows.forEach((row) => {
    const materialNo = cleanText(row.material_no);
    const boxNo = cleanText(row.box_no);
    const exactKey = normalizeKey(materialNo, boxNo);
    const materialKey = normalizeMaterialKey(materialNo);

    let expiryDays = null;
    if (state.barcodeSchema === "exp_date") {
      expiryDays = toNumberValue(row.exp_date);
    } else if (state.barcodeSchema === "expiry_days") {
      expiryDays = toNumberValue(row.expiry_days);
    }

    const item = {
      material_no: materialNo,
      box_no: boxNo,
      material_name: cleanText(row.material_name),
      expiry_days: expiryDays
    };

    if (materialNo && boxNo && !exactMap.has(exactKey)) {
      exactMap.set(exactKey, item);
    }

    if (materialNo && !materialMap.has(materialKey)) {
      materialMap.set(materialKey, item);
    }
  });

  return { exactMap, materialMap };
}

function buildSapDocMap(rows) {
  const map = new Map();

  rows.forEach((row) => {
    const invoiceKey = normalizeInvoice(row.invoice ?? row.inv_no ?? row["인보이스"]);
    if (!invoiceKey) return;
    if (map.has(invoiceKey)) return;

    map.set(invoiceKey, {
      ship_date: cleanText(row.ship_date ?? row.shipdate ?? row["출고일"]),
      country: cleanText(row.country ?? row["국가"])
    });
  });

  return map;
}

function buildDefectMap(rows) {
  const map = new Map();

  rows.forEach((row) => {
    const invoiceKey = normalizeInvoice(row.invoice ?? row.inv_no ?? row["인보이스"]);
    if (!invoiceKey) return;
    if (map.has(invoiceKey)) return;

    map.set(invoiceKey, {
      location: cleanText(row.location ?? row["위치"])
    });
  });

  return map;
}

function buildExcludeSet(rows) {
  const set = new Set();

  rows.forEach((row) => {
    const materialNo = cleanText(row.material_no ?? row.code ?? row["코드"]);
    if (materialNo) {
      set.add(normalizeMaterialKey(materialNo));
    }
  });

  return set;
}

function mergeRows(wmsRows, barcodeMaps, sapDocMap, defectMap, excludeSet) {
  return wmsRows.map((row) => {
    const invoice = cleanText(row.invoice ?? row["인보이스"]);
    const invoiceKey = normalizeInvoice(invoice);
    const materialNo = cleanText(row.material_no ?? row["코드"]);
    const boxNo = cleanText(row.box_no ?? row["박스번호"]);
    const exactKey = normalizeKey(materialNo, boxNo);
    const materialKey = normalizeMaterialKey(materialNo);

    const barcodeRow =
      barcodeMaps.exactMap.get(exactKey) ||
      barcodeMaps.materialMap.get(materialKey) ||
      null;

    const sapDoc = sapDocMap.get(invoiceKey) || {};
    const defect = defectMap.get(invoiceKey) || {};

    const inboundQty = toNumberValue(row.inbound_qty ?? row["입고"]);
    const mfgDate = formatDotDate(row.mfg_date ?? row["제조일자"]);
    const expDate = formatDotDate(row.exp_date ?? row["유통기한"]);
    const remainingDays = calcRemainingDays(expDate);
    const expiryDays = barcodeRow ? toNumberValue(barcodeRow.expiry_days) : null;
    const expiryRate = calcExpiryRate(remainingDays, expiryDays);
    const isExcluded = excludeSet.has(materialKey);

    return {
      invoice,
      ship_date: formatDotDate(sapDoc.ship_date || ""),
      country: cleanText(sapDoc.country),
      location: cleanText(defect.location),
      material_no: materialNo,
      box_no: boxNo,
      material_name: cleanText(row.material_name ?? row["자재내역"]) || cleanText(barcodeRow?.material_name),
      inbound_qty: inboundQty,
      mfg_date: mfgDate,
      exp_date: expDate,
      remaining_days: remainingDays,
      expiry_days: expiryDays,
      expiry_rate: expiryRate,
      is_excluded: isExcluded
    };
  });
}

function compareExpiryRow(a, b, sortKey, sortDir) {
  if (["ship_date", "mfg_date", "exp_date"].includes(sortKey)) {
    const aBlank = !cleanText(a[sortKey]);
    const bBlank = !cleanText(b[sortKey]);

    if (aBlank && bBlank) return 0;
    if (aBlank) return 1;
    if (bBlank) return -1;

    return compareTableValue(dateToKey(a[sortKey]), dateToKey(b[sortKey]), sortDir);
  }

  if (["inbound_qty", "remaining_days", "expiry_days", "expiry_rate", "no"].includes(sortKey)) {
    return compareTableValue(toSortableNumber(a[sortKey]), toSortableNumber(b[sortKey]), sortDir);
  }

  const result = compareTableValue(a[sortKey], b[sortKey], sortDir);
  if (result !== 0) return result;

  return compareTableValue(toSortableNumber(a.expiry_rate), toSortableNumber(b.expiry_rate), "asc");
}

function downloadExcel() {
  const rows = filteredRowsCache.map(row => ({
    NO: row.no,
    Invoice: row.invoice,
    출고일: row.ship_date,
    국가: row.country,
    위치: row.location,
    코드: row.material_no,
    박스번호: row.box_no,
    자재내역: row.material_name,
    수량: row.inbound_qty,
    제조일자: row.mfg_date,
    유통기한: row.exp_date,
    잔여일: row.remaining_days,
    기준일: row.expiry_days,
    잔존율: row.is_excluded ? "확인" : (Number.isFinite(row.expiry_rate) ? `${row.expiry_rate}%` : "")
  }));

  downloadExcelFile({
    fileName: "expiry_alert.xlsx",
    sheetName: "expiry_alert",
    rows
  });

  tableManager.setStatus("엑셀 다운로드 완료");
}

function cleanText(v) {
  return String(v ?? "").replace(/\r/g, "").trim();
}

function normalizeInvoice(value) {
  const raw = cleanText(value);
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw.toUpperCase();
  return digits.replace(/^0+/, "") || "0";
}

function normalizeKey(materialNo, boxNo) {
  return [
    cleanText(materialNo).replace(/\s+/g, "").toUpperCase(),
    cleanText(boxNo).replace(/\s+/g, "").toUpperCase()
  ].join("|");
}

function normalizeMaterialKey(materialNo) {
  return cleanText(materialNo).replace(/\s+/g, "").toUpperCase();
}

function toNumberValue(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toSortableNumber(v) {
  return Number.isFinite(Number(v)) ? Number(v) : -999999999;
}

function parseDate(value) {
  const s = cleanText(value);
  if (!s) return null;

  let m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  m = s.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
  if (m) {
    const now = new Date();
    const y = now.getFullYear();
    const mo = Number(m[1]) - 1;
    const d = Number(m[2]);
    const dt = new Date(y, mo, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

function formatDotDate(value) {
  const raw = cleanText(value);
  const dt = parseDate(raw);
  if (!dt) return raw;

  const hasYear = /^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}$/.test(raw);

  if (!hasYear) {
    const mm = String(dt.getMonth() + 1);
    const dd = String(dt.getDate());
    return `${mm}/${dd}`;
  }

  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

function dateToKey(value) {
  const dt = parseDate(value);
  return dt ? dt.getTime() : -8640000000000000;
}

function calcRemainingDays(expDate) {
  const dt = parseDate(expDate);
  if (!dt) return null;

  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  return Math.floor((target - base) / 86400000);
}

function calcExpiryRate(remainingDays, expiryDays) {
  if (!Number.isFinite(remainingDays) || !Number.isFinite(expiryDays) || expiryDays <= 0) return null;
  return Math.max(0, Math.round((remainingDays / expiryDays) * 100));
}

function getRateClass(row) {
  if (row.is_excluded) return "rate-check";
  if (row.expiry_rate === null || row.expiry_rate === undefined) return "";
  if (row.expiry_rate < 70) return "rate-low";
  if (row.expiry_rate <= 90) return "rate-mid";
  return "rate-good";
}

function getRowClass(row) {
  if (row.is_excluded) return "";

  if (Number.isFinite(row.expiry_rate)) {
    if (row.expiry_rate < 50) {
      return "row-under-50";
    }

    if (row.expiry_rate < 70) {
      return "row-under-70";
    }
  }

  return "";
}

function num(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function numOrBlank(value) {
  return Number.isFinite(value) ? Number(value).toLocaleString("ko-KR") : "";
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}