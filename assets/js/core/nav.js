// /assets/js/core/nav.js

import { getLoginUser, logout } from "/assets/js/core/auth.js";

const NAV_COLLAPSED_KEY = "wms_sidebar_collapsed";
const NAV_OPEN_KEY = "wms_sidebar_open_groups";

const NAV_ITEMS = [
  {
    title: "메인",
    icon: "▣",
    link: "/pages/dashboard/index.html"
  },
  {
    title: "인식표출력",
    icon: "▣",
    link: "/pages/tools/pop.html"
  },
  {
    title: "스캔검수",
    icon: "▣",
    children: [
      { label: "상차검수", link: "/pages/scan/scan_load.html" },
      { label: "입고검수", link: "/pages/scan/scan_in.html" },
      { label: "출고검수", link: "/pages/scan/scan_out.html" }
    ]
  },
  {
    title: "조회",
    icon: "▣",
    children: [
      { label: "결품조회", link: "/pages/query/defect.html" },
      { label: "재고조회", link: "/pages/query/stock.html" },
      { label: "품목조회", link: "/pages/query/item.html" },
      { label: "출고조회", link: "/pages/query/shipping.html" },
      { label: "소모품조회", link: "/pages/query/supply.html" }
    ]
  },
  {
    title: "이슈",
    icon: "▣",
    children: [
      { label: "유통기한 임박", link: "/pages/issues/expiry_alert.html" },
      { label: "유통기한 선회신", link: "/pages/issues/expiry_reply.html" },
      { label: "유통기한 선회신 등록", link: "/pages/issues/expiry_register.html" }
    ]
  },
  {
    title: "보수",
    icon: "▣",
    children: [
      { label: "라벨입고", link: "/pages/repair/label_in.html" },
      { label: "입고정보", link: "/pages/repair/repair_in.html" },
      { label: "작업정보", link: "/pages/repair/repair_work.html" },
      { label: "작업일지 설비A", link: "/pages/repair/worklog_a.html" },
      { label: "작업일지 설비B", link: "/pages/repair/worklog_b.html" },
      { label: "작업검수스캔", link: "/pages/repair/worklog_scan.html" }
    ]
  },
  {
    title: "Dashboard",
    icon: "▣",
    children: [
      { label: "설비 A", link: "/pages/dashboard/dashboard_a.html" },
      { label: "보수 A", link: "/pages/dashboard/dashboard_repair_a.html" },
      { label: "설비 B", link: "/pages/dashboard/dashboard_b.html" },
      { label: "보수 B", link: "/pages/dashboard/dashboard_repair_b.html" },
      { label: "전체", link: "/pages/dashboard/dashboard_all.html" }
    ]
  },
  {
    title: "관리자",
    icon: "▣",
    roles: ["admin"],
    children: [
      { label: "sap문서", link: "/pages/admin/upload/sap_doc.html", roles: ["admin"] },
      { label: "sap자재", link: "/pages/admin/upload/sap_item.html", roles: ["admin"] },
      { label: "wms속성", link: "/pages/admin/upload/wms_attribute_b.html", roles: ["admin"] },
      { label: "특이사항", link: "/pages/admin/upload/special_note.html", roles: ["admin"] },
      { label: "결품업로드", link: "/pages/admin/upload/defect_upload.html", roles: ["admin"] },
      { label: "바코드등록", link: "/pages/admin/master/barcode.html", roles: ["admin"] },
      { label: "유통기한 제외", link: "/pages/admin/master/expiry_exclude.html", roles: ["admin"] },
      { label: "입고검수 로그", link: "/pages/scan/scan_in_log.html", roles: ["admin"] },
      { label: "출고검수 로그", link: "/pages/scan/scan_out_log.html", roles: ["admin"] }
    ]
  }
];

export function preparePageContent(mountId = "app-nav", contentId = "page-content") {
  const mount = document.getElementById(mountId);
  const content = document.getElementById(contentId);
  if (!mount || !content) return;

  mount.dataset.contentHtml = content.innerHTML;
  content.remove();
}

export function renderNav(options = {}) {
  const { mountId = "app-nav" } = options;

  const mount = document.getElementById(mountId);
  if (!mount) return;

  const user = getLoginUser() || {};
  const role = String(user.role || "").toLowerCase();
  const currentPath = normalizePath(location.pathname);
  const isCollapsed = loadCollapsed();

  const visibleItems = filterNavItemsByRole(NAV_ITEMS, role);
  const openGroups = loadOpenGroups(visibleItems, currentPath);

  mount.innerHTML = `
    <div class="wms-layout">
      <aside class="wms-sidebar ${isCollapsed ? "is-collapsed" : ""}" id="wms-sidebar">
        <div class="wms-sidebar-header">
          <div class="wms-brand">
            <div class="wms-brand-title">WMS</div>
            <div class="wms-brand-sub">Warehouse System</div>
          </div>

          <button type="button" class="wms-sidebar-toggle" id="wms-sidebar-toggle">≡</button>
        </div>

        <nav class="wms-sidebar-nav">
          ${visibleItems.map((item, index) => renderNavItem(item, currentPath, openGroups, index)).join("")}
        </nav>

        <div class="wms-sidebar-footer">
          <div class="wms-user-box">
            <div class="wms-user-row">사용자<strong>${escapeHtml(user.name || user.id || "-")}</strong></div>
            <div class="wms-user-row">권한<strong>${escapeHtml(user.role || "-")}</strong></div>
            <button type="button" class="wms-logout-btn" id="wms-logout-btn">로그아웃</button>
          </div>
        </div>
      </aside>

      <section class="wms-page">
        <div class="wms-page-content" id="wms-page-content"></div>
      </section>
    </div>
  `;

  const pageContent = document.getElementById("wms-page-content");
  const sidebar = document.getElementById("wms-sidebar");
  const toggleBtn = document.getElementById("wms-sidebar-toggle");
  const logoutBtn = document.getElementById("wms-logout-btn");
  const groupButtons = mount.querySelectorAll(".wms-nav-group-toggle");

  pageContent.innerHTML = mount.dataset.contentHtml || "";

  toggleBtn?.addEventListener("click", () => {
    sidebar.classList.toggle("is-collapsed");
    saveCollapsed(sidebar.classList.contains("is-collapsed"));
  });

  logoutBtn?.addEventListener("click", logout);

  groupButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const groupKey = btn.dataset.groupKey;
      const wrap = mount.querySelector(`.wms-nav-group[data-group-key="${groupKey}"]`);
      if (!wrap) return;

      wrap.classList.toggle("is-open");

      const nextOpenGroups = [...mount.querySelectorAll(".wms-nav-group.is-open")]
        .map(el => el.dataset.groupKey)
        .filter(Boolean);

      saveOpenGroups(nextOpenGroups);
    });
  });
}

function renderNavItem(item, currentPath, openGroups, index) {
  const icon = escapeHtml(item.icon || "▣");

  if (item.link) {
    return `
      <a href="${item.link}" class="wms-nav-link ${isActive(currentPath, item.link) ? "is-active" : ""}">
        <span class="wms-nav-icon">${icon}</span>
        <span class="wms-nav-text">${escapeHtml(item.title)}</span>
      </a>
    `;
  }

  if (Array.isArray(item.children) && item.children.length) {
    const groupKey = `group-${index}`;
    const hasActiveChild = item.children.some(child => isActive(currentPath, child.link));
    const isOpen = openGroups.includes(groupKey) || hasActiveChild;

    return `
      <div class="wms-nav-group ${isOpen ? "is-open" : ""}" data-group-key="${groupKey}">
        <button type="button" class="wms-nav-link wms-nav-group-toggle ${hasActiveChild ? "is-active" : ""}" data-group-key="${groupKey}">
          <span class="wms-nav-icon">${icon}</span>
          <span class="wms-nav-text">${escapeHtml(item.title)}</span>
          <span class="wms-nav-caret">${isOpen ? "▾" : "▸"}</span>
        </button>

        <div class="wms-submenu">
          ${item.children.map(child => `
            <a href="${child.link}" class="wms-submenu-link ${isActive(currentPath, child.link) ? "is-active" : ""}">
              <span class="wms-submenu-text">${escapeHtml(child.label)}</span>
            </a>
          `).join("")}
        </div>
      </div>
    `;
  }

  return "";
}

function filterNavItemsByRole(items, role) {
  return items
    .filter(item => hasRoleAccess(item, role))
    .map(item => {
      if (!item.children) return item;

      const children = item.children.filter(child => hasRoleAccess(child, role));
      if (!children.length) return null;

      return { ...item, children };
    })
    .filter(Boolean);
}

function hasRoleAccess(item, role) {
  if (!Array.isArray(item.roles) || item.roles.length === 0) return true;
  return item.roles.map(v => String(v).toLowerCase()).includes(role);
}

function isActive(currentPath, href) {
  return normalizePath(currentPath) === normalizePath(href);
}

function normalizePath(path) {
  return String(path || "").replace(/\/+$/, "") || "/";
}

function loadCollapsed() {
  return localStorage.getItem(NAV_COLLAPSED_KEY) === "Y";
}

function saveCollapsed(value) {
  localStorage.setItem(NAV_COLLAPSED_KEY, value ? "Y" : "N");
}

function loadOpenGroups(visibleItems, currentPath) {
  try {
    const saved = JSON.parse(localStorage.getItem(NAV_OPEN_KEY) || "[]");
    const validSaved = Array.isArray(saved) ? saved : [];

    const activeGroups = visibleItems
      .map((item, index) => {
        if (!item.children?.length) return null;
        return item.children.some(child => isActive(currentPath, child.link)) ? `group-${index}` : null;
      })
      .filter(Boolean);

    return [...new Set([...validSaved, ...activeGroups])];
  } catch {
    return [];
  }
}

function saveOpenGroups(groups) {
  localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(groups || []));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}