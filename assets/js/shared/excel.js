// /assets/js/shared/excel.js

export function downloadExcelFile(options = {}) {
  const {
    fileName = "export.xlsx",
    sheetName = "Sheet1",
    rows = [],
    headers = null
  } = options;

  if (typeof XLSX === "undefined") {
    throw new Error("XLSX library not found");
  }

  let sheetRows = rows;

  if (Array.isArray(headers) && headers.length > 0) {
    sheetRows = [
      headers,
      ...rows.map(row => headers.map(key => normalizeCell(getCellValue(row, key))))
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
    return;
  }

  const normalizedRows = rows.map(row => normalizeRow(row));
  const ws = XLSX.utils.json_to_sheet(normalizedRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

function getCellValue(row, key) {
  if (row && typeof row === "object" && !Array.isArray(row)) {
    return row[key];
  }
  return "";
}

function normalizeRow(row) {
  if (!row || typeof row !== "object") return row;
  const next = {};
  Object.keys(row).forEach(key => {
    next[key] = normalizeCell(row[key]);
  });
  return next;
}

function normalizeCell(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return value;
}