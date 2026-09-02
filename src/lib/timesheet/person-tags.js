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
import { overCapBookings, overlappingDays, complianceCounts, CAP_MINUTES } from "./compliance.js";
// the one definition of a duplicated shift, shared with the employee's card
import { duplicateSegments } from "./questions.js";

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

// `attendance` is the BATCH's clock reading for this person, handed in rather
// than read off the sheet: the clock export writes nothing to a Timesheet row.
// Null when the period came with no clock export, and that is not zero - see
// complianceFor.
export function tagsForPerson(t, { restRowCount = 0, attendance = null } = {}) {
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
  let punchDays = 0;
  for (const p of data.punchIssues || []) {
    if (!overlapInfo(byDate[p.date]?.shifts)) punchDays++;
  }
  if (punchDays) {
    tags.push({ key: "punch", label: "Punches that do not read", n: punchDays, tone: "conflict" });
  }

  // ---- how the schedule was BUILT ------------------------------------------
  //
  // Not the person's record and not their pay: a booking is rostered before
  // anyone clocks into it, so these say something about the office. See the
  // note at the top of compliance.js. They carry their own tone for that
  // reason - every other tag here is warm, meaning something about this person
  // needs looking at, and reading these the same way blames them for a
  // schedule they were handed.
  //
  // COUNTED OFF THE ROSTER, NOT OFF punchIssues, 2026-08-22. The overlap tag
  // used to count days that overlapped AND produced a punch issue, which is a
  // subset and a much smaller one: 31 days against the 77 that actually
  // overlap. Cain's 08/01 card read zero while ten of her days had bookings
  // over each other - a clean overlap raises no punch problem at all, and its
  // minutes still bill twice, which is the whole reason it is a finding. The
  // punch split above keeps asking `overlapInfo`, because deciding whether a
  // punch issue is explained by an overlap is a different question from
  // counting overlaps.
  // These carry a `plural` because a count sits in front of them on the card.
  // COMPLIANCE_KINDS holds the heading each one gets on the checks panel, where
  // it stands alone and reads as a title; "9 Two blocks rostered over each
  // other" is not a sentence, so the card says it its own way.
  const overlaps = overlappingDays(byDate);
  if (overlaps.length) {
    tags.push({
      key: "overlap",
      label: "day with bookings over each other",
      plural: "days with bookings over each other",
      n: overlaps.length,
      tone: "scheduling",
    });
  }

  // what the clock export saw, if the period came with one. Same tone as the
  // two above: none of it is this person's doing in the way a missed break is,
  // and none of it touches their pay.
  const clockCounts = complianceCounts(attendance?.findings || []);
  const CLOCK_TAGS = [
    ["no-clock-in", "shift never clocked into", "shifts never clocked into"],
    ["no-clock-out", "shift never clocked out of", "shifts never clocked out of"],
    ["no-gps", "clock with no location captured", "clocks with no location captured"],
    ["worked-over-cap", `shift worked past ${CAP_MINUTES / 60} hours`, `shifts worked past ${CAP_MINUTES / 60} hours`],
  ];
  for (const [kind, one, many] of CLOCK_TAGS) {
    if (!clockCounts[kind]) continue;
    tags.push({ key: kind, label: one, plural: many, n: clockCounts[kind], tone: "scheduling" });
  }

  // THE SAME SHIFT ENTERED TWICE - a record error of the schedule's own
  // making, so it wears the office tone; blaming the person for a doubled
  // booking is exactly what the tone note above warns against. The employee's
  // card asks the question; this chip is what keeps the day visible to the
  // office whatever they answer, or if they never answer at all.
  const dupDays = (data.days || []).filter((d) => duplicateSegments(d).length).length;
  if (dupDays) {
    tags.push({
      key: "duplicate-shift",
      label: "day with the same shift entered twice",
      plural: "days with the same shift entered twice",
      n: dupDays,
      tone: "scheduling",
    });
  }

  const overCap = overCapBookings(byDate);
  if (overCap.length) {
    tags.push({
      key: "over-cap",
      label: `booking over ${CAP_MINUTES / 60} hours`,
      plural: `bookings over ${CAP_MINUTES / 60} hours`,
      n: overCap.length,
      tone: "scheduling",
    });
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
