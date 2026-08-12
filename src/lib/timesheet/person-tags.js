// WHAT ONE PERSON'S PERIOD HAS ON IT, as a short list of tags.
//
// Mánu 2026-08-12: a card for every name in the timesheet, with tags for every
// violation, premium, missing thing and conflict, and a way through to their day
// by day. The checks screen only lists people something is wrong with; this is
// the list of everybody, because reaching out to somebody starts with finding
// them, and 14 of the 60 in the August batch have nothing flagged at all and so
// appear on no screen we have.
//
// EVERY TAG READS A SOURCE THAT IS ALREADY THE ONE DEFINITION. Violations come
// from `violationsFor`, overlaps from `overlapInfo` - the same function the
// checks list calls, moved into its own file so both can. Nothing here decides
// for itself what a violation is; that mistake was the whole of 2026-08-11.
//
// `tone` is a key, not a class. Tailwind v4 only compiles classes it can see in
// source, so assembling one from a variable produces no colour at all - the
// violations group shipped with a white border once for exactly that reason. The
// component holds the literal strings.
import { violationsFor, VIOLATION_KINDS } from "./violations.js";
import { overlapInfo } from "./schedule-overlap.js";

// what a schedule flag is called in front of a person. `compareToSchedule`
// produces these three and they are all ZERO on both live batches as of
// 2026-08-12, verified rather than assumed - so this table is here to be correct
// when one appears, not because anything renders it today.
const FLAG_LABELS = {
  mismatch: "Hours disagree with the schedule",
  "not-on-schedule": "Worked a day not on the schedule",
  "missing-from-timesheet": "Scheduled but never worked",
};

const r2 = (n) => Math.round((n || 0) * 100) / 100;

export function tagsForPerson(t, { restRowCount = 0 } = {}) {
  const data = t?.data || {};
  const v = violationsFor(data);
  const byDate = data.scheduleCheck?.byDate || {};
  const tags = [];

  // ---- violations, one tag per kind, counted -------------------------------
  const byKind = {};
  for (const x of v.flagged) for (const y of x.list) byKind[y.kind] = (byKind[y.kind] || 0) + 1;
  for (const kind of Object.keys(VIOLATION_KINDS)) {
    if (!byKind[kind]) continue;
    tags.push({ key: kind, label: VIOLATION_KINDS[kind].label, n: byKind[kind], tone: "violation" });
  }

  // ---- what they are charged ----------------------------------------------
  //
  // An ADMIN surface, so the figure is allowed to say what it is. No employee
  // screen names a premium or added time, and this is not one.
  const premium = r2(t?.premiumHours);
  if (premium > 0) {
    tags.push({ key: "premium", label: "premium hours", n: premium, tone: "premium", figure: true });
  }

  // ---- conflicts in the record --------------------------------------------
  //
  // Split the way the checks list splits them, by asking the same function: a
  // day the schedule shows as overlapping bookings is a billing conflict, and
  // everything else is a punch that does not read. Garcia's punches are exactly
  // what QSP wrote, and filing her under "punches that do not read" is what
  // Mánu objected to.
  let overlapDays = 0;
  let punchDays = 0;
  for (const p of data.punchIssues || []) {
    if (overlapInfo(byDate[p.date]?.shifts)) overlapDays++;
    else punchDays++;
  }
  if (overlapDays) {
    tags.push({ key: "overlap", label: "Bookings billed over each other", n: overlapDays, tone: "conflict" });
  }
  if (punchDays) {
    tags.push({ key: "punch", label: "Punches that do not read", n: punchDays, tone: "conflict" });
  }

  for (const f of data.scheduleCheck?.flagged || []) {
    const key = `flag-${f.kind}`;
    const found = tags.find((x) => x.key === key);
    if (found) found.n++;
    else tags.push({ key, label: FLAG_LABELS[f.kind] || "Disagrees with the schedule", n: 1, tone: "conflict" });
  }

  // ---- things missing from the documents -----------------------------------
  if (restRowCount) {
    tags.push({ key: "rest-rows", label: "Rest entries that cannot be read", n: restRowCount, tone: "anomaly" });
  }
  // WHY their rests read as nothing taken, said once. It is a person's fact, not
  // a day's - printed per day it was the identical sentence five times down
  // Aranda's page.
  if (v.noReport) {
    tags.push({ key: "no-report", label: "Not in the Rest Periods Report", n: null, tone: "missing" });
  }

  return tags;
}

// a person with nothing on them at all. Kept as its own question rather than
// `tags.length === 0` at each call site, because "clean" is a claim and it
// should be made in one place.
export function isClean(tags) {
  return tags.length === 0;
}
