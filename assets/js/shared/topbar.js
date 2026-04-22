// /assets/js/shared/topbar.js

export function createTopbar(options = {}) {
  const {
    mountId,
    title = "",
    subtitle = "",
    rightHtml = ""
  } = options;

  const mount = document.getElementById(mountId);
  if (!mount) return null;

  mount.innerHTML = `
    <div class="wms-topbar">
      <div class="wms-topbar-left">
        <div class="wms-topbar-title">${escapeHtml(title)}</div>
        <div class="wms-topbar-subtitle">${escapeHtml(subtitle)}</div>
      </div>

      <div class="wms-topbar-right" id="${mountId}-right">
        ${rightHtml || ""}
      </div>
    </div>
  `;

  const rightEl = document.getElementById(`${mountId}-right`);

  function setTitle(nextTitle = "") {
    const el = mount.querySelector(".wms-topbar-title");
    if (el) el.textContent = nextTitle;
  }

  function setSubtitle(nextSubtitle = "") {
    const el = mount.querySelector(".wms-topbar-subtitle");
    if (el) el.textContent = nextSubtitle;
  }

  function setRightHtml(html = "") {
    if (rightEl) rightEl.innerHTML = html;
  }

  return {
    root: mount,
    rightEl,
    setTitle,
    setSubtitle,
    setRightHtml
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}