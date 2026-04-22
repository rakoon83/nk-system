// /assets/js/core/users.js
//admin	관리자
//worker	작업자
//viewer	조회만



// /assets/js/core/users.js

const STORAGE_KEY = "wms_users";

const DEFAULT_USERS = [
  {
    id: "nk",
    pw: "1234",
    name: "남경관리자",
    admin: true,
    role: "admin",
    use: true
  },
  {
    id: "scan01",
    pw: "1234",
    name: "검수1",
    admin: false,
    role: "worker",
    use: true
  },
  {
    id: "scan02",
    pw: "1234",
    name: "검수2",
    admin: false,
    role: "worker",
    use: true
  },
  {
    id: "view01",
    pw: "1234",
    name: "조회용",
    admin: false,
    role: "viewer",
    use: true
  }
];

export function getUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
      return [...DEFAULT_USERS];
    }

    const list = JSON.parse(raw);
    if (!Array.isArray(list)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
      return [...DEFAULT_USERS];
    }

    return list;
  } catch (err) {
    console.error("getUsers error:", err);
    return [...DEFAULT_USERS];
  }
}

export function saveUsers(users) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users || []));
}

export function findUser(id, pw) {
  const loginId = String(id || "").trim();
  const loginPw = String(pw || "").trim();

  const user = getUsers().find(u =>
    u.use === true &&
    String(u.id || "").trim() === loginId &&
    String(u.pw || "").trim() === loginPw
  );

  return user || null;
}

export function isAdminUser(user) {
  return !!(user && user.admin === true);
}

export function addUser(userData) {
  const users = getUsers();

  const id = String(userData?.id || "").trim();
  const pw = String(userData?.pw || "").trim();
  const name = String(userData?.name || "").trim();
  const role = String(userData?.role || "worker").trim();

  if (!id) throw new Error("ID를 입력해 주세요.");
  if (!pw) throw new Error("비밀번호를 입력해 주세요.");
  if (!name) throw new Error("이름을 입력해 주세요.");

  const exists = users.some(u => String(u.id || "").trim() === id);
  if (exists) throw new Error("이미 사용중인 ID 입니다.");

  users.push({
    id,
    pw,
    name,
    admin: !!userData?.admin,
    role,
    use: userData?.use !== false
  });

  saveUsers(users);
  return users;
}

export function updateUser(id, patch = {}) {
  const users = getUsers();
  const targetId = String(id || "").trim();
  const idx = users.findIndex(u => String(u.id || "").trim() === targetId);

  if (idx < 0) throw new Error("사용자를 찾을 수 없습니다.");

  users[idx] = {
    ...users[idx],
    ...patch,
    id: String(patch.id ?? users[idx].id).trim(),
    pw: String(patch.pw ?? users[idx].pw).trim(),
    name: String(patch.name ?? users[idx].name).trim(),
    role: String(patch.role ?? users[idx].role).trim()
  };

  saveUsers(users);
  return users;
}

export function removeUser(id) {
  const users = getUsers();
  const targetId = String(id || "").trim();
  const nextUsers = users.filter(u => String(u.id || "").trim() !== targetId);
  saveUsers(nextUsers);
  return nextUsers;
}

export function resetUsers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
  return [...DEFAULT_USERS];
}