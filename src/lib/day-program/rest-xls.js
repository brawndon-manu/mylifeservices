// The day program's edited Rest Periods report: the QSP export with a SECOND
// pair of Rest Period Time Out / In columns, hand-filled with the 2nd breaks
// that QSP itself has no field for.
//
// The pair shares header names with the original columns, which is why the
// ordinary header-keyed reader cannot see this file straight: the empty second
// pair overwrites the first in the map and nearly every break disappears. So
// this reads the grid POSITIONALLY, splits each day into one row per break,
// and hands both through the same normalization and classification the MLS
// rest report gets - one code path for what counts as a rest.

import { readXls, readXlsTable } from "../xls.js";
import { allRestRows, restRowsFromTable } from "../timesheet/rests.js";
import { clockLabel } from "./rest-report.js";

// a time cell someone typed in Excel arrives either as text ("12:15 PM") or
// as a day-fraction number (0.5104...). both mean a clock time.
const asClock = (v) => {
  if (typeof v === "number" && v > 0 && v < 1) return clockLabel(Math.round(v * 24 * 60));
  const s = String(v ?? "").trim();
  return s || null;
};

// Rows in the allRestRows shape, from either layout. The standard export goes
// through allRestRows untouched; the two-pair layout is detected by its
// doubled header and split into one row per break.
export function dayProgramRestRows(bytes) {
  const grid = readXls(bytes);
  const headerIdx = grid.findIndex((r) => String(r?.[1] ?? "").trim() === "Employee Name");
  const header = headerIdx >= 0 ? grid[headerIdx].map((c) => String(c ?? "").trim()) : [];
  const outCols = header
    .map((label, i) => (label === "Rest Period Time Out" ? i : -1))
    .filter((i) => i >= 0);

  if (outCols.length < 2) return allRestRows(bytes);

  // column positions, taken from the header itself rather than assumed
  const col = (label, from = 0) => header.findIndex((h, i) => i >= from && h === label);
  const C = {
    name: col("Employee Name"),
    office: col("Employee Office"),
    client: col("Client Name"),
    service: col("Service Type"),
    date: col("Start Date"),
    shiftStart: col("Shift Start Time"),
    endDate: col("End Date"),
    shiftEnd: col("Shift End Time"),
    shiftHours: col("Total Shift Hours"),
    out1: outCols[0],
    in1: col("Rest Period Time In", outCols[0]),
    total1: col("Total Rest Time"),
    out2: outCols[1],
    in2: col("Rest Period Time In", outCols[1]),
    notes: col("Schedule Notes"),
  };

  const tableRows = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const g = grid[i];
    if (!g || !g[C.name]) continue;
    const base = {
      "Employee Name": g[C.name],
      "Client Name": g[C.client],
      "Service Type": g[C.service],
      "Start Date": g[C.date],
      "Shift Start Time": g[C.shiftStart],
      "Shift End Time": g[C.shiftEnd],
      "Schedule Notes": g[C.notes],
    };
    tableRows.push({
      ...base,
      "Rest Period Time Out": asClock(g[C.out1]),
      "Rest Period Time In": asClock(g[C.in1]),
      "Total Rest Time": g[C.total1],
    });
    const out2 = asClock(g[C.out2]);
    const in2 = asClock(g[C.in2]);
    if (out2 && in2) {
      // the length the pair implies, in the report's own unit (hours), so the
      // classifier judges the hand-typed break by the same rule as a logged one
      const mins = (() => {
        const a = clockMinOf(out2);
        const b = clockMinOf(in2);
        return a != null && b != null && b > a ? b - a : null;
      })();
      tableRows.push({
        ...base,
        "Rest Period Time Out": out2,
        "Rest Period Time In": in2,
        "Total Rest Time": mins != null ? Math.round((mins / 60) * 100) / 100 : null,
      });
    }
  }
  return restRowsFromTable(tableRows);
}

// local 12-hour parse, matching rests.clockMin's accepted shapes without
// importing it into a cycle
function clockMinOf(s) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(s || "").trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}

// re-exported so callers needing the plain table (for the notes) stay on one
// import
export { readXlsTable };
