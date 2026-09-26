// QSP's Mileage Detail Report (.xls) - one line per trip.
//
// The schedule lock needs miles by the day: a trip added to a locked day, or
// re-measured, is a change like any other. The payroll report's "Miles
// Driven" and the Employee Mileage Tracking Report are period totals for a
// person, so they can say a figure moved but never which trip. This report
// can.
//
// SHAPE OF THE DOCUMENT. One worksheet per member of staff, each opening with
// a title block, then a table, then a grand total:
//
//   [ "My Life Services", "Mileage Detail Report" ]
//   [ "9/16/2026 - 9/24/2026" ]
//   [ "Bass, Devin" ]
//   [ "Date", "Scheduled Client", "Starting Location", "Destination Locations", "Total Miles", "Source" ]
//   [ "09/16/2026", "Barajas, Christopher", "848 Towne St ...", "15 Riparian View ...", 10.72, "Auto" ]
//   [ "GRAND TOTAL MILES =", 59 ]
//
// The person is the line above the table, read per sheet rather than off the
// rows, the same way the service notes .xls names its staff.
//
// relative, not "@/lib/..." - the test runner has no alias
import { readXlsSheets } from "../xls.js";

const HEADER = ["Date", "Scheduled Client", "Starting Location", "Destination Locations", "Total Miles", "Source"];
const DATE_CELL = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const RANGE_CELL = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

const squash = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const mdy = (m, d, y) => `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${String(y).slice(2)}`;
const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

// ONE WORKSHEET -> its trips, plus the range the title block prints. Split out
// so a test can drive it without the workbook.
export function readMileageSheet(rows) {
  const cells = (row) => (row || []).filter((c) => c != null && String(c).trim() !== "");
  const headerAt = rows.findIndex((row) => {
    const c = cells(row).map((x) => squash(x));
    return HEADER.every((h) => c.includes(h));
  });
  if (headerAt < 0) return { employee: null, range: null, trips: [] };

  // the person is the last non-empty line of the title block above the table,
  // the range the line that reads like one
  let employee = null;
  let range = null;
  for (let i = 0; i < headerAt; i++) {
    for (const c of cells(rows[i])) {
      const s = squash(c);
      const r = RANGE_CELL.exec(s);
      if (r) range = { from: mdy(r[1], r[2], r[3]), to: mdy(r[4], r[5], r[6]) };
      else if (s.includes(",") && !/mileage|report|services/i.test(s)) employee = s;
    }
  }

  const header = rows[headerAt].map((c) => squash(c));
  const col = Object.fromEntries(HEADER.map((h) => [h, header.indexOf(h)]));
  const trips = [];
  for (let i = headerAt + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const d = DATE_CELL.exec(squash(row[col.Date]));
    if (!d) continue;
    trips.push({
      employee,
      date: mdy(d[1], d[2], d[3]),
      client: squash(row[col["Scheduled Client"]]) || null,
      // a multi-stop trip prints its stops on lines joined by "-->"
      from: squash(row[col["Starting Location"]]) || null,
      to: squash(row[col["Destination Locations"]]) || null,
      miles: num(row[col["Total Miles"]]) ?? 0,
      source: squash(row[col.Source]) || null,
    });
  }
  return { employee, range, trips };
}

// -> { trips, range } for the whole workbook; the range is the widest any
// sheet prints, which is the pull
export function parseMileageDetail(bytes) {
  const sheets = readXlsSheets(bytes);
  const trips = [];
  let range = null;
  for (const rows of sheets) {
    const read = readMileageSheet(rows);
    trips.push(...read.trips);
    if (read.range) {
      const key = (d) => { const [m, dd, y] = d.split("/"); return Number(`${y}${m}${dd}`); };
      if (!range || key(read.range.from) < key(range.from)) range = { ...(range || {}), from: read.range.from };
      if (!range.to || key(read.range.to) > key(range.to)) range = { ...range, to: read.range.to };
    }
  }
  if (!trips.length && !range) throw new Error("that doesn't look like the Mileage Detail Report (no trips or date range found)");
  return { trips, range };
}
