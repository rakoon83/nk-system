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

const TABLE_NAME = "expiry_register";
const BARCODE_TABLE_NAME = "barcode_master";
const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("expiry-register-tbody");
const printArea = document.getElementById("print-area");

let editId = "";
let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;
let barcodeMap = new Map();

createTopbar({
  mountId: "page-topbar",
  title: "유통기한 등록",
  subtitle: "expiry_register / Supabase 연동",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "expiry-register-toolbar",
  currentUserName,
  searchPlaceholder: "국가 / 코드 / 박스번호 / 자재내역 / 납품처명 / 사용자 / 비고 검색",
  buttons: {
    add: true,
    paste: true,
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
  tableId: "expiry-register-table",
  tbodyId: "expiry-register-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "expiry_register_table_columns",
  defaultSortKey: "id",
  defaultSortDir: "desc",
  columns: [
    { key: "no", label: "NO", width: 70, visible: true },
    { key: "country", label: "국가", width: 100, visible: true },
    { key: "material_no", label: "코드", width: 160, visible: true },
    { key: "box_no", label: "박스번호", width: 140, visible: true },
    { key: "material_name", label: "자재내역", width: 300, visible: true },
    { key: "customer_name", label: "납품처명", width: 220, visible: true },
    { key: "user_name", label: "사용자", width: 140, visible: true },
    { key: "note", label: "비고", width: 220, visible: true }
  ],
  sortMap: {
    no: 'thead th[data-col-key="no"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    material_no: 'thead th[data-col-key="material_no"] .th-inner',
    box_no: 'thead th[data-col-key="box_no"] .th-inner',
    material_name: 'thead th[data-col-key="material_name"] .th-inner',
    customer_name: 'thead th[data-col-key="customer_name"] .th-inner',
    user_name: 'thead th[data-col-key="user_name"] .th-inner',
    note: 'thead th[data-col-key="note"] .th-inner'
  },
  onSortChange: () => renderTable(true),
  onSelectionChange: (ids) => {
    toolbar.setDisabled("edit", ids.length !== 1);
    toolbar.setDisabled("remove", ids.length < 1);
  },
  onColumnChange: () => {
    renderTable(true);
  }
});

const formModal = createModal({
  mountId: "modal-root",
  modalId: "expiry-register-form-modal",
  title: "개별 등록",
  bodyHtml: getFormModalHtml(),
  confirmText: "저장",
  cancelText: "닫기"
});

const pasteModal = createModal({
  mountId: "modal-root",
  modalId: "expiry-register-paste-modal",
  title: "대량 등록",
  bodyHtml: getPasteModalHtml(),
  confirmText: "등록",
  cancelText: "닫기"
});

init();

async function init() {
  bindEvents();
  tableManager.init();
  await loadBarcodeMap();
  await loadRows();
}

function bindEvents() {
  toolbar.on("add", openAddModal);
  toolbar.on("paste", openPasteModal);
  toolbar.on("edit", editSelectedRow);
  toolbar.on("remove", deleteSelectedRows);
  toolbar.on("download", downloadExcel);
  toolbar.on("print", () => window.print());

  toolbar.searchInput?.addEventListener("input", () => renderTable(true));

  formModal.onConfirm(() => saveFormRow());
  pasteModal.onConfirm(() => savePasteRows());

  if (printArea) {
    printArea.addEventListener("scroll", onTableScroll, { passive: true });
  }

  setTimeout(bindMaterialAutoFillEvents, 0);
}

function bindMaterialAutoFillEvents() {
  const materialInput = document.getElementById("f-material-no");
  if (!materialInput) return;

  materialInput.addEventListener("input", () => {
    applyBarcodeAutoFill(materialInput.value);
  });

  materialInput.addEventListener("blur", () => {
    applyBarcodeAutoFill(materialInput.value);
  });
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

async function fetchAllRows(tableName, orderByCreated = true) {
  let from = 0;
  let merged = [];

  while (true) {
    const to = from + FETCH_PAGE_SIZE - 1;

    let query = supabaseClient
      .from(tableName)
      .select("*");

    if (orderByCreated) {
      query = query.order("created_at", { ascending: false });
    }

    query = query.range(from, to);

    const { data, error } = await query;

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    merged = merged.concat(rows);

    if (rows.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }

  return merged;
}

async function loadBarcodeMap() {
  try {
    const rows = await fetchAllRows(BARCODE_TABLE_NAME, false);
    const map = new Map();

    rows.forEach((row) => {
      const key = normalizeMaterialNo(row.material_no);
      if (!key) return;
      if (map.has(key)) return;

      map.set(key, {
        box_no: String(row.box_no ?? "").trim(),
        material_name: String(row.material_name ?? "").trim()
      });
    });

    barcodeMap = map;
  } catch (error) {
    console.error(error);
    barcodeMap = new Map();
  }
}

async function loadRows() {
  tableManager.setStatus("불러오는 중...");

  try {
    const data = await fetchAllRows(TABLE_NAME);
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
        row.id,
        row.country,
        row.material_no,
        row.box_no,
        row.material_name,
        row.customer_name,
        row.user_name,
        row.note,
        row.created_at
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
        <td colspan="9" class="table-empty">데이터가 없습니다.</td>
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
  tableManager.setStatus(`${num(filteredRowsCache.length)}건 / 화면 ${num(renderedCount)}건`);

  isAppending = false;
}

function renderCell(key, row) {
  if (key === "no") return `<td data-col-key="no" class="mono-num">${esc(row.no)}</td>`;
  if (key === "country") return `<td data-col-key="country">${esc(row.country)}</td>`;
  if (key === "material_no") return `<td data-col-key="material_no" class="mono-num">${esc(row.material_no)}</td>`;
  if (key === "box_no") return `<td data-col-key="box_no" class="mono-num">${esc(row.box_no)}</td>`;
  if (key === "material_name") return `<td data-col-key="material_name">${esc(row.material_name)}</td>`;
  if (key === "customer_name") return `<td data-col-key="customer_name">${esc(row.customer_name)}</td>`;
  if (key === "user_name") return `<td data-col-key="user_name">${esc(row.user_name)}</td>`;
  if (key === "note") return `<td data-col-key="note">${esc(row.note)}</td>`;
  return "";
}

function getSelectedIds() {
  return tableManager.getSelectedIds().map(v => Number(v));
}

function openAddModal() {
  editId = "";
  formModal.setTitle("개별 등록");
  setFormValues({
    country: "",
    material_no: "",
    box_no: "",
    material_name: "",
    customer_name: "",
    user_name: currentUserName,
    note: ""
  });
  formModal.open();
  setTimeout(() => {
    bindMaterialAutoFillEvents();
    document.getElementById("f-country")?.focus();
  }, 30);
}

function openPasteModal() {
  getPasteTextarea().value = "";
  pasteModal.open();
  setTimeout(() => getPasteTextarea().focus(), 30);
}

function editSelectedRow() {
  const ids = getSelectedIds();

  if (ids.length !== 1) {
    tableManager.setStatus("수정은 1건만 선택");
    return;
  }

  const row = allRows.find(item => Number(item.id) === Number(ids[0]));
  if (!row) return;

  editId = row.id;
  formModal.setTitle("선택 수정");
  setFormValues({
    country: row.country ?? "",
    material_no: row.material_no ?? "",
    box_no: row.box_no ?? "",
    material_name: row.material_name ?? "",
    customer_name: row.customer_name ?? "",
    user_name: row.user_name ?? currentUserName,
    note: row.note ?? ""
  });
  formModal.open();
  setTimeout(() => {
    bindMaterialAutoFillEvents();
  }, 30);
}

async function deleteSelectedRows() {
  const ids = getSelectedIds();

  if (!ids.length) {
    tableManager.setStatus("삭제할 행을 선택");
    return;
  }

  openConfirm({
    mountId: "modal-root",
    title: "삭제 확인",
    message: `선택한 ${num(ids.length)}건을 삭제할까요?`,
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
      tableManager.setStatus(`${num(ids.length)}건 삭제 완료`);
    }
  });
}

async function saveFormRow() {
  const values = getFormValues();
  const filled = fillFromBarcode(values);

  const data = {
    country: filled.country,
    material_no: filled.material_no,
    box_no: filled.box_no,
    material_name: filled.material_name,
    customer_name: filled.customer_name,
    user_name: filled.user_name,
    note: filled.note
  };

  if (
    !data.country &&
    !data.material_no &&
    !data.box_no &&
    !data.material_name &&
    !data.customer_name
  ) {
    tableManager.setStatus("국가 / 코드 / 박스번호 / 자재내역 / 납품처명 중 1개 이상 입력");
    return false;
  }

  if (editId) {
    const { error } = await supabaseClient
      .from(TABLE_NAME)
      .update(data)
      .eq("id", editId);

    if (error) {
      console.error(error);
      tableManager.setStatus("수정 실패");
      return false;
    }

    await loadRows();
    tableManager.setStatus("수정 완료");
    return true;
  }

  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .insert([data]);

  if (error) {
    console.error(error);
    tableManager.setStatus(`등록 실패: ${error.message || ""}`);
    return false;
  }

  await loadRows();
  tableManager.setStatus("등록 완료");
  return true;
}

async function savePasteRows() {
  const text = getPasteTextarea().value.trim();

  if (!text) {
    tableManager.setStatus("붙여넣기 데이터가 없습니다");
    return false;
  }

  const lines = text.split(/\r?\n/).filter(Boolean);
  const newRows = [];

  for (const line of lines) {
    const cols = line.split("\t");
    if (cols.length < 7) continue;

    const firstCol = String(cols[0] || "").trim();
    const secondCol = String(cols[1] || "").trim();
    const thirdCol = String(cols[2] || "").trim();
    const fourthCol = String(cols[3] || "").trim();
    const fifthCol = String(cols[4] || "").trim();
    const sixthCol = String(cols[5] || "").trim();
    const seventhCol = String(cols[6] || "").trim();

    if (
      firstCol === "국가" ||
      secondCol === "코드" ||
      thirdCol === "박스번호" ||
      fourthCol === "자재내역" ||
      fifthCol === "납풍처명" ||
      fifthCol === "납품처명" ||
      sixthCol === "사용자" ||
      seventhCol === "비고"
    ) {
      continue;
    }

    const row = fillFromBarcode({
      country: firstCol,
      material_no: secondCol,
      box_no: thirdCol,
      material_name: fourthCol,
      customer_name: fifthCol,
      user_name: sixthCol || currentUserName,
      note: seventhCol
    });

    if (
      row.country ||
      row.material_no ||
      row.box_no ||
      row.material_name ||
      row.customer_name
    ) {
      newRows.push(row);
    }
  }

  if (!newRows.length) {
    tableManager.setStatus("등록할 데이터가 없습니다");
    return false;
  }

  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .insert(newRows);

  if (error) {
    console.error(error);
    tableManager.setStatus(`대량 등록 실패: ${error.message || ""}`);
    return false;
  }

  await loadRows();
  tableManager.setStatus(`${num(newRows.length)}건 등록 완료`);
  return true;
}

function applyBarcodeAutoFill(materialNoValue) {
  const materialNo = normalizeMaterialNo(materialNoValue);
  if (!materialNo) return;

  const matched = barcodeMap.get(materialNo);
  if (!matched) return;

  const form = getFormElements();

  if (form.box_no && !String(form.box_no.value || "").trim()) {
    form.box_no.value = matched.box_no || "";
  }

  if (form.material_name && !String(form.material_name.value || "").trim()) {
    form.material_name.value = matched.material_name || "";
  }
}

function fillFromBarcode(values) {
  const materialNo = String(values.material_no || "").trim();
  const matched = barcodeMap.get(normalizeMaterialNo(materialNo)) || {};

  return {
    country: String(values.country || "").trim(),
    material_no: materialNo,
    box_no: String(values.box_no || "").trim() || String(matched.box_no || "").trim(),
    material_name: String(values.material_name || "").trim() || String(matched.material_name || "").trim(),
    customer_name: String(values.customer_name || "").trim(),
    user_name: String(values.user_name || "").trim() || currentUserName,
    note: String(values.note || "").trim()
  };
}

function downloadExcel() {
  const rows = filteredRowsCache.map(row => ({
    NO: row.no,
    국가: row.country,
    코드: row.material_no,
    박스번호: row.box_no,
    자재내역: row.material_name,
    납품처명: row.customer_name,
    사용자: row.user_name,
    비고: row.note
  }));

  downloadExcelFile({
    fileName: "expiry_register.xlsx",
    sheetName: "expiry_register",
    rows
  });

  tableManager.setStatus("엑셀 다운로드 완료");
}

function getFormModalHtml() {
  return `
    <div class="wms-form-grid">
      <div class="wms-form-row">
        <label class="wms-form-label" for="f-country">국가</label>
        <input id="f-country" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-material-no">코드</label>
        <input id="f-material-no" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-box-no">박스번호</label>
        <input id="f-box-no" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-material-name">자재내역</label>
        <input id="f-material-name" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-customer-name">납품처명</label>
        <input id="f-customer-name" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-user-name">사용자</label>
        <input id="f-user-name" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-note">비고</label>
        <input id="f-note" class="wms-form-input" type="text">
      </div>
    </div>
  `;
}

function getPasteModalHtml() {
  return `
    <textarea id="paste-text" class="wms-form-textarea" placeholder="엑셀에서 복사 후 Ctrl+V"></textarea>
    <div class="wms-help-text">열 순서 : 국가 / 코드 / 박스번호 / 자재내역 / 납품처명 / 사용자 / 비고</div>
  `;
}

function getFormElements() {
  return {
    country: document.getElementById("f-country"),
    material_no: document.getElementById("f-material-no"),
    box_no: document.getElementById("f-box-no"),
    material_name: document.getElementById("f-material-name"),
    customer_name: document.getElementById("f-customer-name"),
    user_name: document.getElementById("f-user-name"),
    note: document.getElementById("f-note")
  };
}

function setFormValues(values) {
  const form = getFormElements();
  form.country.value = values.country ?? "";
  form.material_no.value = values.material_no ?? "";
  form.box_no.value = values.box_no ?? "";
  form.material_name.value = values.material_name ?? "";
  form.customer_name.value = values.customer_name ?? "";
  form.user_name.value = values.user_name ?? "";
  form.note.value = values.note ?? "";
}

function getFormValues() {
  const form = getFormElements();
  return {
    country: form.country.value.trim(),
    material_no: form.material_no.value.trim(),
    box_no: form.box_no.value.trim(),
    material_name: form.material_name.value.trim(),
    customer_name: form.customer_name.value.trim(),
    user_name: form.user_name.value.trim(),
    note: form.note.value.trim()
  };
}

function getPasteTextarea() {
  return document.getElementById("paste-text");
}

function normalizeMaterialNo(value) {
  return String(value ?? "").replace(/\s+/g, "").trim().toUpperCase();
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