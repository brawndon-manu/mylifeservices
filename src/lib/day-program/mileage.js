// The day program's Employee Mileage Tracking Report.
//
// The agency's miles ride in on the Simple Payroll Processing Report, in a
// "Miles Driven" column beside QSP's own hour figures - see payroll.js, which
// reads them there. The day program has no payroll report, so `upload-rows.js`
// pinned every one of its sheets to `qspMiles: null` and mileage simply never
// reached a day program document. This reads the standalone export instead.
//
// One row per employee for the whole period, which is the same shape the
// payroll column has: a period total, not a per-day figure. That is why the
// sheet draws it as a line under the totals rather than a column.
//
// THE REIMBURSEMENT COLUMN IS READ AND DELIBERATELY NOT PAID. QSP prints it
// beside the miles and printed 0.00 for every row on the 08/16-08/21 pull,
// because no per-mile rate is configured there. A zero that means "nobody
// entered a rate" must never reach a payout as a zero that means "owed
// nothing", so it is carried for a person to look at and nothing downstream
// multiplies by it.

import { readXlsTable } from "../xls.js";
import { restKey } from "../timesheet/rests.js";

// what QSP calls them, exactly. Employee and Miles Driven are the two this
// cannot work without; a file lacking either is not this report.
const REQUIRED = ["Employee", "Miles Driven"];

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// Map of restKey(name) -> { name, miles, reimbursement }.
//
// Keyed with restKey rather than a key of its own so the same `aliasKey`
// indirection that finds someone's rest rows finds their miles: QSP does not
// spell everybody the same way in two exports, and this is a third one.
export function parseMileageReport(bytes) {
  return mileageFromTable(readXlsTable(bytes));
}

// the reading itself, split from the file so it can be tested without one.
export function mileageFromTable({ headers, rows }) {
  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new Error(
      `that doesn't look like the Employee Mileage Tracking Report (no ${missing.join(", ")})`,
    );
  }

  const people = new Map();
  for (const r of rows) {
    const name = r.Employee;
    if (!name || !String(name).trim()) continue;
    const key = restKey(name);
    // one row per person is the expected shape, but a duplicate would silently
    // replace rather than add and somebody's miles would go missing - the same
    // trap parsePayrollReport guards. Add.
    const prev = people.get(key);
    people.set(key, {
      name: String(name).trim(),
      miles: r2(num(r["Miles Driven"]) + (prev?.miles || 0)),
      reimbursement: r2(num(r.Reimbursement) + (prev?.reimbursement || 0)),
    });
  }

  return people;
}

// Every name the report carries, for the coverage check at upload. A mileage
// export pulled for the wrong period, or for the agency instead of the day
// program, matches nobody - and silently writing zero miles onto thirty sheets
// is exactly the kind of quiet wrong number this codebase refuses elsewhere.
export function mileageNames(people) {
  return [...people.values()].map((p) => p.name);
}

// Whether anybody in this report drove anything. A file whose every row reads
// 0.00 is far more likely to be the wrong export than a fortnight in which no
// day program staff member drove at all, so the upload says so rather than
// writing thirty honest-looking zeros.
export function anyMilesDriven(people) {
  return [...people.values()].some((p) => p.miles > 0);
}
