// /assets/js/core/session.js

import { checkAuth, getLoginUser, logout } from "/assets/js/core/auth.js";

export function initSession(options = {}) {
  const {
    userNameSelector = "[data-user-name]",
    userRoleSelector = "[data-user-role]",
    logoutSelector = "[data-logout]"
  } = options;

  const user = checkAuth();
  if (!user) return null;

  const nameEls = document.querySelectorAll(userNameSelector);
  const roleEls = document.querySelectorAll(userRoleSelector);
  const logoutEls = document.querySelectorAll(logoutSelector);

  nameEls.forEach(el => {
    el.textContent = user.name || user.id || "";
  });

  roleEls.forEach(el => {
    el.textContent = user.role || "";
  });

  logoutEls.forEach(el => {
    el.addEventListener("click", logout);
  });

  return user;
}

export function getSessionUser() {
  return getLoginUser();
}