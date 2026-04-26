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

const WMS_TABLE = "wms_attribute_b";
const SAP_DOC_TABLE = "sap_doc";
const DEFECT_TABLE = "defect_upload";

const FETCH_PAGE_SIZE = 1000;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const keywordInput = document.getElementById("keywordInput");
const btnSearchStock = document.getElementById("btnSearchStock");
const tbody = document.getElementById("stock-tbody");
const filterButtons = document.querySelectorAll(".stock-filter-btn");

let allRows = [];
let viewRows = [];
let activeFilter = "";

createTopbar({
  mountId: "page-topbar",
  title: "재고조회",
  subtitle: "인보이스 / 코드 / 박스번호 기준 재고 확인",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "stock-toolbar",
  currentUserName,
  searchPlaceholder: "현재 결과 내 검색",
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
  btnSearchStock?.addEventListener("click", searchStock);

  keywordInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchStock();
  });

  filterButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.filter || "";

      filterButtons.forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      searchByFilter(activeFilter);
    });
  });

  toolbar.on("search", (keyword) => {
    renderFiltered(keyword);
  });

  toolbar.on("download", downloadExcel);
  toolbar.on("print", printPage);
}

async function searchStock() {
  const keyword = clean(keywordInput.value);
  if (!keyword) return;

  activeFilter = "";
  filterButtons.forEach(b => b.classList.remove("is-active"));

  const key = keyword.toLowerCase();

  const [wmsRows, docRows, defectRows] = await Promise.all([
    fetchAllRows(WMS_TABLE),
    fetchAllRows(SAP_DOC_TABLE),
    fetchAllRows(DEFECT_TABLE)
  ]);

  const docMap = makeMap(docRows, "invoice");
  const locationMap = makeLocationMap(defectRows);

  allRows = wmsRows
    .filter(row => {
      const invoice = clean(row.invoice).toLowerCase();
      const materialNo = clean(row.material_no).toLowerCase();
      const boxNo = clean(row.box_no).toLowerCase();

      return (
        invoice.includes(key) ||
        materialNo.includes(key) ||
        boxNo.includes(key)
      );
    })
    .map(row => makeStockRow(row, docMap, locationMap));

  viewRows = allRows;
  renderTable();
}

async function searchByFilter(filterText) {
  const text = clean(filterText);
  if (!text) return;

  keywordInput.value = "";

  const [wmsRows, docRows, defectRows] = await Promise.all([
    fetchAllRows(WMS_TABLE),
    fetchAllRows(SAP_DOC_TABLE),
    fetchAllRows(DEFECT_TABLE)
  ]);

  const docMap = makeMap(docRows, "invoice");
  const locationMap = makeLocationMap(defectRows);

  allRows = wmsRows
    .filter(row => {
      const invoice = clean(row.invoice);
      return invoice.includes(text);
    })
    .map(row => makeStockRow(row, docMap, locationMap));

  viewRows = allRows;
  renderTable();
}

function makeStockRow(row, docMap, locationMap) {
  const invoice = clean(row.invoice);
  const doc = docMap.get(invoice);

  return {
    invoice,
    country: clean(doc?.country),
    ship_date: clean(doc?.ship_date),
    location: clean(locationMap.get(invoice)),
    material_no: clean(row.material_no),
    box_no: clean(row.box_no),
    material_name: clean(row.material_name),
    inbound_qty: toNumber(
      row.inbound_qty ||
      row.qty ||
      row.quantity ||
      row.total_qty ||
      row.pack_qty
    ),
    mfg_date: clean(row.mfg_date),
    exp_date: clean(row.exp_date),
    note: clean(row.note)
  };
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

    if (error) {
      console.error(error);
      alert(`${tableName} 조회 오류`);
      return [];
    }

    const rows = Array.isArray(data) ? data : [];
    merged = merged.concat(rows);

    if (rows.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }

  return merged;
}

function makeMap(rows, keyName) {
  const map = new Map();

  rows.forEach(row => {
    const key = clean(row[keyName]);
    if (key && !map.has(key)) map.set(key, row);
  });

  return map;
}

function makeLocationMap(rows) {
  const map = new Map();

  rows.forEach(row => {
    const invoice = clean(row.invoice);
    const location = clean(row.location);

    if (invoice && location && !map.has(invoice)) {
      map.set(invoice, location);
    }
  });

  return map;
}

function renderFiltered(keyword) {
  const key = clean(keyword).toLowerCase();

  if (!key) {
    viewRows = allRows;
    renderTable();
    return;
  }

  viewRows = allRows.filter(row => {
    return Object.values(row).some(v =>
      clean(v).toLowerCase().includes(key)
    );
  });

  renderTable();
}

function renderTable() {
  if (!viewRows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="13" class="table-empty">조회 결과 없음</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = viewRows.map((row, idx) => {
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
        <td class="mono-num">${num(row.inbound_qty)}</td>
        <td class="mono-num">${esc(row.mfg_date)}</td>
        <td class="mono-num">${esc(row.exp_date)}</td>
        <td>${esc(row.note)}</td>
      </tr>
    `;
  }).join("");
}

function downloadExcel() {
  if (!viewRows.length) return;

  const rows = viewRows.map(r => ({
    인보이스: r.invoice,
    국가: r.country,
    출고일: r.ship_date,
    위치: r.location,
    코드: r.material_no,
    박스번호: r.box_no,
    상품명: r.material_name,
    재고: r.inbound_qty,
    제조일자: r.mfg_date,
    유통기한: r.exp_date,
    비고: r.note
  }));

  downloadExcelFile({
    fileName: "stock_query.xlsx",
    sheetName: "stock_query",
    rows
  });
}

function printPage() {
  if (!viewRows.length) return;

  const topbar = document.getElementById("page-topbar")?.innerHTML || "";
  const table = document.getElementById("stock-table")?.outerHTML || "";

  const printWindow = window.open("", "_blank", "width=1200,height=800");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <title>재고조회 인쇄</title>
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