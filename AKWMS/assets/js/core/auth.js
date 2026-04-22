// /assets/js/core/auth.js

import { findUser } from "/assets/js/core/users.js";

const LOGIN_KEY = "wms_login_user";

export async function login(id, pw) {
  const user = findUser(id, pw);

  if (!user) return false;

  const sessionUser = {
    id: user.id,
    name: user.name,
    role: user.role,
    loginAt: Date.now()
  };

  localStorage.setItem(LOGIN_KEY, JSON.stringify(sessionUser));
  return true;
}

export function logout() {
  localStorage.removeItem(LOGIN_KEY);
  location.href = "/login.html";
}

export function getLoginUser() {
  try {
    const raw = localStorage.getItem(LOGIN_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("getLoginUser error:", err);
    return null;
  }
}

export function isLoggedIn() {
  return !!getLoginUser();
}

export function checkAuth() {
  const user = getLoginUser();

  if (!user) {
    location.href = "/login.html";
    return null;
  }

  return user;
}