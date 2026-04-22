// /assets/js/shared/table.js

export function createTableManager(options = {}) {
  const {
    tableId,
    tbodyId,
    checkboxAllId,
    statusId,
    searchInputId,
    configButtonId,
    configPanelId,
    storageKey,
    sortMap = {},
    columns = [],
    defaultSortKey = "",
    defaultSortDir = "asc",
    minColumnWidth = 60,
    onSortChange = null,
    onSelectionChange = null,
    onColumnChange = null
  } = options;

  const table = document.getElementById(tableId);
  const tbody = document.getElementById(tbodyId);
  const checkboxAll = checkboxAllId ? document.getElementById(checkboxAllId) : null;
  const statusEl = statusId ? document.getElementById(statusId) : null;
  const searchInput = searchInputId ? document.getElementById(searchInputId) : null;
  const configButton = configButtonId ? document.getElementById(configButtonId) : null;
  const configPanel = configPanelId ? document.getElementById(configPanelId) : null;

  let sortKey = defaultSortKey;
  let sortDir = defaultSortDir;

  const defaultColumnState = columns.map((col, index) => ({
    key: col.key,
    label: col.label,
    width: col.width || null,
    visible: col.visible !== false,
    order: index
  }));

  let columnState = loadColumnState();

  function init() {
    bindHeaderSort();
    bindColumnResize();
    bindHeaderCheckbox();
    bindConfigPanel();
    applyColumnState();
  }

  function loadColumnState() {
    if (!storageKey) return [...defaultColumnState];

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [...defaultColumnState];

      const saved = JSON.parse(raw);
      if (!Array.isArray(saved)) return [...defaultColumnState];

      const merged = defaultColumnState.map((base, index) => {
        const found = saved.find(x => x.key === base.key);
        return {
          ...base,
          visible: found?.visible ?? base.visible,
          width: found?.width ?? base.width,
          order: found?.order ?? index
        };
      });

      return merged.sort((a, b) => a.order - b.order);
    } catch {
      return [...defaultColumnState];
    }
  }

  function saveColumnState() {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(columnState));
  }

  function bindHeaderSort() {
    Object.entries(sortMap).forEach(([key, selector]) => {
      const el = table?.querySelector(selector);
      if (!el) return;

      el.addEventListener("click", (e) => {
        if (e.target.classList.contains("resize-handle")) return;

        if (sortKey === key) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortKey = key;
          sortDir = "asc";
        }

        updateSortMarks();

        if (typeof onSortChange === "function") {
          onSortChange(sortKey, sortDir);
        }
      });
    });

    updateSortMarks();
  }

  function updateSortMarks() {
    table?.querySelectorAll(".sort-mark").forEach(el => {
      el.textContent = "↕";
    });

    const selector = sortMap[sortKey];
    if (!selector) return;

    const target = table?.querySelector(`${selector} .sort-mark`);
    if (target) {
      target.textContent = sortDir === "asc" ? "↑" : "↓";
    }
  }

  function bindColumnResize() {
    const ths = table?.querySelectorAll("thead th") || [];
    const cols = table?.querySelectorAll("colgroup col") || [];

    ths.forEach((th, index) => {
      if (index === 0) return;

      const handle = th.querySelector(".resize-handle");
      if (!handle || !cols[index]) return;

      let startX = 0;
      let startWidth = 0;

      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();

        startX = e.pageX;
        startWidth = parseFloat(cols[index].style.width) || th.offsetWidth;

        function onMove(ev) {
          const nextWidth = Math.max(minColumnWidth, startWidth + (ev.pageX - startX));
          cols[index].style.width = `${nextWidth}px`;

          const visibleCols = getVisibleColumns();
          const visibleIndex = getVisibleDataColumnIndex(index);
          if (visibleIndex >= 0 && visibleCols[visibleIndex]) {
            visibleCols[visibleIndex].width = nextWidth;
          }
        }

        function onUp() {
          saveColumnState();
          fireColumnChange();
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        }

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    });
  }

  function bindHeaderCheckbox() {
    if (!checkboxAll) return;

    checkboxAll.addEventListener("change", (e) => {
      tbody?.querySelectorAll(".row-chk").forEach(chk => {
        chk.checked = e.target.checked;
        toggleRowSelected(chk);
      });

      fireSelectionChange();
    });
  }

  function bindRowCheckboxes() {
    tbody?.querySelectorAll(".row-chk").forEach(chk => {
      chk.addEventListener("change", () => {
        toggleRowSelected(chk);
        syncHeaderCheckbox();
        fireSelectionChange();
      });
    });
  }

  function toggleRowSelected(chk) {
    const tr = chk.closest("tr");
    if (!tr) return;
    tr.classList.toggle("is-selected", chk.checked);
  }

  function syncHeaderCheckbox() {
    if (!checkboxAll) return;

    const all = [...(tbody?.querySelectorAll(".row-chk") || [])];
    const checked = all.filter(chk => chk.checked);
    checkboxAll.checked = all.length > 0 && all.length === checked.length;
  }

  function getSelectedIds() {
    return [...(tbody?.querySelectorAll(".row-chk:checked") || [])].map(chk => chk.dataset.id);
  }

  function fireSelectionChange() {
    if (typeof onSelectionChange === "function") {
      onSelectionChange(getSelectedIds());
    }
  }

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message || "";
  }

  function getKeyword() {
    return searchInput ? searchInput.value.trim().toLowerCase() : "";
  }

  function getSortState() {
    return { sortKey, sortDir };
  }

  function refreshAfterRender() {
    bindRowCheckboxes();
    syncHeaderCheckbox();
    fireSelectionChange();
    updateSortMarks();
  }

  function getVisibleColumns() {
    return columnState.filter(col => col.visible);
  }

  function applyColumnState() {
    const ths = [...(table?.querySelectorAll("thead th") || [])];
    const rows = [...(table?.querySelectorAll("tbody tr") || [])];
    const cols = [...(table?.querySelectorAll("colgroup col") || [])];

    if (!ths.length) return;

    const fixedFirst = {
      th: ths[0],
      col: cols[0]
    };

    const dataHeaderList = ths.slice(1);
    const dataColList = cols.slice(1);

    const ordered = [...columnState].sort((a, b) => a.order - b.order);

    ordered.forEach((state, visibleIndex) => {
      const th = dataHeaderList.find(el => el.dataset.colKey === state.key);
      const col = dataColList.find(el => el.dataset.colKey === state.key);
      if (!th || !col) return;

      th.style.display = state.visible ? "" : "none";
      col.style.display = state.visible ? "" : "none";

      if (state.width) {
        col.style.width = `${state.width}px`;
      }

      if (state.visible) {
        fixedFirst.th.parentNode.appendChild(th);
        fixedFirst.col.parentNode.appendChild(col);

        rows.forEach(tr => {
          const td = [...tr.children].find(cell => cell.dataset.colKey === state.key);
          if (td) tr.appendChild(td);
        });
      }
    });

    rows.forEach(tr => {
      ordered.forEach(state => {
        const td = [...tr.children].find(cell => cell.dataset.colKey === state.key);
        if (td) td.style.display = state.visible ? "" : "none";
      });
    });

    renderConfigPanel();
  }

  function bindConfigPanel() {
    if (!configButton || !configPanel) return;

    configButton.addEventListener("click", (e) => {
      e.stopPropagation();
      configPanel.classList.toggle("is-open");
      renderConfigPanel();
    });

    document.addEventListener("click", (e) => {
      if (!configPanel.classList.contains("is-open")) return;
      if (configPanel.contains(e.target) || configButton.contains(e.target)) return;
      configPanel.classList.remove("is-open");
    });
  }

  function renderConfigPanel() {
    if (!configPanel) return;

    const ordered = [...columnState].sort((a, b) => a.order - b.order);

    configPanel.innerHTML = `
      <div class="table-config-title">컬럼 설정</div>
      ${ordered.map(col => `
        <div class="table-config-row" draggable="true" data-col-key="${escapeHtml(col.key)}">
          <div class="table-config-left">
            <span class="table-drag-handle">⋮⋮</span>
            <label class="table-config-label">
              <input type="checkbox" class="cfg-visible" data-col-key="${escapeHtml(col.key)}" ${col.visible ? "checked" : ""}>
              ${escapeHtml(col.label)}
            </label>
          </div>
        </div>
      `).join("")}
      <div class="table-config-actions">
        <button type="button" class="table-config-small-btn" id="cfg-reset-columns">초기화</button>
        <button type="button" class="table-config-small-btn" id="cfg-close-columns">닫기</button>
      </div>
    `;

    bindConfigEvents();
  }

  function bindConfigEvents() {
    configPanel?.querySelectorAll(".cfg-visible").forEach(chk => {
      chk.addEventListener("change", () => {
        const key = chk.dataset.colKey;
        const target = columnState.find(col => col.key === key);
        if (!target) return;

        target.visible = chk.checked;
        saveColumnState();
        applyColumnState();
        fireColumnChange();
      });
    });

    const rows = [...(configPanel?.querySelectorAll(".table-config-row") || [])];
    let dragKey = "";

    rows.forEach(row => {
      row.addEventListener("dragstart", () => {
        dragKey = row.dataset.colKey || "";
        row.classList.add("dragging");
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
      });

      row.addEventListener("dragover", (e) => {
        e.preventDefault();
      });

      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const dropKey = row.dataset.colKey || "";
        if (!dragKey || !dropKey || dragKey === dropKey) return;

        const ordered = [...columnState].sort((a, b) => a.order - b.order);
        const fromIndex = ordered.findIndex(col => col.key === dragKey);
        const toIndex = ordered.findIndex(col => col.key === dropKey);
        if (fromIndex < 0 || toIndex < 0) return;

        const [moved] = ordered.splice(fromIndex, 1);
        ordered.splice(toIndex, 0, moved);

        ordered.forEach((col, idx) => {
          col.order = idx;
        });

        columnState = ordered;
        saveColumnState();
        applyColumnState();
        fireColumnChange();
      });
    });

    const resetBtn = document.getElementById("cfg-reset-columns");
    const closeBtn = document.getElementById("cfg-close-columns");

    resetBtn?.addEventListener("click", () => {
      columnState = [...defaultColumnState];
      saveColumnState();
      applyColumnState();
      fireColumnChange();
    });

    closeBtn?.addEventListener("click", () => {
      configPanel?.classList.remove("is-open");
    });
  }

  function getVisibleDataColumnIndex(realIndex) {
    const ths = [...(table?.querySelectorAll("thead th") || [])].slice(1);
    const key = ths[realIndex - 1]?.dataset.colKey;
    if (!key) return -1;

    return getVisibleColumns().findIndex(col => col.key === key);
  }

  function fireColumnChange() {
    if (typeof onColumnChange === "function") {
      onColumnChange(getColumnState());
    }
  }

  function getColumnState() {
    return [...columnState].sort((a, b) => a.order - b.order);
  }

  return {
    init,
    setStatus,
    getKeyword,
    getSortState,
    getSelectedIds,
    refreshAfterRender,
    updateSortMarks,
    applyColumnState,
    getColumnState
  };
}

export function compareTableValue(a, b, dir = "asc") {
  const aNum = Number(a);
  const bNum = Number(b);
  let result = 0;

  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    result = aNum - bNum;
  } else {
    result = String(a ?? "").localeCompare(String(b ?? ""), "ko");
  }

  return dir === "asc" ? result : -result;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}