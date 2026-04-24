import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260422";
import { createTopbar } from "/assets/js/shared/topbar.js";
import { createModal } from "/assets/js/shared/modal.js";

checkAuth();
preparePageContent("app-nav", "page-content");

renderNav({ mountId: "app-nav" });

const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const SAP_DOC_TABLE = "sap_doc";
const SAP_ITEM_TABLE = "sap_item";
const WMS_TABLE = "wms_attribute_b";
const DEFECT_TABLE = "defect_upload";
const SPECIAL_TABLE = "special_note";
const BARCODE_TABLE = "barcode_master";
const LOG_TABLE = "scan_out_log";
const FETCH_PAGE_SIZE = 1000;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const invoiceInput = document.getElementById("invoiceInput");
const btnSearchInvoice = document.getElementById("btnSearchInvoice");
const btnSpecialNote = document.getElementById("btnSpecialNote");
const scanInput = document.getElementById("scanInput");
const scanStatus = document.getElementById("scanStatus");
const scanLogList = document.getElementById("scanLogList");
const tbody = document.getElementById("scan-out-tbody");
const pageStatus = document.getElementById("page-status");

const elCountry = document.getElementById("country");
const elShipDate = document.getElementById("ship_date");
const elLocation = document.getElementById("location");
const elContainer = document.getElementById("container");
const elCbm = document.getElementById("cbm");
const elQty = document.getElementById("outbound_qty");

const unregModal = document.getElementById("unregModal");
const unregCode = document.getElementById("unregCode");
const unregCheck = document.getElementById("unregCheck");
const btnUnregContinue = document.getElementById("btnUnregContinue");

let currentInvoice = "";
let sapDocRows = [];
let sapItemRows = [];
let wmsRows = [];
let barcodeRows = [];
let specialRows = [];
let defectRowsCache = [];
let logRows = [];
let scanRows = [];
let scanLogs = [];

let barcodeByMaterialBox = new Map();
let barcodeByMaterial = new Map();
let scanTargetMap = new Map();

let sortKey = "list_no";
let sortDir = "asc";
let scanLocked = false;

const specialModal = createModal({
  mountId: "modal-root",
  modalId: "special-note-modal",
  title: "특이사항",
  bodyHtml: `<div id="special-note-body" style="white-space:pre-wrap;line-height:1.6;">특이사항이 없습니다.</div>`,
  confirmText: "확인",
  cancelText: "닫기"
});

createTopbar({
  mountId: "page-topbar",
  title: "출고 검수",
  subtitle: "Invoice 조회 후 바코드 / 코드 / 박스번호 스캔",
  rightHtml: `<div class="wms-topbar-chip">USER<strong>${esc(currentUserName)}</strong></div>`
});

init();

function init() {
  bindEvents();
  renderScanLogs();
  setPageStatus("대기");
}

function bindEvents() {
  btnSearchInvoice?.addEventListener("click", loadInvoice);

  invoiceInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadInvoice();
  });

  scanInput?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    if (scanLocked) return;

    handleScan();
  });

  btnSpecialNote?.addEventListener("click", openSpecialNote);

  unregCheck?.addEventListener("change", () => {
    btnUnregContinue.disabled = !unregCheck.checked;
  });

  btnUnregContinue?.addEventListener("click", closeUnregModal);

  document.querySelectorAll("#scan-out-table thead th[data-sort-key]").forEach(th => {
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

async function fetchAllRows(tableName, invoice = "") {
  let from = 0;
  let merged = [];

  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;

    let query = supabaseClient
      .from(tableName)
      .select("*")
      .range(from, to);

    if (invoice) {
      query = query.eq("invoice", invoice);
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

async function loadInvoice() {
  const invoice = clean(invoiceInput.value);

  if (!invoice) {
    playSound("modal");
    setScanStatus("Invoice를 입력하세요.", "warn");
    invoiceInput.focus();
    return;
  }

  currentInvoice = invoice;
  scanLogs = [];
  renderScanLogs();

  setPageStatus("조회 중...");
  setScanStatus("데이터 조회 중...", "");

  try {
    const [docRows, itemRows, wmsData, defectRows, specialData, barcodeData, logData] = await Promise.all([
      fetchAllRows(SAP_DOC_TABLE, invoice),
      fetchAllRows(SAP_ITEM_TABLE, invoice),
      fetchAllRows(WMS_TABLE, invoice),
      fetchAllRows(DEFECT_TABLE, invoice),
      fetchAllRows(SPECIAL_TABLE, invoice),
      fetchAllRows(BARCODE_TABLE),
      fetchAllRows(LOG_TABLE, invoice)
    ]);

    sapDocRows = docRows;
    sapItemRows = itemRows;
    wmsRows = wmsData;
    defectRowsCache = defectRows;
    specialRows = specialData;
    barcodeRows = barcodeData;
    logRows = logData;

    buildBarcodeMaps();
    makeScanRows();
    restoreScanLog();
    buildScanTargetMap();

    renderSummary(defectRows);
    renderTable();

    playSound("modal");
    setPageStatus(`${num(scanRows.length)}건 조회 / 출고검수이력 ${num(logRows.length)}건`);
    setScanStatus("스캔 대기", "ok");

    scanInput.value = "";
    scanInput.focus();
  } catch (error) {
    console.error(error);
    playSound("error");
    setPageStatus("조회 실패");
    setScanStatus("데이터 조회 실패", "err");
  }
}

function buildBarcodeMaps() {
  barcodeByMaterialBox = new Map();
  barcodeByMaterial = new Map();

  barcodeRows.forEach(row => {
    const materialNo = norm(row.material_no);
    const boxNo = normBox(row.box_no);

    if (!materialNo) return;

    if (boxNo) {
      const key = `${materialNo}|${boxNo}`;
      if (!barcodeByMaterialBox.has(key)) barcodeByMaterialBox.set(key, row);
    }

    if (!barcodeByMaterial.has(materialNo)) {
      barcodeByMaterial.set(materialNo, []);
    }

    barcodeByMaterial.get(materialNo).push(row);
  });
}

function buildScanTargetMap() {
  scanTargetMap = new Map();

  scanRows.forEach(row => {
    addScanKey(row.barcode, row);
    addScanKey(row.material_no, row);
    addScanKey(row.box_no, row, true);
  });
}

function addScanKey(value, row, isBox = false) {
  const key = isBox ? normBox(value) : norm(value);
  if (!key) return;
  if (!scanTargetMap.has(key)) scanTargetMap.set(key, row);
}

function renderSummary(defectRows) {
  const doc = sapDocRows[0] || {};
  const defect = defectRows[0] || {};

  const totalCbm = sapItemRows.reduce((sum, row) => sum + toNumber(row.cbm), 0);
  const totalQty = sapItemRows.reduce((sum, row) => sum + toNumber(row.outbound_qty), 0);

  elCountry.textContent = clean(doc.country) || "-";
  elShipDate.textContent = clean(doc.ship_date) || "-";
  elLocation.textContent = clean(defect.location) || "-";
  elContainer.textContent = clean(doc.container) || "-";
  elCbm.textContent = num(totalCbm);
  elQty.textContent = `${num(totalQty)} / ${num(sapItemRows.length)}건`;
}

function makeScanRows() {
  scanRows = sapItemRows.map(item => {
    const materialNo = clean(item.material_no);
    const itemBoxNo = clean(item.box_no);

    const barcodeRow = findBarcodeRow(materialNo, itemBoxNo);
    const boxNo = itemBoxNo || clean(barcodeRow?.box_no);

    const inboundQty = getInboundQtySum(materialNo, boxNo);
    const outboundQty = toNumber(item.outbound_qty);
    const totalQty = toNumber(item.total_qty);
    const comparison = inboundQty - outboundQty;

    return {
      list_no: clean(item.list_no),
      material_no: materialNo,
      box_no: boxNo,
      material_name: clean(item.material_name),
      total_qty: totalQty,
      work: totalQty > 0 ? "O" : "X",
      outbound_qty: outboundQty,
      inbound_qty: inboundQty,
      comparison,
      scan: "",
      barcode: clean(barcodeRow?.barcode),
      scan_user: "",
      is_dup: false,
      status_text: ""
    };
  });
}

function restoreScanLog() {
  if (!logRows.length) return;

  const latestMap = new Map();

  [...logRows]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .forEach(log => {
      const keys = makeLogKeys(log);

      keys.forEach(key => {
        if (key && !latestMap.has(key)) {
          latestMap.set(key, log);
        }
      });
    });

  scanRows.forEach(row => {
    const keys = makeRowKeys(row);
    const log = keys.map(key => latestMap.get(key)).find(Boolean);

    if (!log) return;

    row.scan = clean(log.scan_status);
    row.scan_user = clean(log.scan_user);
    row.is_dup = false;

    if (!row.barcode && log.barcode) {
      row.barcode = clean(log.barcode);
    }
  });
}

function makeRowKeys(row) {
  return [
    `list|${norm(row.list_no)}`,
    `barcode|${norm(row.barcode)}`,
    `box|${normBox(row.box_no)}`,
    `matbox|${norm(row.material_no)}|${normBox(row.box_no)}`,
    `mat|${norm(row.material_no)}`
  ].filter(v => !v.endsWith("|") && !v.includes("||"));
}

function makeLogKeys(log) {
  return [
    `list|${norm(log.list_no)}`,
    `barcode|${norm(log.barcode)}`,
    `box|${normBox(log.box_no)}`,
    `matbox|${norm(log.material_no)}|${normBox(log.box_no)}`,
    `mat|${norm(log.material_no)}`
  ].filter(v => !v.endsWith("|") && !v.includes("||"));
}

function getInboundQtySum(materialNo, boxNo) {
  const m = norm(materialNo);
  const b = normBox(boxNo);

  return wmsRows
    .filter(row => {
      const rowMaterial = norm(row.material_no);
      const rowBox = normBox(row.box_no);

      if (b && rowBox) return rowMaterial === m && rowBox === b;
      return rowMaterial === m;
    })
    .reduce((sum, row) => {
      return sum + toNumber(row.inbound_qty || row.qty || row.quantity || row.total_qty || row.pack_qty || 0);
    }, 0);
}

function findBarcodeRow(materialNo, boxNo) {
  const m = norm(materialNo);
  const b = normBox(boxNo);

  if (!m) return null;

  if (b) {
    const exact = barcodeByMaterialBox.get(`${m}|${b}`);
    if (exact) return exact;
  }

  const rows = barcodeByMaterial.get(m) || [];

  if (rows.length === 1) return rows[0];

  const hasBox = rows.find(row => clean(row.box_no) && clean(row.barcode));
  if (hasBox) return hasBox;

  const hasBarcode = rows.find(row => clean(row.barcode));
  if (hasBarcode) return hasBarcode;

  return rows[0] || null;
}

async function handleScan() {
  const value = clean(scanInput.value);

  if (!currentInvoice) {
    playSound("modal");
    setScanStatus("Invoice 조회 후 스캔하세요.", "warn");
    scanInput.value = "";
    invoiceInput.focus();
    return;
  }

  if (!value) return;

  const target = findScanTarget(value);

  if (!target) {
    playSound("error");
    addScanLog("err", `${value} - 내역 없음`);
    setScanStatus(`내역 없음: ${value}`, "err");
    scanInput.value = "";
    openUnregModal(value);
    return;
  }

  if (target.scan) {
    target.is_dup = true;
    playSound("dup");
    addScanLog("dup", `${value} (${target.box_no || "-"}) - ${target.material_name}`);
    renderTable();
    setScanStatus(`중복 스캔: ${target.material_no} / ${target.box_no || "-"}`, "warn");
    scanInput.value = "";
    scanInput.focus();
    return;
  }

  target.scan = "출고검수완료";
  target.scan_user = currentUserName;
  target.is_dup = false;

  await saveScanLog(target);

  playSound("ok");
  addScanLog("ok", `${value} (${target.box_no || "-"}) - ${target.material_name}`);
  renderTable();
  setScanStatus(`${target.scan}: ${target.material_no} / ${target.box_no || "-"}`, "ok");

  scanInput.value = "";
  scanInput.focus();
}

async function saveScanLog(row) {
  const doc = sapDocRows[0] || {};
  const defect = defectRowsCache[0] || {};

  const { error } = await supabaseClient
    .from(LOG_TABLE)
    .insert([{
      invoice: currentInvoice,
      list_no: row.list_no,
      scan_status: row.scan,

      box_no: row.box_no,
      material_name: row.material_name,
      material_no: row.material_no,
      barcode: row.barcode,

      scan_user: currentUserName,

      country: clean(doc.country),
      ship_date: clean(doc.ship_date),
      location: clean(defect.location),
      container: clean(doc.container)
    }]);

  if (error) {
    console.error(error);
    setPageStatus("출고검수 로그 저장 실패");
  }
}

function findScanTarget(value) {
  const key = norm(value);
  const boxKey = normBox(value);

  return scanTargetMap.get(key) || scanTargetMap.get(boxKey) || null;
}

function openUnregModal(value) {
  scanLocked = true;
  if (unregCode) unregCode.textContent = value || "-";
  if (unregCheck) unregCheck.checked = false;
  if (btnUnregContinue) btnUnregContinue.disabled = true;
  unregModal?.classList.add("show");

  setTimeout(() => {
    unregCheck?.focus();
  }, 50);
}

function closeUnregModal() {
  if (!unregCheck?.checked) return;

  scanLocked = false;
  unregModal?.classList.remove("show");

  scanInput.value = "";
  scanInput.focus();
}

function renderTable() {
  if (!scanRows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="table-empty">조회된 자재내역이 없습니다.</td>
      </tr>
    `;
    return;
  }

  scanRows.forEach(row => {
    row.status_text = getRowStatus(row).text;
  });

  const rows = [...scanRows].sort((a, b) => compareValue(a[sortKey], b[sortKey], sortDir));

  tbody.innerHTML = rows.map(row => {
    const status = getRowStatus(row);

    return `
      <tr class="${status.rowClass}">
        <td class="mono-num">${esc(row.list_no)}</td>
        <td><span class="scan-badge ${status.badgeClass}">${esc(status.text)}</span></td>
        <td class="mono-num">${esc(row.box_no)}</td>
        <td>${esc(row.material_name)}</td>
        <td class="mono-num">${esc(row.work)}</td>
        <td class="mono-num">${num(row.outbound_qty)}</td>
        <td class="mono-num">${num(row.inbound_qty)}</td>
        <td class="mono-num">${num(row.comparison)}</td>
        <td class="mono-num">${esc(row.material_no)}</td>
        <td class="mono-num">${esc(row.barcode)}</td>
        <td>${esc(row.scan_user)}</td>
      </tr>
    `;
  }).join("");
}

function getRowStatus(row) {
  if (row.is_dup) {
    return { text:"중복", rowClass:"scan-row-dup", badgeClass:"dup" };
  }

  if (clean(row.scan) === "출고검수완료") {
    return { text:"출고검수완료", rowClass:"scan-row-checked", badgeClass:"checked" };
  }

  return { text:"출고대기", rowClass:"", badgeClass:"wait" };
}

function addScanLog(type, text) {
  scanLogs.unshift({ type, text });
  scanLogs = scanLogs.slice(0, 3);
  renderScanLogs();
}

function renderScanLogs() {
  if (!scanLogList) return;

  scanLogList.innerHTML = scanLogs.length
    ? scanLogs.map(row => `<div class="scan-log-item ${row.type}">▣ ${esc(row.text)}</div>`).join("")
    : `<div class="scan-log-item">스캔 내역 없음</div>`;
}

function openSpecialNote() {
  const body = document.getElementById("special-note-body");

  if (!currentInvoice) {
    playSound("modal");
    body.innerHTML = "Invoice 조회 후 확인하세요.";
    specialModal.open();
    return;
  }

  const issues = specialRows
    .map(row => clean(row.issue || row.base_issue))
    .filter(Boolean);

  body.innerHTML = issues.length
    ? issues.map(v => esc(v)).join("<br>")
    : "특이사항이 없습니다.";

  specialModal.open();
}

function playSound(type) {
  const map = {
    error: "sound-error",
    dup: "sound-dup",
    modal: "sound-modal",
    ok: "sound-ok"
  };

  const el = document.getElementById(map[type]);
  if (!el) return;

  try {
    el.pause();
    el.currentTime = 0;
    const p = el.play();
    if (p) p.catch(() => {});
  } catch (e) {}
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

function setScanStatus(text, type) {
  scanStatus.textContent = text;
  scanStatus.classList.remove("ok", "warn", "err");
  if (type) scanStatus.classList.add(type);
}

function setPageStatus(text) {
  if (pageStatus) pageStatus.textContent = text;
}

function clean(value) {
  return String(value ?? "").trim();
}

function norm(value) {
  return clean(value);
}

function normBox(value) {
  return clean(value).toUpperCase();
}

function toNumber(value) {
  const n = Number(String(value ?? "").replaceAll(",", "").replace(/[^\d.-]/g, ""));
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