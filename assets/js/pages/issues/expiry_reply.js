import { checkAuth, getLoginUser } from "/assets/js/core/auth.js";
import { renderNav, preparePageContent } from "/assets/js/core/nav.js?v=20260422";
import { createTopbar } from "/assets/js/shared/topbar.js";
import { createToolbar } from "/assets/js/shared/toolbar.js";
import { createTableManager, compareTableValue } from "/assets/js/shared/table.js";
import { createModal } from "/assets/js/shared/modal.js";
import { downloadExcelFile } from "/assets/js/shared/excel.js";

checkAuth();
preparePageContent("app-nav", "page-content");

renderNav({
  mountId: "app-nav"
});

const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE_NAME = "expiry_reply";
const LOG_TABLE = "expiry_reply_log";
const REGISTER_TABLE = "expiry_register";
const SAP_DOC_TABLE = "sap_doc";
const SAP_ITEM_TABLE = "sap_item";
const WMS_TABLE = "wms_attribute_b";

const FETCH_PAGE_SIZE = 1000;
const RENDER_PAGE_SIZE = 500;

const loginUser = getLoginUser();
const currentUserName = loginUser?.name || loginUser?.id || "-";

const tbody = document.getElementById("expiry-reply-tbody");
const printArea = document.getElementById("print-area");

let editId = "";
let allRows = [];
let filteredRowsCache = [];
let renderedCount = 0;
let isAppending = false;

createTopbar({
  mountId: "page-topbar",
  title: "유통기한 회신",
  subtitle: "미입고 → 입고 → 처리완료",
  rightHtml: `<div class="wms-topbar-chip">DB<strong>SUPABASE</strong></div>`
});

const toolbar = createToolbar({
  mountId: "expiry-reply-toolbar",
  currentUserName,
  searchPlaceholder: "로케이션 / 출고일 / 국가 / 코드 / 박스번호 / 자재내역 / 납품처명 / 담당자 / 사용자 / 비고 검색",
  buttons: {
    add: true,
    paste: false,
    edit: true,
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
  tableId: "expiry-reply-table",
  tbodyId: "expiry-reply-tbody",
  checkboxAllId: "chk-all",
  statusId: "page-status",
  searchInputId: "toolbar-search-input",
  configButtonId: "table-config-btn",
  configPanelId: "table-config-panel",
  storageKey: "expiry_reply_table_columns",
  defaultSortKey: "id",
  defaultSortDir: "desc",
  columns: [
    { key: "no", label: "NO", width: 70, visible: true },
    { key: "invoice", label: "로케이션", width: 170, visible: true },
    { key: "ship_date", label: "출고일", width: 120, visible: true },
    { key: "country", label: "국가", width: 100, visible: true },
    { key: "material_no", label: "코드", width: 170, visible: true },
    { key: "box_no", label: "박스번호", width: 150, visible: true },
    { key: "material_name", label: "자재내역", width: 320, visible: true },
    { key: "customer_name", label: "납품처명", width: 220, visible: true },
    { key: "manager", label: "담당자", width: 140, visible: true },
    { key: "created_at", label: "등록일", width: 170, visible: true },
    { key: "reply_at", label: "처리일", width: 170, visible: true },
    { key: "reply_status", label: "상태", width: 130, visible: true },
    { key: "reply_user", label: "사용자", width: 140, visible: true },
    { key: "note", label: "비고", width: 240, visible: true }
  ],
  sortMap: {
    no: 'thead th[data-col-key="no"] .th-inner',
    invoice: 'thead th[data-col-key="invoice"] .th-inner',
    ship_date: 'thead th[data-col-key="ship_date"] .th-inner',
    country: 'thead th[data-col-key="country"] .th-inner',
    material_no: 'thead th[data-col-key="material_no"] .th-inner',
    box_no: 'thead th[data-col-key="box_no"] .th-inner',
    material_name: 'thead th[data-col-key="material_name"] .th-inner',
    customer_name: 'thead th[data-col-key="customer_name"] .th-inner',
    manager: 'thead th[data-col-key="manager"] .th-inner',
    created_at: 'thead th[data-col-key="created_at"] .th-inner',
    reply_at: 'thead th[data-col-key="reply_at"] .th-inner',
    reply_status: 'thead th[data-col-key="reply_status"] .th-inner',
    reply_user: 'thead th[data-col-key="reply_user"] .th-inner',
    note: 'thead th[data-col-key="note"] .th-inner'
  },
  onSortChange: () => renderTable(true),
  onSelectionChange: (ids) => {
    toolbar.setDisabled("edit", ids.length !== 1);
  },
  onColumnChange: () => renderTable(true)
});

const formModal = createModal({
  mountId: "modal-root",
  modalId: "expiry-reply-form-modal",
  title: "개별 등록",
  bodyHtml: getFormModalHtml(),
  confirmText: "저장",
  cancelText: "닫기"
});

init();

async function init() {
  bindEvents();
  tableManager.init();

  await autoCreateReplyRows();
  await loadRows();
}

function bindEvents() {
  toolbar.on("add", openAddModal);
  toolbar.on("edit", editSelectedRow);
  toolbar.on("download", downloadExcel);
  toolbar.on("print", () => window.print());

  toolbar.searchInput?.addEventListener("input", () => renderTable(true));
  formModal.onConfirm(() => saveFormRow());

  tbody?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".reply-btn");
    if (!btn) return;

    const id = btn.dataset.id;
    const status = btn.dataset.status;

    if (!id) return;
    if (status === "미입고") return;

    if (status === "입고") {
      await changeStatus(id, "처리완료");
      return;
    }

    if (status === "처리완료") {
      await changeStatus(id, "입고");
    }
  });

  if (printArea) {
    printArea.addEventListener("scroll", onTableScroll, { passive: true });
  }
}

async function autoCreateReplyRows() {
  tableManager.setStatus("자동 매칭 중...");

  try {
    const registerRows = await fetchAllRows(REGISTER_TABLE);
    const sapDocRows = await fetchAllRows(SAP_DOC_TABLE);
    const sapItemRows = await fetchAllRows(SAP_ITEM_TABLE);
    const wmsRows = await fetchAllRows(WMS_TABLE);
    const replyRows = await fetchAllRows(TABLE_NAME);

    const existingKeys = new Set(
      replyRows.map(row => makeKey(row.invoice, row.material_no, row.note))
    );

    const insertRows = [];
    const updateRows = [];

    registerRows.forEach(reg => {
      const regCountry = clean(reg.country);
      const regCode = clean(reg.material_no);
      const regNote = clean(reg.note);

      if (!regCountry) return;

      const matchedDocs = sapDocRows.filter(doc => clean(doc.country) === regCountry);

      matchedDocs.forEach(doc => {
        const invoice = clean(doc.invoice);
        if (!invoice) return;

        if (regCode) {
          const matchedItems = sapItemRows.filter(item => {
            return clean(item.invoice) === invoice &&
                   clean(item.material_no) === regCode;
          });

          matchedItems.forEach(item => {
            const materialNo = clean(item.material_no);
            const status = hasWmsInvoiceCode(wmsRows, invoice, materialNo) ? "입고" : "미입고";
            const key = makeKey(invoice, materialNo, regNote);
            const oldRow = replyRows.find(row => makeKey(row.invoice, row.material_no, row.note) === key);

            if (oldRow) {
              const updateData = {};

              if (clean(oldRow.ship_date) !== clean(doc.ship_date)) {
                updateData.ship_date = clean(doc.ship_date);
              }

              if (clean(oldRow.country) !== clean(doc.country)) {
                updateData.country = clean(doc.country);
              }

              if (clean(oldRow.box_no) !== clean(item.box_no || reg.box_no)) {
                updateData.box_no = clean(item.box_no || reg.box_no);
              }

              if (clean(oldRow.material_name) !== clean(item.material_name || reg.material_name)) {
                updateData.material_name = clean(item.material_name || reg.material_name);
              }

              if (clean(oldRow.customer_name) !== clean(doc.customer_name || reg.customer_name)) {
                updateData.customer_name = clean(doc.customer_name || reg.customer_name);
              }

              if (clean(oldRow.manager) !== clean(doc.manager)) {
                updateData.manager = clean(doc.manager);
              }

              if (clean(oldRow.reply_status) !== "처리완료" && clean(oldRow.reply_status) !== status) {
                updateData.reply_status = status;
              }

              if (Object.keys(updateData).length) {
                updateRows.push({
                  id: oldRow.id,
                  invoice,
                  material_no: materialNo,
                  old_status: clean(oldRow.reply_status),
                  new_status: updateData.reply_status || clean(oldRow.reply_status),
                  updateData
                });
              }

              return;
            }

            if (existingKeys.has(key)) return;
            existingKeys.add(key);

            insertRows.push({
              invoice,
              ship_date: clean(doc.ship_date),
              country: clean(doc.country),
              material_no: materialNo,
              box_no: clean(item.box_no || reg.box_no),
              material_name: clean(item.material_name || reg.material_name),
              customer_name: clean(doc.customer_name || reg.customer_name),
              manager: clean(doc.manager),
              note: regNote,
              reply_status: status,
              reply_at: "",
              reply_user: ""
            });
          });

          return;
        }

        const status = hasWmsInvoice(wmsRows, invoice) ? "입고" : "미입고";
        const key = makeKey(invoice, "", regNote);
        const oldRow = replyRows.find(row => makeKey(row.invoice, row.material_no, row.note) === key);

        if (oldRow) {
          const updateData = {};

          if (clean(oldRow.ship_date) !== clean(doc.ship_date)) {
            updateData.ship_date = clean(doc.ship_date);
          }

          if (clean(oldRow.country) !== clean(doc.country)) {
            updateData.country = clean(doc.country);
          }

          if (clean(oldRow.customer_name) !== clean(doc.customer_name || reg.customer_name)) {
            updateData.customer_name = clean(doc.customer_name || reg.customer_name);
          }

          if (clean(oldRow.manager) !== clean(doc.manager)) {
            updateData.manager = clean(doc.manager);
          }

          if (clean(oldRow.reply_status) !== "처리완료" && clean(oldRow.reply_status) !== status) {
            updateData.reply_status = status;
          }

          if (Object.keys(updateData).length) {
            updateRows.push({
              id: oldRow.id,
              invoice,
              material_no: "",
              old_status: clean(oldRow.reply_status),
              new_status: updateData.reply_status || clean(oldRow.reply_status),
              updateData
            });
          }

          return;
        }

        if (existingKeys.has(key)) return;
        existingKeys.add(key);

        insertRows.push({
          invoice,
          ship_date: clean(doc.ship_date),
          country: clean(doc.country),
          material_no: "",
          box_no: "",
          material_name: "",
          customer_name: clean(doc.customer_name || reg.customer_name),
          manager: clean(doc.manager),
          note: regNote,
          reply_status: status,
          reply_at: "",
          reply_user: ""
        });
      });
    });

    for (const row of updateRows) {
      await supabaseClient
        .from(TABLE_NAME)
        .update(row.updateData)
        .eq("id", row.id);

      if (row.old_status !== row.new_status) {
        await insertLog({
          reply_id: row.id,
          invoice: row.invoice,
          material_no: row.material_no,
          old_status: row.old_status,
          new_status: row.new_status,
          changed_by: "SYSTEM"
        });
      }
    }

    if (insertRows.length) {
      const { error } = await supabaseClient
        .from(TABLE_NAME)
        .insert(insertRows);

      if (error) {
        console.error(error);
        tableManager.setStatus("자동 등록 실패");
        return;
      }
    }

    tableManager.setStatus(`자동등록 ${num(insertRows.length)}건 / 자동수정 ${num(updateRows.length)}건`);
  } catch (error) {
    console.error(error);
    tableManager.setStatus("자동 매칭 실패");
  }
}

function hasWmsInvoice(wmsRows, invoice) {
  return wmsRows.some(row => clean(row.invoice) === clean(invoice));
}

function hasWmsInvoiceCode(wmsRows, invoice, materialNo) {
  return wmsRows.some(row =>
    clean(row.invoice) === clean(invoice) &&
    clean(row.material_no) === clean(materialNo)
  );
}

async function changeStatus(id, nextStatus) {
  const row = allRows.find(item => Number(item.id) === Number(id));
  if (!row) return;

  const oldStatus = clean(row.reply_status) || "미입고";

  const updateData = {
    reply_status: nextStatus
  };

  if (nextStatus === "처리완료") {
    updateData.reply_at = getTodayText();
    updateData.reply_user = currentUserName;
  }

  if (nextStatus === "입고") {
    updateData.reply_at = "";
    updateData.reply_user = "";
  }

  const { error } = await supabaseClient
    .from(TABLE_NAME)
    .update(updateData)
    .eq("id", id);

  if (error) {
    console.error(error);
    tableManager.setStatus("상태 변경 실패");
    return;
  }

  await insertLog({
    reply_id: id,
    invoice: row.invoice,
    material_no: row.material_no,
    old_status: oldStatus,
    new_status: nextStatus,
    changed_by: currentUserName
  });

  await loadRows();
  tableManager.setStatus(`상태 변경: ${oldStatus} → ${nextStatus}`);
}

function openAddModal() {
  editId = "";
  formModal.setTitle("개별 등록");

  setFormValues({
    invoice: "",
    ship_date: "",
    country: "",
    material_no: "",
    box_no: "",
    material_name: "",
    customer_name: "",
    manager: "",
    reply_status: "미입고",
    reply_at: "",
    reply_user: "",
    note: ""
  });

  formModal.open();
}

function editSelectedRow() {
  const ids = tableManager.getSelectedIds().map(v => Number(v));

  if (ids.length !== 1) {
    tableManager.setStatus("수정은 1건만 선택");
    return;
  }

  const row = allRows.find(item => Number(item.id) === Number(ids[0]));
  if (!row) return;

  editId = row.id;
  formModal.setTitle("선택 수정");

  setFormValues({
    invoice: row.invoice,
    ship_date: row.ship_date,
    country: row.country,
    material_no: row.material_no,
    box_no: row.box_no,
    material_name: row.material_name,
    customer_name: row.customer_name,
    manager: row.manager,
    reply_status: clean(row.reply_status) || "미입고",
    reply_at: row.reply_at,
    reply_user: row.reply_user,
    note: row.note
  });

  formModal.open();
}

async function saveFormRow() {
  const values = getFormValues();

  const data = {
    invoice: values.invoice,
    ship_date: values.ship_date,
    country: values.country,
    material_no: values.material_no,
    box_no: values.box_no,
    material_name: values.material_name,
    customer_name: values.customer_name,
    manager: values.manager,
    reply_status: values.reply_status || "미입고",
    reply_at: values.reply_at,
    reply_user: values.reply_user,
    note: values.note
  };

  if (!data.invoice && !data.country && !data.material_no) {
    tableManager.setStatus("로케이션 / 국가 / 코드 중 1개 이상 입력");
    return false;
  }

  if (editId) {
    const oldRow = allRows.find(item => Number(item.id) === Number(editId));
    const oldStatus = clean(oldRow?.reply_status);

    const { error } = await supabaseClient
      .from(TABLE_NAME)
      .update(data)
      .eq("id", editId);

    if (error) {
      console.error(error);
      tableManager.setStatus("수정 실패");
      return false;
    }

    if (oldStatus !== data.reply_status) {
      await insertLog({
        reply_id: editId,
        invoice: data.invoice,
        material_no: data.material_no,
        old_status: oldStatus,
        new_status: data.reply_status,
        changed_by: currentUserName
      });
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
    tableManager.setStatus("등록 실패");
    return false;
  }

  await loadRows();
  tableManager.setStatus("등록 완료");
  return true;
}

async function insertLog(row) {
  await supabaseClient
    .from(LOG_TABLE)
    .insert([{
      reply_id: row.reply_id,
      invoice: clean(row.invoice),
      material_no: clean(row.material_no),
      old_status: clean(row.old_status),
      new_status: clean(row.new_status),
      changed_by: clean(row.changed_by)
    }]);
}

function onTableScroll() {
  if (!printArea) return;
  if (isAppending) return;
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
    rows = rows.filter(row => {
      return [
        row.id,
        row.invoice,
        row.ship_date,
        row.country,
        row.material_no,
        row.box_no,
        row.material_name,
        row.customer_name,
        row.manager,
        row.created_at,
        row.reply_at,
        row.reply_status,
        row.reply_user,
        row.note
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

  const html = nextRows.map(row => {
    const status = clean(row.reply_status) || "미입고";
    const rowClass = status === "처리완료" ? "reply-row-done" : status === "입고" ? "reply-row-ready" : "";

    return `
      <tr data-row-id="${row.id}" class="${rowClass}">
        <td><input type="checkbox" class="chk row-chk" data-id="${row.id}"></td>
        ${visibleColumns.map(col => renderCell(col.key, row)).join("")}
      </tr>
    `;
  }).join("");

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
  if (key === "invoice") return `<td data-col-key="invoice">${esc(row.invoice)}</td>`;
  if (key === "ship_date") return `<td data-col-key="ship_date" class="mono-num">${esc(row.ship_date)}</td>`;
  if (key === "country") return `<td data-col-key="country">${esc(row.country)}</td>`;
  if (key === "material_no") return `<td data-col-key="material_no" class="mono-num">${esc(row.material_no)}</td>`;
  if (key === "box_no") return `<td data-col-key="box_no" class="mono-num">${esc(row.box_no)}</td>`;
  if (key === "material_name") return `<td data-col-key="material_name">${esc(row.material_name)}</td>`;
  if (key === "customer_name") return `<td data-col-key="customer_name">${esc(row.customer_name)}</td>`;
  if (key === "manager") return `<td data-col-key="manager">${esc(row.manager)}</td>`;
  if (key === "created_at") return `<td data-col-key="created_at" class="mono-num">${esc(formatDate(row.created_at))}</td>`;
  if (key === "reply_at") return `<td data-col-key="reply_at" class="mono-num">${esc(row.reply_at)}</td>`;
  if (key === "reply_user") return `<td data-col-key="reply_user">${esc(row.reply_user)}</td>`;

  if (key === "reply_status") {
    const status = clean(row.reply_status) || "미입고";
    const btnClass = status === "처리완료" ? "done" : status === "입고" ? "ready" : "wait";

    return `
      <td data-col-key="reply_status">
        <button type="button" class="reply-btn ${btnClass}" data-id="${esc(row.id)}" data-status="${esc(status)}">
          ${esc(status)}
        </button>
      </td>
    `;
  }

  if (key === "note") return `<td data-col-key="note">${esc(row.note)}</td>`;
  return "";
}

function downloadExcel() {
  const rows = filteredRowsCache.map(row => ({
    NO: row.no,
    로케이션: row.invoice,
    출고일: row.ship_date,
    국가: row.country,
    코드: row.material_no,
    박스번호: row.box_no,
    자재내역: row.material_name,
    납품처명: row.customer_name,
    담당자: row.manager,
    등록일: formatDate(row.created_at),
    처리일: row.reply_at,
    상태: row.reply_status,
    사용자: row.reply_user,
    비고: row.note
  }));

  downloadExcelFile({
    fileName: "expiry_reply.xlsx",
    sheetName: "expiry_reply",
    rows
  });

  tableManager.setStatus("엑셀 다운로드 완료");
}

function getFormModalHtml() {
  return `
    <div class="wms-form-grid">
      <div class="wms-form-row">
        <label class="wms-form-label" for="f-invoice">로케이션</label>
        <input id="f-invoice" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-ship-date">출고일</label>
        <input id="f-ship-date" class="wms-form-input" type="text">
      </div>

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
        <label class="wms-form-label" for="f-manager">담당자</label>
        <input id="f-manager" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-reply-status">상태</label>
        <select id="f-reply-status" class="wms-form-input">
          <option value="미입고">미입고</option>
          <option value="입고">입고</option>
          <option value="처리완료">처리완료</option>
        </select>
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-reply-at">처리일</label>
        <input id="f-reply-at" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row">
        <label class="wms-form-label" for="f-reply-user">사용자</label>
        <input id="f-reply-user" class="wms-form-input" type="text">
      </div>

      <div class="wms-form-row full">
        <label class="wms-form-label" for="f-note">비고</label>
        <input id="f-note" class="wms-form-input" type="text">
      </div>
    </div>
  `;
}

function getFormElements() {
  return {
    invoice: document.getElementById("f-invoice"),
    ship_date: document.getElementById("f-ship-date"),
    country: document.getElementById("f-country"),
    material_no: document.getElementById("f-material-no"),
    box_no: document.getElementById("f-box-no"),
    material_name: document.getElementById("f-material-name"),
    customer_name: document.getElementById("f-customer-name"),
    manager: document.getElementById("f-manager"),
    reply_status: document.getElementById("f-reply-status"),
    reply_at: document.getElementById("f-reply-at"),
    reply_user: document.getElementById("f-reply-user"),
    note: document.getElementById("f-note")
  };
}

function setFormValues(values) {
  const form = getFormElements();

  form.invoice.value = values.invoice ?? "";
  form.ship_date.value = values.ship_date ?? "";
  form.country.value = values.country ?? "";
  form.material_no.value = values.material_no ?? "";
  form.box_no.value = values.box_no ?? "";
  form.material_name.value = values.material_name ?? "";
  form.customer_name.value = values.customer_name ?? "";
  form.manager.value = values.manager ?? "";
  form.reply_status.value = values.reply_status ?? "미입고";
  form.reply_at.value = values.reply_at ?? "";
  form.reply_user.value = values.reply_user ?? "";
  form.note.value = values.note ?? "";
}

function getFormValues() {
  const form = getFormElements();

  return {
    invoice: form.invoice.value.trim(),
    ship_date: form.ship_date.value.trim(),
    country: form.country.value.trim(),
    material_no: form.material_no.value.trim(),
    box_no: form.box_no.value.trim(),
    material_name: form.material_name.value.trim(),
    customer_name: form.customer_name.value.trim(),
    manager: form.manager.value.trim(),
    reply_status: form.reply_status.value.trim(),
    reply_at: form.reply_at.value.trim(),
    reply_user: form.reply_user.value.trim(),
    note: form.note.value.trim()
  };
}

function makeKey(invoice, materialNo, note) {
  return `${clean(invoice)}|${clean(materialNo)}|${clean(note)}`;
}

function clean(value) {
  return String(value ?? "").trim();
}

function getTodayText() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
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