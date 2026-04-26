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
const FETCH_PAGE_SIZE = 1000;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const invoiceInput = document.getElementById("invoiceInput");
const btnSearchInvoice = document.getElementById("btnSearchInvoice");
const btnSpecialDetail = document.getElementById("btnSpecialDetail");
const tbody = document.getElementById("defect-tbody");
const pageStatus = document.getElementById("page-status");

const elCountry = document.getElementById("country");
const elShipDate = document.getElementById("ship_date");
const elLocation = document.getElementById("location");
const elContainer = document.getElementById("container");
const elCbm = document.getElementById("cbm");
const elQty = document.getElementById("outbound_qty");
const elRowCount = document.getElementById("row_count");
const elDefectCount = document.getElementById("defect_count");
const defectCheck = document.getElementById("defectCheck");
const specialNoteCard = document.getElementById("specialNoteCard");
const noteCount = document.getElementById("noteCount");

let currentInvoice = "";
let sapDocRows = [];
let sapItemRows = [];
let wmsRows = [];
let defectRows = [];
let specialRows = [];
let barcodeRows = [];
let viewRows = [];

let barcodeByMaterialBox = new Map();
let barcodeByMaterial = new Map();

let sortKey = "list_no";
let sortDir = "asc";

const specialModal = createModal({
  mountId: "modal-root",
  modalId: "special-note-modal",
  title: "특이사항 상세보기",
  bodyHtml: `<div id="special-note-body" style="white-space:pre-wrap;line-height:1.7;max-height:60vh;overflow:auto;">특이사항이 없습니다.</div>`,
  confirmText: "확인",
  cancelText: "닫기"
});

createTopbar({
  mountId: "page-topbar",
  title: "결품 조회",
  subtitle: "Invoice 기준 입고 / 미입고 차이 확인",
  rightHtml: `<div class="wms-topbar-chip">USER<strong>${esc(currentUserName)}</strong></div>`
});

init();

function init() {
  bindEvents();
  setPageStatus("대기");
}

function bindEvents() {
  btnSearchInvoice?.addEventListener("click", loadInvoice);

  invoiceInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadInvoice();
  });

  btnSpecialDetail?.addEventListener("click", openSpecialNote);

  defectCheck?.addEventListener("click", async () => {
    const text = clean(defectCheck.textContent);
    if (!text || text.includes("Invoice 조회")) return;

    await navigator.clipboard.writeText(text);
    setPageStatus("결품 확인란 복사 완료");
  });

  document.querySelectorAll("#defect-table thead th[data-sort-key]").forEach(th => {
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



async function loadInvoice() {
  const invoice = clean(invoiceInput.value);

  if (!invoice) {
    setPageStatus("Invoice를 입력하세요.");
    invoiceInput.focus();
    return;
  }

  currentInvoice = invoice;
  setPageStatus("조회 중...");

  try {
    const [docData, itemData, wmsData, defectData, specialData, barcodeData] = await Promise.all([
      fetchAllRows(SAP_DOC_TABLE, invoice),
      fetchAllRows(SAP_ITEM_TABLE, invoice),
      fetchAllRows(WMS_TABLE, invoice),
      fetchAllRows(DEFECT_TABLE, invoice),
      fetchAllRows(SPECIAL_TABLE, invoice),
      fetchAllRows(BARCODE_TABLE)
    ]);

    sapDocRows = docData;
    sapItemRows = itemData;
    wmsRows = wmsData;
    defectRows = defectData;
    specialRows = specialData;
    barcodeRows = barcodeData;

    buildBarcodeMaps();
    makeViewRows();

    renderSummary();
    renderSpecialCard();
    renderDefectCheck();
    renderTable();

    setPageStatus(`${num(viewRows.length)}건 조회 완료`);
  } catch (error) {
    console.error(error);
    setPageStatus("조회 실패");
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty">조회 실패</td></tr>`;
  }
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

function makeViewRows() {
  viewRows = sapItemRows.map(item => {
    const materialNo = clean(item.material_no);
    const itemBoxNo = clean(item.box_no);

    const barcodeRow = findBarcodeRow(materialNo, itemBoxNo);
    const boxNo = itemBoxNo || clean(barcodeRow?.box_no);

    const outboundQty = toNumber(item.outbound_qty);
    const totalQty = toNumber(item.total_qty);
    const inboundQty = getInboundQtySum(materialNo, boxNo);
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
      note: clean(item.note)
    };
  });
}

function renderSummary() {
  const doc = sapDocRows[0] || {};
  const defect = defectRows[0] || {};

  const totalCbm = sapItemRows.reduce((sum, row) => sum + toNumber(row.cbm), 0);
  const totalQty = sapItemRows.reduce((sum, row) => sum + toNumber(row.outbound_qty), 0);

  const defectCount = viewRows.filter(row => {
    const outbound = toNumber(row.outbound_qty);
    const inbound = toNumber(row.inbound_qty);
    return inbound > 0 && inbound < outbound;
  }).length;

  elCountry.textContent = clean(doc.country) || "-";
  elShipDate.textContent = clean(doc.ship_date) || "-";
  elLocation.textContent = clean(defect.location) || "-";
  elContainer.textContent = clean(doc.container) || "-";
  elCbm.textContent = num(totalCbm);
  elQty.textContent = num(totalQty);
  elRowCount.textContent = num(sapItemRows.length);
  elDefectCount.textContent = num(defectCount);
}

function renderSpecialCard() {
  const issues = specialRows
    .map(row => clean(row.issue || row.base_issue))
    .filter(Boolean);

  noteCount.textContent = `${num(issues.length)}건`;

  specialNoteCard.textContent = issues.length
    ? issues.join("\n")
    : "특이사항이 없습니다.";
}

function renderDefectCheck() {

  const rows = [...viewRows]
    .filter(row => {
      const outbound = toNumber(row.outbound_qty);
      const inbound = toNumber(row.inbound_qty);
      return inbound < outbound;
    })
    .sort((a,b)=> Number(a.list_no) - Number(b.list_no));

  if (!rows.length) {
    defectCheck.textContent = "부분입고 / 미입고 없음";
    return;
  }

  const text = rows.map(row => {

    const no = clean(row.list_no);
    const outbound = toNumber(row.outbound_qty);
    const inbound = toNumber(row.inbound_qty);
    const shortage = outbound - inbound;

    if (inbound === 0) return `${no}`;

    return `${no}번(${num(shortage)}박스)`;

  }).join(",");

  defectCheck.textContent = text;
}
function renderTable() {
  if (!viewRows.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty">조회된 자재내역이 없습니다.</td></tr>`;
    return;
  }

  const rows = [...viewRows].sort((a, b) => compareValue(a[sortKey], b[sortKey], sortDir));

  tbody.innerHTML = rows.map(row => {
    const outbound = toNumber(row.outbound_qty);
    const inbound = toNumber(row.inbound_qty);
    const comparison = toNumber(row.comparison);

    let trClass = "";
    if (inbound > 0 && inbound < outbound) trClass = "row-partial";
    if (inbound === 0 && comparison < 0) trClass = "row-defect";

    const workClass = row.work === "O" ? "work-o" : "work-x";
    const compareClass = comparison < 0 ? "bad" : "ok";

    return `
      <tr class="${trClass}">
        <td class="mono-num">${esc(row.list_no)}</td>
        <td class="mono-num">${esc(row.material_no)}</td>
        <td class="mono-num">${esc(row.box_no)}</td>
        <td>${esc(row.material_name)}</td>
        <td><span class="defect-badge ${workClass}">${esc(row.work)}</span></td>
        <td class="mono-num">${num(row.outbound_qty)}</td>
        <td class="mono-num">${num(row.inbound_qty)}</td>
        <td><span class="defect-badge ${compareClass}">${num(row.comparison)}</span></td>
        <td>${esc(row.note)}</td>
      </tr>
    `;
  }).join("");
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
      return sum + toNumber(
        row.inbound_qty ||
        row.qty ||
        row.quantity ||
        row.total_qty ||
        row.pack_qty ||
        0
      );
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

  const hasBox = rows.find(row => clean(row.box_no));
  if (hasBox) return hasBox;

  return rows[0] || null;
}

function openSpecialNote() {
  const body = document.getElementById("special-note-body");

  const issues = specialRows
    .map(row => clean(row.issue || row.base_issue))
    .filter(Boolean);

  body.innerHTML = issues.length
    ? issues.map(v => esc(v)).join("<br><br>")
    : "특이사항이 없습니다.";

  specialModal.open();
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