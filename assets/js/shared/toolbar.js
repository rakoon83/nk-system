// /assets/js/shared/toolbar.js

export function createToolbar(options = {}) {
  const {
    mountId,
    currentUserName = "-",
    searchPlaceholder = "검색",
    buttons = {
      add: true,
      paste: true,
      edit: true,
      remove: true,
      sum: true,
      download: true,
      print: true,
      config: true,
      search: true,
      currentUser: true
    }
  } = options;

  const mount = document.getElementById(mountId);
  if (!mount) return null;

  mount.innerHTML = `
    <div class="wms-toolbar no-print">
      <div class="wms-toolbar-left">
        ${buttons.add ? buttonHtml("add", "신규 등록", plusIcon()) : ""}
        ${buttons.paste ? buttonHtml("paste", "대량 등록", pasteIcon()) : ""}
        ${buttons.edit ? buttonHtml("edit", "선택 수정", editIcon(), true) : ""}
        ${buttons.remove ? buttonHtml("remove", "선택 삭제", trashIcon(), true) : ""}
        ${buttons.sum ? buttonHtml("sum", "수량 합계", sumIcon()) : ""}
        ${buttons.download ? buttonHtml("download", "엑셀 다운로드", downloadIcon()) : ""}
        ${buttons.print ? buttonHtml("print", "프린터", printIcon()) : ""}
        ${buttons.config ? configHtml() : ""}
      </div>

      <div class="wms-toolbar-right">
        ${buttons.search ? `<input id="toolbar-search-input" class="wms-toolbar-search" type="text" placeholder="${escapeHtml(searchPlaceholder)}">` : ""}
        ${(buttons.search && buttons.currentUser) ? `<div class="wms-tool-divider"></div>` : ""}
        ${buttons.currentUser ? `<div class="wms-toolbar-chip">현재 사용자 <strong id="toolbar-current-user-name">${escapeHtml(currentUserName)}</strong></div>` : ""}
      </div>
    </div>
  `;

  const refs = {
    root: mount,
    addBtn: mount.querySelector("#toolbar-btn-add"),
    pasteBtn: mount.querySelector("#toolbar-btn-paste"),
    editBtn: mount.querySelector("#toolbar-btn-edit"),
    removeBtn: mount.querySelector("#toolbar-btn-remove"),
    sumBtn: mount.querySelector("#toolbar-btn-sum"),
    downloadBtn: mount.querySelector("#toolbar-btn-download"),
    printBtn: mount.querySelector("#toolbar-btn-print"),
    configBtn: mount.querySelector("#table-config-btn"),
    configPanel: mount.querySelector("#table-config-panel"),
    searchInput: mount.querySelector("#toolbar-search-input"),
    currentUserNameEl: mount.querySelector("#toolbar-current-user-name")
  };

  function setDisabled(name, disabled = true) {
    const map = {
      add: refs.addBtn,
      paste: refs.pasteBtn,
      edit: refs.editBtn,
      remove: refs.removeBtn,
      sum: refs.sumBtn,
      download: refs.downloadBtn,
      print: refs.printBtn
    };

    const el = map[name];
    if (!el) return;

    el.classList.toggle("is-disabled", !!disabled);
    el.dataset.disabled = disabled ? "Y" : "N";
  }

  function on(name, handler) {
    const map = {
      add: refs.addBtn,
      paste: refs.pasteBtn,
      edit: refs.editBtn,
      remove: refs.removeBtn,
      sum: refs.sumBtn,
      download: refs.downloadBtn,
      print: refs.printBtn
    };

    const el = map[name];
    if (!el || typeof handler !== "function") return;

    el.addEventListener("click", (e) => {
      if (el.dataset.disabled === "Y") return;
      handler(e);
    });
  }

  function setCurrentUser(name) {
    if (refs.currentUserNameEl) {
      refs.currentUserNameEl.textContent = name || "-";
    }
  }

  function getSearchKeyword() {
    return refs.searchInput ? refs.searchInput.value.trim().toLowerCase() : "";
  }

  return {
    ...refs,
    on,
    setDisabled,
    setCurrentUser,
    getSearchKeyword
  };
}

function buttonHtml(key, title, icon, disabled = false) {
  return `
    <button
      class="wms-tool-btn ${disabled ? "is-disabled" : ""}"
      id="toolbar-btn-${key}"
      type="button"
      title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}"
      data-disabled="${disabled ? "Y" : "N"}"
    >
      ${icon}
    </button>
  `;
}

function configHtml() {
  return `
    <div class="table-config-wrap">
      <button class="table-config-btn wms-tool-btn" id="table-config-btn" type="button" title="컬럼 설정" aria-label="컬럼 설정">
        ${configIcon()}
      </button>
      <div class="table-config-panel" id="table-config-panel"></div>
    </div>
  `;
}

function plusIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  `;
}

function pasteIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="8" y="3" width="8" height="4" rx="1"></rect>
      <path d="M8 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8"></path>
      <path d="M14 11h6M17 8v6"></path>
    </svg>
  `;
}

function editIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M4 20h4l10-10-4-4L4 16v4z"></path>
      <path d="M13 7l4 4"></path>
    </svg>
  `;
}

function trashIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 6h18"></path>
      <path d="M8 6V4h8v2"></path>
      <path d="M19 6l-1 14H6L5 6"></path>
    </svg>
  `;
}

function sumIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M7 6h10"></path>
      <path d="M7 18h10"></path>
      <path d="M8 6l7 6-7 6"></path>
    </svg>
  `;
}

function downloadIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 3v12"></path>
      <path d="M8 11l4 4 4-4"></path>
      <path d="M4 20h16"></path>
    </svg>
  `;
}

function printIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M7 8V3h10v5"></path>
      <rect x="6" y="14" width="12" height="7"></rect>
      <path d="M6 10H5a2 2 0 0 0-2 2v4h3"></path>
      <path d="M18 10h1a2 2 0 0 1 2 2v4h-3"></path>
    </svg>
  `;
}

function configIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.24.3.44.64.6 1 .16.36.25.74.25 1.13s-.09.77-.25 1.13c-.16.36-.36.7-.6 1z"></path>
    </svg>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}