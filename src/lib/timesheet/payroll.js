// The QSP Simple Payroll Processing Report: one row per employee, carrying the
// figures payroll actually runs on.
//
// This arrived on 2026-08-06 when the export set was cut from four reports to
// three. It replaces nothing the engine used to read, and adds something it
// never had: QSP's OWN regular, overtime and double-time totals per person.
//
// Why that matters. Until now the only way to know what QSP thought somebody's
// overtime was, was to re-parse the printed OT column off the timesheet PDF and
// hope we read it right. That disagreement is what blocked a whole pay period
// (TASKS.md #67 - Garcia, 13.11 against our 4.00). This report states it
// outright, so reconciliation becomes a join rather than an argument.
//
// It is a SUMMARY. There is no per-shift or per-day detail in it, so it can
// never say when somebody worked, only how much they were paid for. Hours still
// come from the timesheet, which is the document staff sign.

import { readXlsTable } from "../xls.js";

const REQUIRED = ["Employee Name", "RegHr", "OvtHr"];

export function payrollKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function parsePayrollReport(bytes) {
  const { headers, rows } = readXlsTable(bytes);
  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new Error(
      `that doesn't look like the QSP Simple Payroll Processing Report (no ${missing.join(", ")})`,
    );
  }

  const people = new Map();
  for (const r of rows) {
    const name = r["Employee Name"];
    if (!name) continue;
    const key = payrollKey(name);
    // QSP prints one row per employee, but a duplicate would silently halve
    // somebody's hours if we overwrote, so add instead
    const prev = people.get(key);
    const row = {
      name: String(name).trim(),
      employeeNumber: String(r["Employee_Number"] ?? "").trim(),
      regular: num(r.RegHr) + num(prev?.regular),
      overtime: num(r.OvtHr) + num(prev?.overtime),
      // QSP has a second pair of rate columns that are unused here. Carried
      // anyway: a figure that appears one period and is not read is exactly how
      // hours go missing.
      regular2: num(r.Hrly2) + num(prev?.regular2),
      overtime2: num(r.OT2) + num(prev?.overtime2),
      double: num(r.DT) + num(prev?.double),
      holiday: num(r.HolHr) + num(prev?.holiday),
      sick: num(r.SickHr) + num(prev?.sick),
      pto: num(r.PTO) + num(prev?.pto),
      rows: (prev?.rows ?? 0) + 1,
    };
    row.paid = row.regular + row.overtime + row.regular2 + row.overtime2 + row.double;
    people.set(key, row);
  }
  return people;
}

// What QSP says the whole period comes to. The new Simple Timesheet reconciles
// with this exactly (4032.35 + 17.06 = 4049.41 on 07/16-07/31), so a gap between
// the two means one of the exports is from a different pull.
export function payrollTotals(people) {
  const t = {
    employees: 0, regular: 0, overtime: 0, double: 0,
    holiday: 0, sick: 0, pto: 0, paid: 0,
  };
  for (const [, p] of people) {
    t.employees++;
    t.regular += p.regular + p.regular2;
    t.overtime += p.overtime + p.overtime2;
    t.double += p.double;
    t.holiday += p.holiday;
    t.sick += p.sick;
    t.pto += p.pto;
    t.paid += p.paid;
  }
  return t;
}

// Our figures against QSP's own, per person. This is TASKS.md #69, and it is
// the check that would have caught Garcia without anybody reading a PDF.
//
// `tolerance` is deliberately loose: QSP rounds each segment up to the
// hundredth, so a day can legitimately differ by a minute or so.
export function reconcile(mine, theirs, { tolerance = 0.03 } = {}) {
  const out = [];
  for (const m of mine) {
    const p = theirs.get(payrollKey(m.sourceName)) || null;
    if (!p) {
      out.push({ name: m.sourceName, matched: false });
      continue;
    }
    const dReg = (m.regularHours ?? 0) - (p.regular + p.regular2);
    const dOt = (m.otHours ?? 0) - (p.overtime + p.overtime2);
    const dDt = (m.doubleHours ?? 0) - p.double;
    const dPaid = (m.paidHours ?? 0) - p.paid;
    out.push({
      name: m.sourceName,
      matched: true,
      ours: { regular: m.regularHours ?? 0, overtime: m.otHours ?? 0, double: m.doubleHours ?? 0, paid: m.paidHours ?? 0 },
      qsp: { regular: p.regular + p.regular2, overtime: p.overtime + p.overtime2, double: p.double, paid: p.paid },
      diff: { regular: dReg, overtime: dOt, double: dDt, paid: dPaid },
      // the one that matters: a corrected sheet paying LESS than payroll already
      // produced is the shape that becomes a wage claim
      paysLess: dPaid < -tolerance,
      agrees:
        Math.abs(dReg) <= tolerance &&
        Math.abs(dOt) <= tolerance &&
        Math.abs(dDt) <= tolerance,
    });
  }
  return out;
}
