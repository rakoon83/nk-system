const SUPABASE_URL = "https://pdadmygpowrhrxxwawak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Hzk4cMVV-7hFDP_ehgqh_A_CFcQm-A1";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

export async function refreshInvoiceProgress(invoice) {
  const inv = clean(invoice);
  if (!inv) return;

  const [
    sapDocRows,
    sapItemRows,
    scanInRows,
    repairRows,
    scanOutRows,
    scanLoadRows,
    oldRows
  ] = await Promise.all([
    fetchByInvoice("sap_doc", inv),
    fetchByInvoice("sap_item", inv),
    fetchByInvoice("scan_in_log", inv),
    fetchByInvoice("worklog_scan", inv),
    fetchByInvoice("scan_out_log", inv),
    fetchByInvoice("scan_load_log", inv),
    fetchByInvoice("invoice_progress_log", inv, "invoice_base")
  ]);

  if (!sapDocRows.length) return;

  const scanIn = getItemProgress(inv, sapItemRows, scanInRows, false);
  const repair = getItemProgress(inv, sapItemRows, repairRows, true);
  const scanOut = getItemProgress(inv, sapItemRows, scanOutRows, false);
  const load = getLoadProgress(inv, sapItemRows, scanLoadRows);

  const displays = makeDisplayList(inv, sapDocRows.length, oldRows);
  const saveRows = [];

  sapDocRows.forEach((doc, index) => {
    saveRows.push({
      invoice_base: inv,
      invoice_display: displays[index],

      ship_date: clean(doc.ship_date),
      country: clean(doc.country),
      outbound_qty: toNum(doc.outbound_qty),
      type: clean(doc.type),
      container: clean(doc.container),

      scan_in_status: scanIn.text,
      scan_in_done: scanIn.done,
      scan_in_total: scanIn.total,

      repair_status: repair.text,
      repair_done: repair.done,
      repair_total: repair.total,

      scan_out_status: scanOut.text,
      scan_out_done: scanOut.done,
      scan_out_total: scanOut.total,

      load_status: load.text,
      load_done: load.done,
      load_total: load.total,

      row_status: "정상"
    });
  });

  const { error } = await supabaseClient
    .from("invoice_progress_log")
    .upsert(saveRows, { onConflict: "invoice_display" });

  if (error) {
    console.error("invoice_progress_log 갱신 실패:", error);
  }
}

async function fetchByInvoice(tableName, invoice, column = "invoice") {
  const { data, error } = await supabaseClient
    .from(tableName)
    .select("*")
    .eq(column, invoice);

  if (error) {
    console.error(`${tableName} 조회 실패`, error);
    return [];
  }

  return Array.isArray(data) ? data : [];
}

function getItemProgress(invoice, itemRows, logRows, repairOnly) {
  let items = itemRows.filter(row => clean(row.invoice) === invoice);

  if (repairOnly) {
    items = items.filter(row => toNum(row.total_qty) > 0);
  }

  const totalSet = new Set(
    items.map(row => clean(row.material_no)).filter(Boolean)
  );

  if (!totalSet.size) {
    return { text: "미검수", done: 0, total: 0 };
  }

  const doneSet = new Set();

  logRows.forEach(row => {
    const materialNo = clean(row.material_no);

    if (totalSet.has(materialNo)) {
      doneSet.add(materialNo);
    }
  });

  const done = doneSet.size;
  const total = totalSet.size;

  if (done <= 0) {
    return { text: "미검수", done, total };
  }

  if (done >= total) {
    return { text: "검수완료", done, total };
  }

  return { text: "부분완료", done, total };
}

function getLoadProgress(invoice, itemRows, scanLoadRows) {
  const totalSet = new Set(
    itemRows
      .filter(row => clean(row.invoice) === invoice)
      .map(row => clean(row.material_no))
      .filter(Boolean)
  );

  if (!totalSet.size) {
    return { text: "미검수", done: 0, total: 0 };
  }

  const doneSet = new Set();

  scanLoadRows.forEach(row => {
    const materialNo = clean(row.material_no);

    if (totalSet.has(materialNo)) {
      doneSet.add(materialNo);
    }
  });

  const done = doneSet.size;
  const total = totalSet.size;

  if (done <= 0) return { text: "미검수", done, total };
  if (done >= total) return { text: "검수완료", done, total };

  return { text: "부분완료", done, total };

}

function makeDisplayList(invoice, count, oldRows) {
  if (count <= 1) {
    const normal = oldRows.find(row => clean(row.invoice_display) === invoice);
    if (normal) return [invoice];

    const first = oldRows[0];
    if (first) return [clean(first.invoice_display)];

    return [invoice];
  }

  const result = [];

  for (let i = 1; i <= count; i++) {
    const display = `${invoice}-${i}`;
    const old = oldRows.find(row => clean(row.invoice_display) === display);
    result.push(old ? clean(old.invoice_display) : display);
  }

  return result;
}

function clean(value) {
  return String(value ?? "").trim();
}

function toNum(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}