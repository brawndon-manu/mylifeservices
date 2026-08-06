// The QSP Rest Periods Report: one row per shift, with the rest break taken
// during it.
//
// This decides whether a rest break happened. Until now that was inferred from
// gaps between punches, which is a guess - a ten minute gap might be a break, or
// travel between two clients, or a punch artefact. QSP records the break itself,
// so where this report covers someone it is simply a better answer.
//
// It changes WHETHER A BREAK WAS TAKEN. It never changes hours. Paid time still
// comes from the timesheet punches, because the timesheet is the document staff
// sign and the one everything else is reconciled against.
//
// Measured on 07/16-07/31: using this instead of punch gaps moves 38 days onto a
// rest premium and 1 day off one, about +50 premium hours. It runs in the
// direction of paying people more, which is the direction to be wrong in.

import { readXlsTable } from "../xls.js";
import { normalizeDate } from "./clock.js";

// A real rest break is ten minutes, give or take how it was entered. Anything
// outside this band is a broken record: QSP accepts breaks that run backwards
// (a negative total) and breaks with an AM/PM slip that read as 12 hours. On
// this period there were 18 such rows out of 350.
//
// A malformed row is NOT counted as a break taken. That is deliberate: we can
// see something was typed, but not that anyone actually stopped working, and
// the rule is to pay rather than assume.
const MIN_REST_HOURS = 0.05;
const MAX_REST_HOURS = 0.5;

export function isSaneRest(totalRestTime) {
  const t = Number(totalRestTime);
  return Number.isFinite(t) && t > MIN_REST_HOURS && t < MAX_REST_HOURS;
}

export function restKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const REQUIRED = ["Employee Name", "Start Date", "Total Rest Time"];

// -> Map(restKey -> { name, byDate: {date: {taken, malformed}}, taken, malformed })
export function parseRestReport(bytes) {
  const { headers, rows } = readXlsTable(bytes);
  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new Error(`that doesn't look like the QSP Rest Periods Report (no ${missing.join(", ")})`);
  }

  const people = new Map();
  for (const r of rows) {
    const name = r["Employee Name"];
    const date = normalizeDate(r["Start Date"]);
    if (!name || !date) continue;
    const key = restKey(name);
    let p = people.get(key);
    if (!p) {
      p = { name: String(name).trim(), byDate: {}, taken: 0, malformed: 0 };
      people.set(key, p);
    }
    const ok = isSaneRest(r["Total Rest Time"]);
    if (!p.byDate[date]) p.byDate[date] = { taken: 0, malformed: 0 };
    if (ok) { p.byDate[date].taken++; p.taken++; }
    else { p.byDate[date].malformed++; p.malformed++; }
  }
  return people;
}

// Every broken row in the report, for the checks screen. These are worth showing
// because each one is a real data-entry mistake somebody can go and fix, and
// because a 12-hour "rest break" is alarming enough that people should see it
// rather than trust that we quietly handled it.
export function malformedRows(bytes) {
  const { rows } = readXlsTable(bytes);
  const out = [];
  for (const r of rows) {
    const t = Number(r["Total Rest Time"]);
    if (!Number.isFinite(t) || isSaneRest(t)) continue;
    out.push({
      name: String(r["Employee Name"] || "").trim(),
      date: normalizeDate(r["Start Date"]),
      out: String(r["Rest Period Time Out"] ?? "").trim(),
      in: String(r["Rest Period Time In"] ?? "").trim(),
      hours: t,
      // what a reader needs to see at a glance
      kind: t > 1 ? "am-pm" : t < 0 ? "backwards" : "wrong-length",
    });
  }
  return out;
}
