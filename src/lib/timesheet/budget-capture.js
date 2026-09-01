// READING QSP'S BUDGET CAPTURE REPORT.
//
// One row per client per service type, carrying the month's authorization -
// "the amount of hours the clients are given a month" (Mánu, 2026-08-31),
// which is the only figure the audit takes from it. QSP's own variance and
// dollar columns are recomputed downstream from better data, so they are
// read past, not stored.
//
// THE MONTH COMES OFF THE DOCUMENT, never the operator: the sheet's title
// line reads "Budget Capture Report 8/1/2026 - 8/31/2026". A report whose
// range does not sit inside one calendar month is refused rather than filed
// under half the truth - the authorization is a monthly figure and a
// cross-month export has no month to belong to.
//
// The shaping is pure and split out so tests can run it without a real .xls.
import { readXls, readXlsTable } from "../xls.js";
import { clientKey } from "../client-attestations/names.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabelOf(monthKey) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : String(monthKey || "");
}

// "8/1/2026 - 8/31/2026" out of the title line
const TITLE_RE = /Budget\s+Capture\s+Report\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i;

// the pure half: the title line, the table headers and rows, already read.
// Returns { monthKey, monthLabel, rows, skipped } or throws with a `code`.
export function shapeBudgetCapture({ title, rows }) {
  const m = TITLE_RE.exec(String(title || ""));
  if (!m) {
    const err = new Error("The sheet's title line doesn't say what range it covers.");
    err.code = "notitle";
    throw err;
  }
  const [, m1, , y1, m2, , y2] = m;
  if (y1 !== y2 || Number(m1) !== Number(m2)) {
    const err = new Error("The report spans more than one calendar month.");
    err.code = "crossmonth";
    throw err;
  }
  const monthKey = `${y1}-${String(m1).padStart(2, "0")}`;

  const out = [];
  const skipped = [];
  for (const r of rows || []) {
    const name = String(r["Client Name"] || "").trim();
    // the total rows print no client name, which is what marks them as totals
    if (!name) continue;
    const hours = Number(r["Authorized Hours"]);
    if (!Number.isFinite(hours) || hours < 0) {
      skipped.push(name);
      continue;
    }
    out.push({
      clientName: name,
      clientKey: clientKey(name),
      office: String(r["Office"] || "").trim() || null,
      caseManagerName: String(r["Case Manager"] || "").trim() || null,
      serviceType: String(r["Service Type"] || "").trim(),
      authorizedHours: hours,
      scheduledHours: Number.isFinite(Number(r["Scheduled Hours"]))
        ? Number(r["Scheduled Hours"])
        : null,
    });
  }
  if (!out.length) {
    const err = new Error("No client rows with authorized hours were found.");
    err.code = "empty";
    throw err;
  }
  return { monthKey, monthLabel: monthLabelOf(monthKey), rows: out, skipped };
}

// the whole document: title line off the raw grid, rows off the header table
export function readBudgetCapture(buffer) {
  const raw = readXls(buffer);
  const cells = Array.isArray(raw) ? raw : raw?.rows || [];
  let title = "";
  for (const row of cells.slice(0, 12)) {
    for (const cell of row || []) {
      if (typeof cell === "string" && TITLE_RE.test(cell)) {
        title = cell;
        break;
      }
    }
    if (title) break;
  }
  const { rows } = readXlsTable(buffer);
  return shapeBudgetCapture({ title, rows });
}
