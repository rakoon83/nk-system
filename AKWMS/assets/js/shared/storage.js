// /assets/js/shared/storage.js

export function loadStorage(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return cloneDefault(defaultValue);
    return JSON.parse(raw);
  } catch (err) {
    console.error("loadStorage error:", key, err);
    return cloneDefault(defaultValue);
  }
}

export function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error("saveStorage error:", key, err);
    return false;
  }
}

export function removeStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (err) {
    console.error("removeStorage error:", key, err);
    return false;
  }
}

export function loadStorageRows(key, defaultRows = []) {
  const value = loadStorage(key, defaultRows);
  return Array.isArray(value) ? value : cloneDefault(defaultRows);
}

export function saveStorageRows(key, rows = []) {
  return saveStorage(key, Array.isArray(rows) ? rows : []);
}

function cloneDefault(value) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === "object") return { ...value };
  return value;
}