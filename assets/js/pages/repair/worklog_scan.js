import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260422";
import { createTopbar } from "/assets/js/shared/topbar.js";
import { createToolbar } from "/assets/js/shared/toolbar.js";
import { createTableManager, compareTableValue } from "/assets/js/shared/table.js";
import { createModal } from "/assets/js/shared/modal.js";
import { downloadExcelFile } from "/assets/js/shared/excel.js";

checkAuth();
preparePageContent("app-nav", "page-content");
renderNav({ mountId: "app-nav" });

const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE_NAME = "worklog_scan";
const LOG_TABLE = "worklog_scan_log";
const DELETED_TABLE = "worklog_scan_deleted_log";
const SAP_DOC_TABLE = "sap_doc";
const SAP_ITEM_TABLE = "sap_item";
const BARCODE_TABLE = "barcode_master";
const ATTR_TABLE = "wms_attribute_b";
const DEFECT_TABLE = "defect_upload";

const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("worklog-tbody");
const printArea = document.getElementById("print-area");
const invoiceInput = document.getElementById("invoiceInput");
const scanInput = document.getElementById("scanInput");
const scanStatus = document.getElementById("scanStatus");

let editId = "";
let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

let currentInvoice = "";
let currentWorkType = "CELL";
let currentSapDoc = null;
let currentItemRows = [];
let currentLocation = "";
let invoiceFilter = "";
let filterMode = "today";

createTopbar({
  mountId: "page-topbar",
  title: "작업로그 스캔",
  subtitle: "당일 작업 누적 / 삭제로그 저장",
  rightHtml: `<div class="wms-topbar-chip">USER<strong>${esc(currentUserName)}</strong></div>`
});

const toolbar = createToolbar({
  mountId: "worklog-toolbar",
  currentUserName,
  searchPlaceholder: "코드 / 박스번호 / 자재내역 / 작업자 검색",
  buttons: {
    add: true,
    paste: false,
    edit: true,
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
  tableId: "worklog-table",
  tbodyId: "worklog-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "worklog_scan_table_columns_v10",
  defaultSortKey: "scan_time",
  defaultSortDir: "desc",
  columns: [
    { key: "list_no", label: "NO", width: 70, visible: true },
    { key: "scan_type", label: "입고검수", width: 90, visible: true },
    { key: "invoice", label: "인보이스", width: 150, visible: true },
    { key: "ship_date", label: "출고일", width: 110, visible: true },
    { key: "country", label: "국가", width: 90, visible: true },
    { key: "location", label: "위치", width: 120, visible: true },
    { key: "material_no", label: "코드", width: 120, visible: true },
    { key: "box_no", label: "박스번호", width: 120, visible: true },
    { key: "material_name", label: "자재내역", width: 260, visible: true },
    { key: "outbound_qty", label: "출고", width: 80, visible: true },
    { key: "inbound_qty", label: "입고", width: 80, visible: true },
    { key: "comparison", label: "비교", width: 100, visible: true },
    { key: "mfg_date", label: "제조일자", width: 120, visible: true },
    { key: "mfg_date_edit", label: "제조일자수정", width: 130, visible: true },
    { key: "exp_date", label: "유통기한", width: 120, visible: true },
    { key: "exp_date_edit", label: "유통기한수정", width: 130, visible: true },
    { key: "product_qty", label: "제품", width: 80, visible: true },
    { key: "outer_box_qty", label: "외박스", width: 80, visible: true },
    { key: "total_qty", label: "합계", width: 90, visible: true },
    { key: "work_type", label: "구분", width: 90, visible: true },
    { key: "check_status", label: "검수", width: 120, visible: true },
    { key: "scan_time", label: "작업시간", width: 160, visible: true },
    { key: "user_name", label: "작업자", width: 140, visible: true }
  ],
  sortMap: {
    list_no: 'thead th[data-col-key="list_no"] .th-inner',
    scan_type: 'thead th[data-col-key="scan_type"] .th-inner',
    invoice: 'thead th[data-col-key="invoice"] .th-inner',
    ship_date: 'thead th[data-col-key="ship_date"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    location: 'thead th[data-col-key="location"] .th-inner',
    material_no: 'thead th[data-col-key="material_no"] .th-inner',
    box_no: 'thead th[data-col-key="box_no"] .th-inner',
    material_name: 'thead th[data-col-key="material_name"] .th-inner',
    outbound_qty: 'thead th[data-col-key="outbound_qty"] .th-inner',
    inbound_qty: 'thead th[data-col-key="inbound_qty"] .th-inner',
    comparison: 'thead th[data-col-key="comparison"] .th-inner',
    mfg_date: 'thead th[data-col-key="mfg_date"] .th-inner',
    mfg_date_edit: 'thead th[data-col-key="mfg_date_edit"] .th-inner',
    exp_date: 'thead th[data-col-key="exp_date"] .th-inner',
    exp_date_edit: 'thead th[data-col-key="exp_date_edit"] .th-inner',
    product_qty: 'thead th[data-col-key="product_qty"] .th-inner',
    outer_box_qty: 'thead th[data-col-key="outer_box_qty"] .th-inner',
    total_qty: 'thead th[data-col-key="total_qty"] .th-inner',
    work_type: 'thead th[data-col-key="work_type"] .th-inner',
    check_status: 'thead th[data-col-key="check_status"] .th-inner',
    scan_time: 'thead th[data-col-key="scan_time"] .th-inner',
    user_name: 'thead th[data-col-key="user_name"] .th-inner'
  },
  onSortChange: () => renderTable(true),
  onSelectionChange: (ids) => {
    toolbar.setDisabled("edit", ids.length !== 1);
    toolbar.setDisabled("remove", ids.length < 1);
  },
  onColumnChange: () => renderTable(true)
});

const formModal = createModal({
  mountId: "modal-root",
  modalId: "worklog-form-modal",
  title: "작업로그 등록",
  bodyHtml: getFormModalHtml(),
  confirmText: "저장",
  cancelText: "닫기"
});

init();

async function init() {
  setTodayInputs();
  bindEvents();
  tableManager.init();
  await archiveOldRows();
  await loadRows();
}

function bindEvents() {
  toolbar.on("add", openAddModal);
  toolbar.on("edit", editSelectedRow);
  toolbar.on("remove", deleteSelectedRows);
  toolbar.on("download", downloadExcel);
  toolbar.on("print", () => window.print());

  toolbar.searchInput?.addEventListener("input", () => renderTable(true));
  formModal.onConfirm(() => saveFormRow());

  document.getElementById("btnSearchInvoice")?.addEventListener("click", searchInvoice);
  document.getElementById("btnCell")?.addEventListener("click", () => setWorkType("CELL"));
  document.getElementById("btnRack")?.addEventListener("click", () => setWorkType("매대"));
  document.getElementById("btnEquipment")?.addEventListener("click", () => setWorkType("설비"));

  document.getElementById("btnToday")?.addEventListener("click", () => setFilterMode("today"));
  document.getElementById("btnAll")?.addEventListener("click", () => setFilterMode("all"));
  document.getElementById("btnDateSearch")?.addEventListener("click", () => setFilterMode("date"));

  document.getElementById("btnInvoiceSearch")?.addEventListener("click", () => {
    invoiceFilter = clean(document.getElementById("invoiceSearchInput")?.value);
    renderTable(true);
  });

  document.getElementById("invoiceSearchInput")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    invoiceFilter = clean(e.target.value);
    renderTable(true);
  });

  document.getElementById("expiryBody")?.addEventListener("change", async (e) => {
    const input = e.target;
    const id = input.dataset.id;
    const field = input.dataset.field;

    if (!id || !field) return;

    const value = clean(input.value);

    const { error } = await supabaseClient
      .from(TABLE_NAME)
      .update({ [field]: value })
      .eq("id", id);

    if (error) {
      console.error(error);
      playSound("error");
      setScanStatus("수정값 저장 실패", "err");
      return;
    }

    playSound("ok");
    setScanStatus("수정값 저장 완료", "ok");
    await loadRows();
  });

  invoiceInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchInvoice();
  });

  scanInput?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    handleScan();
  });

  if (printArea) {
    printArea.addEventListener("scroll", onTableScroll, { passive: true });
  }
}

async function archiveOldRows() {
  try {
    await supabaseClient.rpc("archive_worklog_scan_old");
  } catch (error) {
    console.warn("archive 실패", error);
  }
}

function setWorkType(type) {
  currentWorkType = type;

  document.getElementById("btnCell")?.classList.toggle("active", type === "CELL");
  document.getElementById("btnRack")?.classList.toggle("active", type === "매대");
  document.getElementById("btnEquipment")?.classList.toggle("active", type === "설비");

  setText("workTypeText", type);
  setScanStatus(`작업방식: ${type}`, "ok");
  scanInput?.focus();
}

async function setFilterMode(mode) {
  filterMode = mode;
  invoiceFilter = "";

  document.getElementById("btnToday")?.classList.toggle("active", mode === "today");
  document.getElementById("btnAll")?.classList.toggle("active", mode === "all");

  const invoiceSearch = document.getElementById("invoiceSearchInput");
  if (invoiceSearch) invoiceSearch.value = "";

  await loadRows();
}

async function searchInvoice() {
  const invoice = clean(invoiceInput.value);

  if (!invoice) {
    playSound("modal");
    setScanStatus("인보이스 입력 필요", "warn");
    invoiceInput.focus();
    return;
  }

  currentInvoice = invoice;
  currentLocation = "";
  setScanStatus("조회 중...", "");

  try {
    const [docRows, itemRows, defectRows] = await Promise.all([
      fetchRows(SAP_DOC_TABLE, { invoice }),
      fetchRows(SAP_ITEM_TABLE, { invoice }),
      fetchRows(DEFECT_TABLE, { invoice })
    ]);

    currentSapDoc = docRows[0] || null;
    currentItemRows = itemRows;
    currentLocation = clean(defectRows[0]?.location || defectRows[0]?.location_detail);

    setHeaderView();
    await loadRows();

    playSound("modal");
    setScanStatus(`${invoice} 조회 완료 / 품목 ${num(currentItemRows.length)}건`, "ok");
    scanInput.value = "";
    scanInput.focus();
  } catch (error) {
    console.error(error);
    playSound("error");
    setScanStatus("조회 실패", "err");
  }
}

function setHeaderView() {
  setText("shipDate", currentSapDoc?.ship_date || currentItemRows[0]?.ship_date || "-");
  setText("country", currentSapDoc?.country || currentItemRows[0]?.country || "-");
  setText("location", currentLocation || "-");
  setText("productQty", num(currentSapDoc?.product_qty));
  setText("outerBoxQty", num(currentSapDoc?.outer_box_qty));
  setText("totalQty", num(currentSapDoc?.total_qty));
  clearScanView();
}

async function handleScan() {
  const keyword = clean(scanInput.value);

  if (!currentInvoice) {
    playSound("modal");
    setScanStatus("Invoice 조회 후 스캔하세요.", "warn");
    scanInput.value = "";
    invoiceInput.focus();
    return;
  }

  if (!keyword) return;

  try {
    const matchedRows = await findScanItems(keyword);

    if (!matchedRows.length) {
      playSound("error");
      setScanStatus(`미등록: ${keyword}`, "err");
      scanInput.value = "";
      scanInput.focus();
      renderExpirySummary([]);
      clearScanView();
      return;
    }

    const scanRows = makeScanRows(matchedRows);

    if (isDuplicateScan(scanRows)) {
      playSound("dup");
      setScanStatus("중복 스캔입니다.", "warn");
      scanInput.value = "";
      scanInput.focus();
      return;
    }

    setScanView(scanRows);
    renderExpirySummary(scanRows);

    const { data, error } = await supabaseClient
      .from(TABLE_NAME)
      .insert(scanRows)
      .select();

    if (error) {
      console.error(error);
      playSound("error");
      setScanStatus("조회 완료 / 저장 실패(SQL 확인)", "warn");
      scanInput.value = "";
      scanInput.focus();
      return;
    }

    renderExpirySummary(data || scanRows);

    const logs = (data || scanRows).map((row, index) => {
    const copy = { ...row };

      copy.worklog_id = data?.[index]?.id || null;

      delete copy.id;
      delete copy.updated_at;

      return copy;
     });

    const { error: logError } = await supabaseClient
      .from(LOG_TABLE)
      .insert(logs);

    if (logError) {
      console.error(logError);
      setScanStatus("조회/저장 완료 / 로그 저장 실패", "warn");
    } else {
      playSound("ok");
      setScanStatus(`${currentWorkType} ${scanRows.length}건 저장 완료`, "ok");
    }

    scanInput.value = "";
    await loadRows();
    scanInput.focus();
  } catch (error) {
    console.error(error);
    playSound("error");
    setScanStatus("스캔 조회 실패", "err");
  }
}

async function findScanItems(keyword) {
  const key = clean(keyword);
  const keyUpper = key.toUpperCase();

  const barcodeRows = await fetchBarcodeRows(key, keyUpper);

  const materialSet = new Set();
  const boxSet = new Set();

  barcodeRows.forEach(row => {
    if (clean(row.material_no)) materialSet.add(clean(row.material_no));
    if (clean(row.box_no)) boxSet.add(clean(row.box_no).toUpperCase());
  });

  currentItemRows.forEach(row => {
    if (clean(row.material_no) === key) materialSet.add(clean(row.material_no));
    if (clean(row.box_no).toUpperCase() === keyUpper) boxSet.add(clean(row.box_no).toUpperCase());
  });

  if (!materialSet.size && !boxSet.size) {
    materialSet.add(key);
    boxSet.add(keyUpper);
  }

  const attrRows = await fetchAttributeRows([...materialSet], [...boxSet], keyUpper);

  let result = attrRows.map(row => mergeItem(row, barcodeRows));

  if (!result.length) {
    result = currentItemRows
      .filter(row =>
        materialSet.has(clean(row.material_no)) ||
        boxSet.has(clean(row.box_no).toUpperCase())
      )
      .map(row => mergeItem(row, barcodeRows));
  }

  if (!result.length && barcodeRows.length) {
    result = barcodeRows.map(row => mergeItem(row, barcodeRows));
  }

  return dedupeRows(result);
}

async function fetchBarcodeRows(key, keyUpper) {
  const { data } = await supabaseClient
    .from(BARCODE_TABLE)
    .select("*")
    .or(`barcode.eq.${key},material_no.eq.${key},box_no.eq.${key}`)
    .limit(100);

  const rows = Array.isArray(data) ? data : [];

  return rows.filter(row =>
    clean(row.barcode) === key ||
    clean(row.material_no) === key ||
    clean(row.box_no).toUpperCase() === keyUpper
  );
}

async function fetchAttributeRows(materialNos, boxNos, keyUpper) {
  let rows = [];

  for (const materialNo of materialNos) {
    if (!materialNo) continue;

    const { data } = await supabaseClient
      .from(ATTR_TABLE)
      .select("*")
      .eq("invoice", currentInvoice)
      .eq("material_no", materialNo)
      .limit(3000);

    rows = rows.concat(Array.isArray(data) ? data : []);
  }

  if (!rows.length) {
    const { data: invoiceRows } = await supabaseClient
      .from(ATTR_TABLE)
      .select("*")
      .eq("invoice", currentInvoice)
      .limit(3000);

    const allInvoiceRows = Array.isArray(invoiceRows) ? invoiceRows : [];

    rows = rows.concat(
      allInvoiceRows.filter(row =>
        boxNos.includes(clean(row.box_no).toUpperCase()) ||
        clean(row.box_no).toUpperCase() === keyUpper
      )
    );
  }

  return dedupeRawRows(rows);
}

function mergeItem(baseRow, barcodeRows) {
  const materialNo = clean(baseRow.material_no);
  const boxNo = clean(baseRow.box_no);

  const sapItem = currentItemRows.find(row =>
    clean(row.material_no) === materialNo ||
    clean(row.box_no).toUpperCase() === boxNo.toUpperCase()
  );

  const barcode = barcodeRows.find(row =>
    clean(row.material_no) === materialNo ||
    clean(row.box_no).toUpperCase() === boxNo.toUpperCase()
  );

  return {
    invoice: currentInvoice,
    ship_date: currentSapDoc?.ship_date || sapItem?.ship_date || "",
    country: currentSapDoc?.country || sapItem?.country || "",
    location: currentLocation,
    material_no: materialNo || clean(sapItem?.material_no) || clean(barcode?.material_no),
    box_no: boxNo || clean(sapItem?.box_no) || clean(barcode?.box_no),
    material_name: clean(baseRow.material_name || sapItem?.material_name || barcode?.material_name),
    mfg_date: clean(baseRow.mfg_date || baseRow.manufacture_date || barcode?.mfg_date || barcode?.manufacture_date),
    exp_date: clean(baseRow.exp_date || baseRow.expiry_date || barcode?.exp_date || barcode?.expiry_date),
    outbound_qty: toInt(sapItem?.outbound_qty),
    inbound_qty: toInt(baseRow.inbound_qty || baseRow.inbound || baseRow.qty || baseRow.total_qty) || 1,
    product_qty: toInt(currentSapDoc?.product_qty),
    outer_box_qty: toInt(currentSapDoc?.outer_box_qty),
    total_qty: toInt(currentSapDoc?.total_qty),
    note: clean(baseRow.note || sapItem?.note)
  };
}
function makeScanRows(items) {
  if (!items || items.length === 0) return [];

  const totalInbound = items.reduce((sum, item) => sum + toInt(item.inbound_qty), 0);
  const outboundQty = toInt(items[0]?.outbound_qty ?? 0);
  const comparison = Math.max(0, totalInbound - outboundQty);
  const checkStatus = comparison === 0 ? "검수완료" : "부분검수";

  return items.map(item => ({
    list_no: "",
    scan_type: "입고검수",
    invoice: currentInvoice,
    ship_date: clean(item.ship_date),
    country: clean(item.country),
    location: currentLocation,
    material_no: clean(item.material_no),
    box_no: clean(item.box_no),
    material_name: clean(item.material_name),
    mfg_date: clean(item.mfg_date),
    mfg_date_edit: clean(item.mfg_date),
    exp_date: clean(item.exp_date),
    exp_date_edit: clean(item.exp_date),
    outbound_qty: outboundQty,
    inbound_qty: toInt(item.inbound_qty),
    comparison,
    note: clean(item.note),
    product_qty: toInt(item.product_qty),
    outer_box_qty: toInt(item.outer_box_qty),
    total_qty: toInt(item.total_qty),
    work_type: currentWorkType,
    check_status: checkStatus,
    scan_time: new Date().toISOString(),
    user_name: currentUserName
  }));
}

function setScanView(rows) {
  if (!rows || rows.length === 0) return;

  const first = rows[0];
  const totalInbound = rows.reduce((sum, row) => sum + toInt(row.inbound_qty), 0);
  const outboundQty = toInt(first.outbound_qty);
  const comparison = Math.max(0, totalInbound - outboundQty);

  setText("materialNo", first.material_no || "-");
  setText("boxNo", first.box_no || "-");
  setText("materialName", first.material_name || "-");
  setText("outboundQty", num(outboundQty));
  setText("inboundQty", num(totalInbound));
  setText("comparison", num(comparison));
  setText("note", first.note || "-");
}

function clearScanView() {
  setText("materialNo", "-");
  setText("boxNo", "-");
  setText("materialName", "-");
  setText("outboundQty", "0");
  setText("inboundQty", "0");
  setText("comparison", "0");
  setText("note", "-");
  renderExpirySummary([]);
}

function renderExpirySummary(rows) {
  const body = document.getElementById("expiryBody");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7">스캔 결과 없음</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(row => `
    <tr>
      <td>${esc(row.box_no)}</td>
      <td>${esc(row.material_name)}</td>
      <td class="qty">${num(row.inbound_qty)}</td>
      <td>${esc(row.mfg_date)}</td>
      <td>
        <input
          class="scan-input"
          style="height:28px;width:130px;"
          value="${esc(row.mfg_date_edit || row.mfg_date)}"
          data-id="${esc(row.id || "")}"
          data-field="mfg_date_edit"
        >
      </td>
      <td>${esc(row.exp_date)}</td>
      <td>
        <input
          class="scan-input"
          style="height:28px;width:130px;"
          value="${esc(row.exp_date_edit || row.exp_date)}"
          data-id="${esc(row.id || "")}"
          data-field="exp_date_edit"
        >
      </td>
    </tr>
  `).join("");
}

function updateSummary() {
  return;
}

async function loadRows() {
  tableManager.setStatus("불러오는 중...");

  try {
    allRows = await fetchRowsByFilter();
    updateSummary();
    renderTable(true);
  } catch (error) {
    console.error(error);
    tableManager.setStatus("데이터 조회 실패");
  }
}

async function fetchRowsByFilter() {
  let from = 0;
  let merged = [];

  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;

    let query = supabaseClient
      .from(TABLE_NAME)
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (filterMode === "today") {
      const today = todayText();
      query = query
        .gte("created_at", `${today}T00:00:00`)
        .lt("created_at", `${todayNextText()}T00:00:00`);
    }

    if (filterMode === "date") {
      const s = document.getElementById("dateStart")?.value;
      const e = document.getElementById("dateEnd")?.value;
      if (s) query = query.gte("created_at", `${s}T00:00:00`);
      if (e) query = query.lt("created_at", `${addOneDay(e)}T00:00:00`);
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

async function fetchRows(tableName, filters = {}) {
  let from = 0;
  let merged = [];

  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;

    let query = supabaseClient
      .from(tableName)
      .select("*")
      .range(from, to);

    Object.keys(filters).forEach(key => {
      query = query.eq(key, filters[key]);
    });

    const { data, error } = await query;
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    merged = merged.concat(rows);

    if (rows.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }

  return merged;
}

function getFilteredRows() {
  const keyword = toolbar.getSearchKeyword();
  let rows = [...allRows];

  if (invoiceFilter) {
    rows = rows.filter(row => clean(row.invoice) === invoiceFilter);
  }

  if (keyword) {
    rows = rows.filter(row => {
      return [
        row.list_no,
        row.scan_type,
        row.invoice,
        row.ship_date,
        row.country,
        row.location,
        row.material_no,
        row.box_no,
        row.material_name,
        row.work_type,
        row.check_status,
        row.user_name
      ].some(v => String(v ?? "").toLowerCase().includes(keyword));
    });
  }

  const { sortKey, sortDir } = tableManager.getSortState();
  rows.sort((a, b) => compareTableValue(a[sortKey], b[sortKey], sortDir));

  return rows;
}

function renderTable(reset = false) {
  filteredRowsCache = getFilteredRows();

  if (reset) {
    renderedCount = 0;
    tbody.innerHTML = "";
  }

  if (!filteredRowsCache.length) {
    tbody.innerHTML = `<tr><td colspan="24" class="table-empty">데이터가 없습니다.</td></tr>`;
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

  const html = nextRows.map((row, index) => `
    <tr data-row-id="${row.id}">
      <td><input type="checkbox" class="chk row-chk" data-id="${row.id}"></td>
      ${visibleColumns.map(col => renderCell(col.key, row, renderedCount + index)).join("")}
    </tr>
  `).join("");

  if (renderedCount === 0) tbody.innerHTML = html;
  else tbody.insertAdjacentHTML("beforeend", html);

  renderedCount += nextRows.length;

  tableManager.refreshAfterRender();
  tableManager.setStatus(`${num(filteredRowsCache.length)}건 / 화면 ${num(renderedCount)}건`);

  isAppending = false;
}

function renderCell(key, row, rowIndex = 0) {
  if (key === "list_no") return `<td data-col-key="list_no" class="mono-num">${rowIndex + 1}</td>`;
  if (key === "scan_type") return `<td data-col-key="scan_type">${esc(row.scan_type)}</td>`;
  if (key === "invoice") return `<td data-col-key="invoice" class="mono-num">${esc(row.invoice)}</td>`;
  if (key === "ship_date") return `<td data-col-key="ship_date" class="mono-num">${esc(row.ship_date)}</td>`;
  if (key === "country") return `<td data-col-key="country">${esc(row.country)}</td>`;
  if (key === "location") return `<td data-col-key="location">${esc(row.location)}</td>`;
  if (key === "material_no") return `<td data-col-key="material_no" class="mono-num">${esc(row.material_no)}</td>`;
  if (key === "box_no") return `<td data-col-key="box_no" class="mono-num">${esc(row.box_no)}</td>`;
  if (key === "material_name") return `<td data-col-key="material_name">${esc(row.material_name)}</td>`;
  if (key === "outbound_qty") return `<td data-col-key="outbound_qty" class="mono-num">${num(row.outbound_qty)}</td>`;
  if (key === "inbound_qty") return `<td data-col-key="inbound_qty" class="mono-num">${num(row.inbound_qty)}</td>`;
  if (key === "comparison") return `<td data-col-key="comparison" class="mono-num">${num(row.comparison)}</td>`;
  if (key === "mfg_date") return `<td data-col-key="mfg_date">${esc(row.mfg_date)}</td>`;
  if (key === "mfg_date_edit") return `<td data-col-key="mfg_date_edit">${esc(row.mfg_date_edit)}</td>`;
  if (key === "exp_date") return `<td data-col-key="exp_date">${esc(row.exp_date)}</td>`;
  if (key === "exp_date_edit") return `<td data-col-key="exp_date_edit">${esc(row.exp_date_edit)}</td>`;
  if (key === "product_qty") return `<td data-col-key="product_qty" class="mono-num">${num(row.product_qty)}</td>`;
  if (key === "outer_box_qty") return `<td data-col-key="outer_box_qty" class="mono-num">${num(row.outer_box_qty)}</td>`;
  if (key === "total_qty") return `<td data-col-key="total_qty" class="mono-num">${num(row.total_qty)}</td>`;
  if (key === "work_type") return `<td data-col-key="work_type">${renderWorkType(row.work_type)}</td>`;
  if (key === "check_status") return `<td data-col-key="check_status">${renderCheck(row.check_status)}</td>`;
  if (key === "scan_time") return `<td data-col-key="scan_time" class="mono-num">${esc(formatDateTime(row.scan_time || row.created_at))}</td>`;
  if (key === "user_name") return `<td data-col-key="user_name">${esc(row.user_name)}</td>`;
  return "";
}

function renderWorkType(value) {
  const v = clean(value);
  if (v === "CELL") return `<span class="badge badge-cell">CELL</span>`;
  if (v === "매대") return `<span class="badge badge-rack">매대</span>`;
  if (v === "설비") return `<span class="badge badge-eq">설비</span>`;
  return "";
}

function renderCheck(value) {
  const v = clean(value);
  if (v === "검수완료") return `<span class="badge badge-done">검수완료</span>`;
  if (v === "부분검수") return `<span class="badge badge-part">부분검수</span>`;
  return `<span class="badge badge-wait">대기</span>`;
}

function openAddModal() {
  editId = "";
  formModal.setTitle("작업로그 신규등록");
  setFormValues({});
  formModal.open();
}

function editSelectedRow() {
  const ids = tableManager.getSelectedIds().map(v => Number(v));
  if (ids.length !== 1) return tableManager.setStatus("수정은 1건만 선택");

  const row = allRows.find(item => Number(item.id) === ids[0]);
  if (!row) return;

  editId = row.id;
  formModal.setTitle("작업로그 수정");
  setFormValues(row);
  formModal.open();
}

async function saveFormRow() {
  const values = getFormValues();

  if (!values.invoice) {
    tableManager.setStatus("인보이스 입력 필요");
    return false;
  }

  const data = { ...values, user_name: currentUserName };

  if (editId) {
    const { error } = await supabaseClient.from(TABLE_NAME).update(data).eq("id", editId);
    if (error) {
      console.error(error);
      tableManager.setStatus("수정 실패");
      return false;
    }

    await loadRows();
    tableManager.setStatus("수정 완료");
    return true;
  }

  const { error } = await supabaseClient.from(TABLE_NAME).insert([data]);

  if (error) {
    console.error(error);
    tableManager.setStatus("등록 실패");
    return false;
  }

  await loadRows();
  tableManager.setStatus("등록 완료");
  return true;
}

async function deleteSelectedRows() {
  const ids = tableManager.getSelectedIds().map(v => Number(v));

  if (!ids.length) return tableManager.setStatus("삭제할 행 선택");
  if (!confirm(`${ids.length}건 삭제할까요?\n삭제 내역은 별도 로그에 저장됩니다.`)) return;

  const deleteRows = allRows
    .filter(row => ids.includes(Number(row.id)))
    .map(row => {
      const copy = { ...row };
      copy.original_id = copy.id;
      delete copy.id;

      copy.deleted_by = currentUserName;
      copy.deleted_at = new Date().toISOString();

      return copy;
    });

  const { error: logError } = await supabaseClient
    .from(DELETED_TABLE)
    .insert(deleteRows);

  if (logError) {
    console.error(logError);
    tableManager.setStatus("삭제로그 저장 실패");
    return;
  }

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
  tableManager.setStatus("삭제 완료 / 삭제로그 저장됨");
}

function downloadExcel() {
  const rows = filteredRowsCache.map((row, index) => ({
    NO: index + 1,
    입고검수: row.scan_type,
    인보이스: row.invoice,
    출고일: row.ship_date,
    국가: row.country,
    위치: row.location,
    코드: row.material_no,
    박스번호: row.box_no,
    자재내역: row.material_name,
    출고: row.outbound_qty,
    입고: row.inbound_qty,
    비교: row.comparison,
    제조일자: row.mfg_date,
    제조일자수정: row.mfg_date_edit,
    유통기한: row.exp_date,
    유통기한수정: row.exp_date_edit,
    제품: row.product_qty,
    외박스: row.outer_box_qty,
    합계: row.total_qty,
    구분: row.work_type,
    검수: row.check_status,
    작업시간: formatDateTime(row.scan_time || row.created_at),
    작업자: row.user_name
  }));

  downloadExcelFile({
    fileName: "worklog_scan.xlsx",
    sheetName: "worklog_scan",
    rows
  });

  tableManager.setStatus("엑셀 다운로드 완료");
}

function onTableScroll() {
  if (!printArea || isAppending || renderedCount >= filteredRowsCache.length) return;

  const remain = printArea.scrollHeight - printArea.scrollTop - printArea.clientHeight;
  if (remain < 300) appendNextRows();
}

function getFormModalHtml() {
  return `
    <div class="wms-form-grid">
      <div class="wms-form-row"><label class="wms-form-label">인보이스</label><input id="f-invoice" class="wms-form-input" type="text"></div>
      <div class="wms-form-row"><label class="wms-form-label">출고일</label><input id="f-ship-date" class="wms-form-input" type="text"></div>
      <div class="wms-form-row"><label class="wms-form-label">국가</label><input id="f-country" class="wms-form-input" type="text"></div>
      <div class="wms-form-row"><label class="wms-form-label">위치</label><input id="f-location" class="wms-form-input" type="text"></div>
      <div class="wms-form-row"><label class="wms-form-label">코드</label><input id="f-material-no" class="wms-form-input" type="text"></div>
      <div class="wms-form-row"><label class="wms-form-label">박스번호</label><input id="f-box-no" class="wms-form-input" type="text"></div>
      <div class="wms-form-row full"><label class="wms-form-label">자재내역</label><input id="f-material-name" class="wms-form-input" type="text"></div>
      <div class="wms-form-row"><label class="wms-form-label">출고</label><input id="f-outbound-qty" class="wms-form-input" type="number"></div>
      <div class="wms-form-row"><label class="wms-form-label">입고</label><input id="f-inbound-qty" class="wms-form-input" type="number"></div>
      <div class="wms-form-row"><label class="wms-form-label">제조일자</label><input id="f-mfg-date" class="wms-form-input" type="text"></div>
      <div class="wms-form-row"><label class="wms-form-label">제조일자수정</label><input id="f-mfg-date-edit" class="wms-form-input" type="text"></div>
      <div class="wms-form-row"><label class="wms-form-label">유통기한</label><input id="f-exp-date" class="wms-form-input" type="text"></div>
      <div class="wms-form-row"><label class="wms-form-label">유통기한수정</label><input id="f-exp-date-edit" class="wms-form-input" type="text"></div>
      <div class="wms-form-row"><label class="wms-form-label">구분</label><select id="f-work-type" class="wms-form-input"><option value="CELL">CELL</option><option value="매대">매대</option><option value="설비">설비</option></select></div>
    </div>
  `;
}

function getFormElements() {
  return {
    invoice: document.getElementById("f-invoice"),
    ship_date: document.getElementById("f-ship-date"),
    country: document.getElementById("f-country"),
    location: document.getElementById("f-location"),
    material_no: document.getElementById("f-material-no"),
    box_no: document.getElementById("f-box-no"),
    material_name: document.getElementById("f-material-name"),
    outbound_qty: document.getElementById("f-outbound-qty"),
    inbound_qty: document.getElementById("f-inbound-qty"),
    mfg_date: document.getElementById("f-mfg-date"),
    mfg_date_edit: document.getElementById("f-mfg-date-edit"),
    exp_date: document.getElementById("f-exp-date"),
    exp_date_edit: document.getElementById("f-exp-date-edit"),
    work_type: document.getElementById("f-work-type")
  };
}

function setFormValues(values) {
  const form = getFormElements();

  form.invoice.value = values.invoice ?? currentInvoice ?? "";
  form.ship_date.value = values.ship_date ?? "";
  form.country.value = values.country ?? "";
  form.location.value = values.location ?? currentLocation ?? "";
  form.material_no.value = values.material_no ?? "";
  form.box_no.value = values.box_no ?? "";
  form.material_name.value = values.material_name ?? "";
  form.outbound_qty.value = values.outbound_qty ?? 0;
  form.inbound_qty.value = values.inbound_qty ?? 1;
  form.mfg_date.value = values.mfg_date ?? "";
  form.mfg_date_edit.value = values.mfg_date_edit ?? values.mfg_date ?? "";
  form.exp_date.value = values.exp_date ?? "";
  form.exp_date_edit.value = values.exp_date_edit ?? values.exp_date ?? "";
  form.work_type.value = values.work_type ?? currentWorkType;
}

function getFormValues() {
  const form = getFormElements();

  const outboundQty = toInt(form.outbound_qty.value);
  const inboundQty = toInt(form.inbound_qty.value);
  const comparison = inboundQty - outboundQty;

  return {
    list_no: "",
    scan_type: "입고검수",
    invoice: form.invoice.value.trim(),
    ship_date: form.ship_date.value.trim(),
    country: form.country.value.trim(),
    location: form.location.value.trim(),
    material_no: form.material_no.value.trim(),
    box_no: form.box_no.value.trim(),
    material_name: form.material_name.value.trim(),
    outbound_qty: outboundQty,
    inbound_qty: inboundQty,
    comparison,
    mfg_date: form.mfg_date.value.trim(),
    mfg_date_edit: form.mfg_date_edit.value.trim(),
    exp_date: form.exp_date.value.trim(),
    exp_date_edit: form.exp_date_edit.value.trim(),
    product_qty: 0,
    outer_box_qty: 0,
    total_qty: 0,
    work_type: form.work_type.value,
    check_status: comparison === 0 ? "검수완료" : "부분검수",
    scan_time: new Date().toISOString()
  };
}

function dedupeRawRows(rows) {
  const map = new Map();

  rows.forEach(row => {
    const key = [
      row.id || "",
      clean(row.invoice),
      clean(row.material_no),
      clean(row.box_no),
      clean(row.mfg_date || row.manufacture_date),
      clean(row.exp_date || row.expiry_date),
      clean(row.inbound_qty || row.qty || row.total_qty)
    ].join("::");

    map.set(key, row);
  });

  return [...map.values()];
}

function dedupeRows(rows) {
  const map = new Map();

  rows.forEach(row => {
    const key = [
      clean(row.invoice),
      clean(row.material_no),
      clean(row.box_no),
      clean(row.mfg_date),
      clean(row.exp_date),
      toInt(row.inbound_qty)
    ].join("::");

    map.set(key, row);
  });

  return [...map.values()];
}

function isDuplicateScan(rows) {
  return rows.some(row => {
    return allRows.some(old => {
      return clean(old.invoice) === clean(row.invoice)
        && clean(old.material_no) === clean(row.material_no)
        && clean(old.box_no) === clean(row.box_no)
        && clean(old.exp_date) === clean(row.exp_date)
        && clean(old.work_type) === clean(row.work_type);
    });
  });
}

function playSound(type) {
  const id = {
    error: "sound-error",
    dup: "sound-dup",
    modal: "sound-modal",
    ok: "sound-ok"
  }[type];

  const audio = document.getElementById(id);
  if (!audio) return;

  try {
    audio.currentTime = 0;
    audio.play();
  } catch (e) {}
}

function setTodayInputs() {
  const today = todayText();
  setValue("dateStart", today);
  setValue("dateEnd", today);
}

function todayText() {
  return toDateInputText(new Date());
}

function todayNextText() {
  return addOneDay(todayText());
}

function addOneDay(value) {
  const d = new Date(`${value}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return toDateInputText(d);
}

function toDateInputText(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setScanStatus(text, type) {
  if (!scanStatus) return;

  scanStatus.textContent = text;
  scanStatus.classList.remove("ok", "warn", "err");
  if (type) scanStatus.classList.add(type);
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

function clean(value) {
  return String(value ?? "").trim();
}

function toInt(value) {
  const n = Number(String(value ?? "").replaceAll(",", "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 19);
  return d.toLocaleString("ko-KR", { hour12:false });
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