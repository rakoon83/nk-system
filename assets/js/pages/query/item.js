import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260422";
import { createTopbar } from "/assets/js/shared/topbar.js";
import { createToolbar } from "/assets/js/shared/toolbar.js";
import { downloadExcelFile } from "/assets/js/shared/excel.js";

checkAuth();
preparePageContent("app-nav", "page-content");
renderNav({ mountId: "app-nav" });

const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const SAP_DOC_TABLE = "sap_doc";
const SAP_ITEM_TABLE = "sap_item";
const WMS_TABLE = "wms_attribute_b";
const BARCODE_TABLE = "barcode_master";
const DEFECT_TABLE = "defect_upload";

const FETCH_PAGE_SIZE = 1000;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const keywordInput = document.getElementById("keywordInput");
const dateFromInput = document.getElementById("dateFromInput");
const dateToInput = document.getElementById("dateToInput");
const btnSearchItem = document.getElementById("btnSearchItem");
const tbody = document.getElementById("item-tbody");

let viewRows = [];

createTopbar({
  mountId: "page-topbar",
  title: "품목 조회",
  subtitle: "코드 / 박스번호 기준 입출고 확인",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "item-toolbar",
  currentUserName,
  searchPlaceholder: "Invoice / 코드 / 박스번호 / 자재내역 검색",
  buttons: {
    add: false,
    paste: false,
    edit: false,
    remove: false,
    sum: false,
    download: true,
    print: true,
    config: false,
    search: true,
    currentUser: true
  }
});

init();

function init() {
  btnSearchItem?.addEventListener("click", searchItem);

  keywordInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchItem();
  });

  toolbar.on("download", downloadExcel);
  toolbar.on("print", printPage);
}

async function searchItem() {
  const keyword = clean(keywordInput.value);
  if (!keyword) return;

  const key = keyword.toLowerCase();
  const dateFrom = clean(dateFromInput?.value);
  const dateTo = clean(dateToInput?.value);

  const [sapItems, docs, wmsList, barcodeList, defectList] = await Promise.all([
    fetchAllRows(SAP_ITEM_TABLE),
    fetchAllRows(SAP_DOC_TABLE),
    fetchAllRows(WMS_TABLE),
    fetchAllRows(BARCODE_TABLE),
    fetchAllRows(DEFECT_TABLE)
  ]);

  const matchedItems = sapItems.filter(item => {
    const code = clean(item.material_no).toLowerCase();
    const sapBox = clean(item.box_no).toLowerCase();

    if (code === key) return true;
    if (sapBox === key) return true;

    return barcodeList.some(bar =>
      clean(bar.material_no).toLowerCase() === code &&
      clean(bar.box_no).toLowerCase() === key
    );
  });

  const rows = [];

  matchedItems.forEach(item => {
    const invoice = clean(item.invoice);
    const materialNo = clean(item.material_no);

    const doc = docs.find(r => clean(r.invoice) === invoice);
    const locationRow = defectList.find(r => clean(r.invoice) === invoice);

    let boxNo = clean(item.box_no);

    if (!boxNo) {
      const bar = barcodeList.find(r =>
        clean(r.material_no) === materialNo
      );

      if (bar) boxNo = clean(bar.box_no);
    }

    const outboundQty = toNumber(item.outbound_qty || item.total_qty);

    const inboundQty = wmsList
      .filter(r =>
        clean(r.invoice) === invoice &&
        clean(r.material_no) === materialNo
      )
      .reduce((sum, r) => {
        return sum + toNumber(
          r.inbound_qty ||
          r.qty ||
          r.quantity ||
          r.total_qty ||
          r.pack_qty
        );
      }, 0);

    rows.push({
      invoice,
      country: clean(doc?.country),
      ship_date: clean(doc?.ship_date),
      location: clean(locationRow?.location),
      material_no: materialNo,
      box_no: boxNo,
      material_name: clean(item.material_name),
      work: outboundQty > 0 ? "O" : "X",
      outbound_qty: outboundQty,
      inbound_qty: inboundQty,
      comparison: inboundQty - outboundQty,
      note: clean(item.note)
    });
  });

  const existsKeySet = new Set(
    rows.map(r => `${clean(r.invoice)}|${clean(r.material_no)}`)
  );

  const wmsOnlyRows = wmsList.filter(r => {
    const code = clean(r.material_no).toLowerCase();
    const box = clean(r.box_no).toLowerCase();
    return code === key || box === key;
  });

  wmsOnlyRows.forEach(wms => {
    const wmsInvoice = clean(wms.invoice);
    const wmsMaterial = clean(wms.material_no);
    const rowKey = `${wmsInvoice}|${wmsMaterial}`;

    if (existsKeySet.has(rowKey)) return;

    const sapItem = sapItems.find(item =>
      clean(item.invoice) === wmsInvoice &&
      clean(item.material_no) === wmsMaterial
    );

    const doc = docs.find(r => clean(r.invoice) === wmsInvoice);
    const locationRow = defectList.find(r => clean(r.invoice) === wmsInvoice);

    const outboundQty = sapItem
      ? toNumber(sapItem.outbound_qty || sapItem.total_qty)
      : "";

    const inboundQty = toNumber(
      wms.inbound_qty ||
      wms.qty ||
      wms.quantity ||
      wms.total_qty ||
      wms.pack_qty
    );

    rows.push({
      invoice: wmsInvoice,
      country: clean(doc?.country),
      ship_date: clean(doc?.ship_date),
      location: clean(locationRow?.location),
      material_no: wmsMaterial,
      box_no: clean(wms.box_no),
      material_name: clean(sapItem?.material_name || wms.material_name),
      work: outboundQty !== "" && outboundQty > 0 ? "O" : "",
      outbound_qty: outboundQty,
      inbound_qty: inboundQty,
      comparison: outboundQty === "" ? "" : inboundQty - outboundQty,
      note: sapItem ? clean(sapItem.note) : "WMS 입고자료"
    });

    existsKeySet.add(rowKey);
  });

  viewRows = rows.filter(row => {
    const shipDate = normalizeDate(row.ship_date);

    if (!dateFrom && !dateTo) return true;
    if (!shipDate) return false;

    if (dateFrom && shipDate < dateFrom) return false;
    if (dateTo && shipDate > dateTo) return false;

    return true;
  });

  renderTable();
}

async function fetchAllRows(tableName) {
  let from = 0;
  let merged = [];

  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;

    const { data, error } = await supabaseClient
      .from(tableName)
      .select("*")
      .range(from, to);

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    merged = merged.concat(rows);

    if (rows.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }

  return merged;
}

function renderTable() {
  if (!viewRows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="14" class="table-empty">조회 결과 없음</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = viewRows.map((row, idx) => {
    let compareHtml = "";

    if (row.comparison === "") {
      compareHtml = "";
    } else if (toNumber(row.comparison) === 0) {
      compareHtml = `<span class="item-badge ok">입고완료</span>`;
    } else {
      compareHtml = `<span class="item-badge bad">${num(row.comparison)}</span>`;
    }

    return `
      <tr>
        <td><input type="checkbox" class="chk"></td>
        <td class="mono-num">${idx + 1}</td>
        <td class="mono-num">${esc(row.invoice)}</td>
        <td>${esc(row.country)}</td>
        <td class="mono-num">${esc(row.ship_date)}</td>
        <td>${esc(row.location)}</td>
        <td class="mono-num">${esc(row.material_no)}</td>
        <td class="mono-num">${esc(row.box_no)}</td>
        <td>${esc(row.material_name)}</td>
        <td>${esc(row.work)}</td>
        <td class="mono-num">${num(row.outbound_qty)}</td>
        <td class="mono-num">${num(row.inbound_qty)}</td>
        <td>${compareHtml}</td>
        <td>${esc(row.note)}</td>
      </tr>
    `;
  }).join("");
}

function downloadExcel() {
  const rows = viewRows.map(r => ({
    Invoice: r.invoice,
    국가: r.country,
    출고일: r.ship_date,
    위치: r.location,
    코드: r.material_no,
    박스번호: r.box_no,
    자재내역: r.material_name,
    작업: r.work,
    출고: r.outbound_qty,
    입고: r.inbound_qty,
    비교: r.comparison === 0 ? "입고완료" : r.comparison,
    비고: r.note
  }));

  downloadExcelFile({
    fileName: "item_query.xlsx",
    sheetName: "item_query",
    rows
  });
}

function printPage() {
  if (!viewRows.length) return;

  const topbar = document.getElementById("page-topbar")?.innerHTML || "";
  const table = document.getElementById("item-table")?.outerHTML || "";

  const printWindow = window.open("", "_blank", "width=1200,height=800");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <title>품목 조회 인쇄</title>

      <style>
        @page {
          size: A4 landscape;
          margin: 8mm;
        }

        body {
          margin: 0;
          font-family: Arial, "Noto Sans KR", sans-serif;
          color: #111827;
          background: #fff;
        }

        .print-topbar {
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid #d1d5db;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10px;
        }

        th, td {
          border: 1px solid #d1d5db;
          padding: 4px 5px;
          text-align: left;
          white-space: nowrap;
        }

        th {
          background: #f3f4f6;
          font-weight: 800;
        }

        .chk,
        .sort-mark,
        .resize-handle {
          display: none !important;
        }

        th:first-child,
        td:first-child {
          display: none !important;
        }

        .item-badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
        }

        .item-badge.ok {
          background: #dcfce7;
          color: #15803d;
        }

        .item-badge.bad {
          background: #fee2e2;
          color: #b91c1c;
        }
      </style>
    </head>

    <body>
      <div class="print-topbar">
        ${topbar}
      </div>

      ${table}

      <script>
        window.onload = function(){
          setTimeout(function(){
            window.print();
            window.close();
          }, 300);
        };
      <\/script>
    </body>
    </html>
  `);

  printWindow.document.close();
}

function normalizeDate(value) {
  const v = clean(value);
  if (!v) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  const m = v.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (!m) return v;

  const yyyy = m[1];
  const mm = String(m[2]).padStart(2, "0");
  const dd = String(m[3]).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function clean(v) {
  return String(v ?? "").trim();
}

function toNumber(v) {
  if (v === "") return 0;
  const n = Number(String(v ?? "").replaceAll(",", "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function num(v) {
  if (v === "") return "";
  return Number(v || 0).toLocaleString("ko-KR");
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}