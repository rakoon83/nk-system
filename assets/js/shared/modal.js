// /assets/js/shared/modal.js

export function createModal(options = {}) {
  const {
    mountId = "modal-root",
    modalId,
    title = "",
    bodyHtml = "",
    width = 560,
    showCancel = true,
    showConfirm = true,
    cancelText = "닫기",
    confirmText = "확인",
    closeOnBackdrop = true
  } = options;

  const mount = document.getElementById(mountId);
  if (!mount) {
    throw new Error(`modal mount not found: #${mountId}`);
  }

  const id = modalId || `wms-modal-${Math.random().toString(36).slice(2, 8)}`;

  const wrap = document.createElement("div");
  wrap.className = "wms-modal";
  wrap.id = id;

  wrap.innerHTML = `
    <div class="wms-modal-box" style="max-width:${Number(width) || 560}px">
      <h2 class="wms-modal-title">${escapeHtml(title)}</h2>
      <div class="wms-modal-body">${bodyHtml}</div>
      <div class="wms-modal-actions">
        ${showCancel ? `<button type="button" class="wms-modal-btn" data-modal-cancel>${escapeHtml(cancelText)}</button>` : ""}
        ${showConfirm ? `<button type="button" class="wms-modal-btn primary" data-modal-confirm>${escapeHtml(confirmText)}</button>` : ""}
      </div>
    </div>
  `;

  mount.appendChild(wrap);

  const titleEl = wrap.querySelector(".wms-modal-title");
  const bodyEl = wrap.querySelector(".wms-modal-body");
  const cancelBtn = wrap.querySelector("[data-modal-cancel]");
  const confirmBtn = wrap.querySelector("[data-modal-confirm]");

  let confirmHandler = null;
  let cancelHandler = null;

  if (closeOnBackdrop) {
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) {
        close();
        if (typeof cancelHandler === "function") cancelHandler(e);
      }
    });
  }

  cancelBtn?.addEventListener("click", (e) => {
    close();
    if (typeof cancelHandler === "function") cancelHandler(e);
  });

  confirmBtn?.addEventListener("click", async (e) => {
    if (typeof confirmHandler === "function") {
      const result = await confirmHandler(e);
      if (result !== false) close();
      return;
    }
    close();
  });

  function open(data = {}) {
    if (data.title != null) titleEl.textContent = data.title;
    if (data.bodyHtml != null) bodyEl.innerHTML = data.bodyHtml;
    if (data.confirmText != null && confirmBtn) confirmBtn.textContent = data.confirmText;
    if (data.cancelText != null && cancelBtn) cancelBtn.textContent = data.cancelText;
    wrap.classList.add("is-open");
  }

  function close() {
    wrap.classList.remove("is-open");
  }

  function destroy() {
    wrap.remove();
  }

  function setTitle(nextTitle) {
    titleEl.textContent = nextTitle ?? "";
  }

  function setBody(html) {
    bodyEl.innerHTML = html ?? "";
  }

  function onConfirm(handler) {
    confirmHandler = handler;
  }

  function onCancel(handler) {
    cancelHandler = handler;
  }

  return {
    id,
    el: wrap,
    bodyEl,
    titleEl,
    confirmBtn,
    cancelBtn,
    open,
    close,
    destroy,
    setTitle,
    setBody,
    onConfirm,
    onCancel
  };
}

export function openAlert(options = {}) {
  const {
    mountId = "modal-root",
    title = "알림",
    message = "",
    confirmText = "확인",
    onConfirm = null
  } = options;

  const modal = createModal({
    mountId,
    title,
    bodyHtml: `<div>${escapeHtml(message)}</div>`,
    showCancel: false,
    showConfirm: true,
    confirmText
  });

  if (typeof onConfirm === "function") {
    modal.onConfirm(onConfirm);
  }

  modal.open();
  return modal;
}

export function openConfirm(options = {}) {
  const {
    mountId = "modal-root",
    title = "확인",
    message = "",
    confirmText = "확인",
    cancelText = "취소",
    onConfirm = null,
    onCancel = null
  } = options;

  const modal = createModal({
    mountId,
    title,
    bodyHtml: `<div>${escapeHtml(message)}</div>`,
    showCancel: true,
    showConfirm: true,
    confirmText,
    cancelText
  });

  if (typeof onConfirm === "function") modal.onConfirm(onConfirm);
  if (typeof onCancel === "function") modal.onCancel(onCancel);

  modal.open();
  return modal;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}