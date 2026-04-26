// /assets/js/pages/issues/expiry_free.js

import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260422";
import { createTopbar } from "/assets/js/shared/topbar.js";
import { createToolbar } from "/assets/js/shared/toolbar.js";
import { createTableManager, compareTableValue } from "/assets/js/shared/table.js";
import { createModal, openConfirm } from "/assets/js/shared/modal.js";
import { downloadExcelFile } from "/assets/js/shared/excel.js";

checkAuth();
preparePageContent("app-nav", "page-content");
renderNav({ mountId: "app-nav" });

const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE_NAME = "expiry_free_register";
const SAP_DOC_TABLE = "sap_doc";
const DEFECT_TABLE = "defect_upload";

const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("free-tbody");
const printArea = document.getElementById("print-area");

let editId = "";
let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

createTopbar({
  mountId: "page-topbar",
  title: "이적 작업 관리",
  subtitle: "expiry_free_register / Supabase 연동",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "free-toolbar",
  currentUserName,
  searchPlaceholder: "Invoice / 국가 / 출고일 / 상차위치 / 컨테이너 / 사용자 / 작업자 검색",
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
  tableId: "free-table",
  tbodyId: "free-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "expiry_free_table_columns",
  defaultSortKey: "id",
  defaultSortDir: "desc",
  columns: [
    { key: "no", label: "NO", width: 70, visible: true },
    { key: "status", label: "구분", width: 120, visible: true },
    { key: "invoice", label: "Invoice", width: 150, visible: true },
    { key: "country", label: "국가", width: 120, visible: true },
    { key: "ship_date", label: "출고일", width: 130, visible: true },
    { key: "location", label: "상차위치", width: 170, visible: true },
    { key: "container", label: "컨테이너", width: 130, visible: true },
    { key: "user_name", label: "사용자", width: 120, visible: true },
    { key: "worker_name", label: "작업자", width: 120, visible: true }
  ],
  sortMap: {
    no: 'thead th[data-col-key="no"] .th-inner',
    status: 'thead th[data-col-key="status"] .th-inner',
    invoice: 'thead th[data-col-key="invoice"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    ship_date: 'thead th[data-col-key="ship_date"] .th-inner',
    location: 'thead th[data-col-key="location"] .th-inner',
    container: 'thead th[data-col-key="container"] .th-inner',
    user_name: 'thead th[data-col-key="user_name"] .th-inner',
    worker_name: 'thead th[data-col-key="worker_name"] .th-inner'
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
  modalId: "free-form-modal",
  title: "개별 등록",
  bodyHtml: getFormModalHtml(),
  confirmText: "저장",
  cancelText: "닫기"
});

const pasteModal = createModal({
  mountId: "modal-root",
  modalId: "free-paste-modal",
  title: "대량 등록",
  bodyHtml: getPasteModalHtml(),
  confirmText: "등록",
  cancelText: "닫기"
});

init();

async function init() {
  bindEvents();
  tableManager.init();
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

  tbody?.addEventListener("click", onTableClick);

  if (printArea) {
    printArea.addEventListener("scroll", onTableScroll, { passive: true });
  }
}

function bindInvoiceAutoFill() {
  const input = document.getElementById("f-invoice");
  if (!input) return;

  input.addEventListener("change", () => fillInvoiceInfo(input.value));
  input.addEventListener("blur", () => fillInvoiceInfo(input.value));
}

async function fillInvoiceInfo(invoice) {
  const inv = clean(invoice);
  if (!inv) return;

  const form = getFormElements();

  const { data: sapRows } = await supabaseClient
    .from(SAP_DOC_TABLE)
    .select("*")
    .eq("invoice", inv)
    .limit(1);

  const sap = sapRows?.[0];

  if (sap) {
    if (form.country && !form.country.value) form.country.value = clean(sap.country);
    if (form.ship_date && !form.ship_date.value) form.ship_date.value = clean(sap.ship_date);
    if (form.container && !form.container.value) form.container.value = clean(sap.container);
  }

  const { data: defectRows } = await supabaseClient
    .from(DEFECT_TABLE)
    .select("*")
    .eq("invoice", inv)
    .limit(1);

  const defect = defectRows?.[0];

  if (defect) {
    if (form.location && !form.location.value) form.location.value = clean(defect.location);
  }
}

function onTableClick(e) {
  const btn = e.target.closest(".status-btn");
  if (!btn) return;

  toggleStatus(btn.dataset.id, btn.dataset.status);
}

async function toggleStatus(id, status) {
  const nextStatus = status === "완료" ? "대기" : "완료";

  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .update({
      status: nextStatus,
      worker_name: nextStatus === "완료" ? currentUserName : ""
    })
    .eq("id", id);

  if (error) {
    console.error(error);
    tableManager.setStatus("상태 변경 실패");
    return;
  }

  await loadRows();
}

function onTableScroll() {
  if (!printArea || isAppending) return;
  if (renderedCount >= filteredRowsCache.length) return;

  const remain = printArea.scrollHeight - printArea.scrollTop - printArea.clientHeight;
  if (remain < 300) appendNextRows();
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
    allRows = await fetchAllRows(TABLE_NAME);
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
    rows = rows.filter(row => [
      row.id,
      row.status,
      row.invoice,
      row.country,
      row.ship_date,
      row.location,
      row.container,
      row.user_name,
      row.worker_name
    ].some(v => String(v ?? "").toLowerCase().includes(keyword)));
  }

  const { sortKey, sortDir } = tableManager.getSortState();

  rows.sort((a, b) => compareTableValue(a[sortKey], b[sortKey], sortDir));
  rows.forEach((row, index) => row.no = index + 1);

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
        <td colspan="10" class="table-empty">데이터가 없습니다.</td>
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

  if (renderedCount === 0) tbody.innerHTML = html;
  else tbody.insertAdjacentHTML("beforeend", html);

  renderedCount += nextRows.length;

  tableManager.refreshAfterRender();
  tableManager.setStatus(`${num(filteredRowsCache.length)}건 / 화면 ${num(renderedCount)}건`);

  isAppending = false;
}

function renderCell(key, row) {
  if (key === "no") return `<td data-col-key="no" class="mono-num">${esc(row.no)}</td>`;

  if (key === "status") {
    const status = row.status || "대기";
    const cls = status === "완료" ? "status-done" : "status-wait";
    const text = status === "완료" ? "작업완료" : "작업대기";

    return `
      <td data-col-key="status">
        <button type="button" class="status-btn ${cls}" data-id="${row.id}" data-status="${esc(status)}">
          ${esc(text)}
        </button>
      </td>
    `;
  }

  if (key === "invoice") return `<td data-col-key="invoice" class="mono-num">${esc(row.invoice)}</td>`;
  if (key === "country") return `<td data-col-key="country">${esc(row.country)}</td>`;
  if (key === "ship_date") return `<td data-col-key="ship_date">${esc(row.ship_date)}</td>`;
  if (key === "location") return `<td data-col-key="location">${esc(row.location)}</td>`;
  if (key === "container") return `<td data-col-key="container">${esc(row.container)}</td>`;
  if (key === "user_name") return `<td data-col-key="user_name">${esc(row.user_name)}</td>`;
  if (key === "worker_name") return `<td data-col-key="worker_name">${esc(row.worker_name)}</td>`;

  return "";
}

function getSelectedIds() {
  return tableManager.getSelectedIds().map(v => Number(v));
}

function openAddModal() {
  editId = "";
  formModal.setTitle("개별 등록");

  setFormValues({
    list_no: "",
    status: "대기",
    invoice: "",
    country: "",
    ship_date: "",
    location: "",
    container: "",
    user_name: currentUserName,
    worker_name: ""
  });

  formModal.open();

  setTimeout(() => {
    bindInvoiceAutoFill();
    document.getElementById("f-invoice")?.focus();
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
    list_no: row.list_no ?? "",
    status: row.status ?? "대기",
    invoice: row.invoice ?? "",
    country: row.country ?? "",
    ship_date: row.ship_date ?? "",
    location: row.location ?? "",
    container: row.container ?? "",
    user_name: row.user_name ?? currentUserName,
    worker_name: row.worker_name ?? ""
  });

  formModal.open();

  setTimeout(() => {
    bindInvoiceAutoFill();
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

  const data = {
    list_no: values.list_no,
    status: values.status || "대기",
    invoice: values.invoice,
    country: values.country,
    ship_date: values.ship_date,
    location: values.location,
    container: values.container,
    user_name: values.user_name || currentUserName,
    worker_name: values.worker_name
  };

  if (!data.invoice) {
    tableManager.setStatus("Invoice 입력 필요");
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

    const listNo = clean(cols[0]);
    const status = clean(cols[1]) || "대기";
    const invoice = clean(cols[2]);
    const country = clean(cols[3]);
    const shipDate = clean(cols[4]);
    const location = clean(cols[5]);
    const container = clean(cols[6]);
    const userName = clean(cols[7]) || currentUserName;
    const workerName = clean(cols[8]);

    if (
      listNo === "no" ||
      status === "구분" ||
      invoice === "Invoice" ||
      country === "국가"
    ) continue;

    if (invoice) {
      newRows.push({
        list_no: listNo,
        status,
        invoice,
        country,
        ship_date: shipDate,
        location,
        container,
        user_name: userName,
        worker_name: workerName
      });
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

function downloadExcel() {
  const rows = filteredRowsCache.map(row => ({
    NO: row.no,
    구분: row.status === "완료" ? "출고완료" : "출고대기",
    Invoice: row.invoice,
    국가: row.country,
    출고일: row.ship_date,
    상차위치: row.location,
    컨테이너: row.container,
    사용자: row.user_name,
    작업자: row.worker_name
  }));

  downloadExcelFile({
    fileName: "expiry_free_register.xlsx",
    sheetName: "expiry_free",
    rows
  });

  tableManager.setStatus("엑셀 다운로드 완료");
}

function getFormModalHtml() {
  return `
    <div class="wms-form-grid">
      <div class="wms-form-row">
        <label class="wms-form-label" for="f-list-no">NO</label>
        <input id="f-list-no" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-status">구분</label>
        <select id="f-status" class="wms-form-input">
          <option value="대기">작업대기</option>
          <option value="완료">작업완료</option>
        </select>
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-invoice">Invoice</label>
        <input id="f-invoice" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-country">국가</label>
        <input id="f-country" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-ship-date">출고일</label>
        <input id="f-ship-date" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-location">상차위치</label>
        <input id="f-location" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-container">컨테이너</label>
        <input id="f-container" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-user-name">사용자</label>
        <input id="f-user-name" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-worker-name">작업자</label>
        <input id="f-worker-name" class="wms-form-input" type="text">
      </div>
    </div>
  `;
}

function getPasteModalHtml() {
  return `
    <textarea id="paste-text" class="wms-form-textarea" placeholder="엑셀에서 복사 후 Ctrl+V"></textarea>
    <div class="wms-help-text">열 순서 : NO / 구분 / Invoice / 국가 / 출고일 / 상차위치 / 컨테이너 / 사용자 / 작업자</div>
  `;
}

function getFormElements() {
  return {
    list_no: document.getElementById("f-list-no"),
    status: document.getElementById("f-status"),
    invoice: document.getElementById("f-invoice"),
    country: document.getElementById("f-country"),
    ship_date: document.getElementById("f-ship-date"),
    location: document.getElementById("f-location"),
    container: document.getElementById("f-container"),
    user_name: document.getElementById("f-user-name"),
    worker_name: document.getElementById("f-worker-name")
  };
}

function setFormValues(values) {
  const form = getFormElements();

  form.list_no.value = values.list_no ?? "";
  form.status.value = values.status ?? "대기";
  form.invoice.value = values.invoice ?? "";
  form.country.value = values.country ?? "";
  form.ship_date.value = values.ship_date ?? "";
  form.location.value = values.location ?? "";
  form.container.value = values.container ?? "";
  form.user_name.value = values.user_name ?? "";
  form.worker_name.value = values.worker_name ?? "";
}

function getFormValues() {
  const form = getFormElements();

  return {
    list_no: form.list_no.value.trim(),
    status: form.status.value.trim(),
    invoice: form.invoice.value.trim(),
    country: form.country.value.trim(),
    ship_date: form.ship_date.value.trim(),
    location: form.location.value.trim(),
    container: form.container.value.trim(),
    user_name: form.user_name.value.trim(),
    worker_name: form.worker_name.value.trim()
  };
}

function getPasteTextarea() {
  return document.getElementById("paste-text");
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