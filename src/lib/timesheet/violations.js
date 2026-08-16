// A VIOLATION IS NOT AN ANOMALY, and this file exists to keep the two apart.
//
// Mánu 2026-08-12: "anomalies should be defined as any discrepancies in their
// schedule. any changes we fix on our own that need to be corrected, confirmed,
// are all things that they still need to do under QSP. A missing rest period or
// lunch is not an anomaly under that definition. It is a violation."
//
// So the line is about WHICH THING IS WRONG. An anomaly is the record being
// wrong: a rest logged outside the shift, a break sitting in a punched-out gap,
// two bookings billed over each other. The day happened fine and the document
// describes it badly, and the repair is in QuickSolve.
//
// A violation is the record being RIGHT and the rule having been broken. The
// document correctly says no meal was taken on an eight hour day. Nothing about
// the file needs repairing; a break the law required did not get recorded as
// happening, and §226.7 charges an hour for it.
//
// The two live in different groups on the checks screen because they need
// different things done about them, and putting a missing lunch under a heading
// whose own description reads "Nothing to fix here" was telling the reader the
// opposite of what to do.
//
// ONE DEFINITION, TWO SCREENS. The checks list and the person page both read
// this file. Every bug found on 2026-08-11 was one fact stated in several places
// with one copy drifted, so the kinds, the wording and the test for each are all
// here and neither screen gets to decide for itself what counts.

// `mealViolation` is ALREADY (mealMissing AND NOT mealWaived) OR mealLate - the
// engine's own field, verified against the live batch: 62 days with no meal, 21
// of them waived, leaves 41, plus 8 late = the 49 it reports, with no day
// violating outside that rule and none both waived and violating. So nothing
// here recomputes it. A second opinion about what a violation is would be a
// third definition of the same rule.
// `.js` on purpose: every intra-lib import here carries it, because these
// modules are read by `node --test`, which has no bundler to guess with.
import { mealWindows, mealBookedInside } from "./questions.js";

export const VIOLATION_KINDS = {
  "rest-not-taken": {
    label: "Rest period not taken",
    // what the reviewer says to the person, which is the whole point of the
    // screen. Conditional on purpose: we do not know which of the two it is,
    // and that is exactly what the call is for.
    ask: "Fewer rest periods recorded than the day requires. If they took them, they need logging in QuickSolve.",
  },
  "meal-not-recorded": {
    label: "No meal period recorded",
    ask: "No meal punched on a day that requires one. If they took it, it needs punching in QuickSolve.",
    // AND THE DAY THAT COULD NOT HAVE HELD ONE.
    //
    // The sentence above sends somebody to QuickSolve to punch a meal in. On a
    // day with no gap a lawful half hour fits in there is nothing to punch and
    // no correction to chase, so it was pointing at work that does not exist -
    // and the control beside it offered "they took it, needs punching", which is
    // an answer the day cannot support and a claim nobody could act on.
    //
    // 9 days on the live batch over 6 people, 143 in July over 42.
    askNoRoom: "No meal punched, and no gap in the day long enough for one. "
      + "Nothing to punch here, so this needs a reason rather than a correction.",
  },
  // THE ROSTER PUT THE MEAL INSIDE A BLOCK THEY WERE WORKING.
  //
  // Two kinds, because the way out is opposite. A clocked shift is punched and
  // is not ours to move, so the meal could not have happened and the schedule
  // is what needs correcting. Unpunched time can be rearranged instead, and the
  // meal can stand.
  "meal-in-shift": {
    label: "Meal booked inside a shift",
    ask: "The roster books a meal break inside a shift they clock in and out of, so it could not "
      + "have been taken. The schedule needs it moved outside the shift. Ask why they did not get one.",
  },
  "meal-movable": {
    label: "Meal booked inside unpunched time",
    ask: "Not a clocked shift, so the block can be moved rather than the meal break being written "
      + "off. Ask whether it can be rearranged and what the meal break and the block become.",
  },
  "meal-late": {
    label: "Meal period started too late",
    ask: "A meal was taken but began after the end of the fifth hour. Check the real start time in QuickSolve.",
  },
};

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// every violation on ONE stored day, in the order a reader wants them.
//
// `restSource === "none"` IS INCLUDED. It was excluded for one build, on the
// reasoning that being absent from the Rest Periods Report is a hole in the
// document rather than a broken rule. Mánu 2026-08-12, looking at Aranda 08/03:
// "This should show everything for that day, not just the [meal]. anything that
// is caught in our engine. in this case it's missing a meal break as well. and
// 2 rest."
//
// He is right and the arithmetic says so out loud. Her 10.00 premium hours are
// five meal and five rest, so every one of her days owes a rest premium, and a
// page that showed only the meal was describing half of what she is charged for.
// Across the live batch the two totals now reconcile exactly: 99 rest + 49 meal
// = 148 findings = the batch's 148.00 premium hours, one per workday per kind.
// Any day dropped from this list is a premium hour nobody can see the basis for.
//
// WHY the rests are missing is a different sentence, and it stays a person level
// one - `noReport` below - so it is said once on their page instead of five
// times down it.
// the roster is not on the day row, so a caller that has it hands it in. Without
// one this behaves exactly as it did, which is what keeps the person page and
// the checks list working while only one of them can see the schedule.
const clock = (m) => {
  if (!Number.isFinite(m)) return "";
  const h = Math.floor(m / 60), x = h % 12 === 0 ? 12 : h % 12, mm = m % 60;
  return `${x}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
};

export function dayViolations(d, entry = null) {
  if (!d) return [];
  const out = [];
  if (d.restViolation) {
    const short = (d.restRequired || 0) - (d.restTaken || 0);
    out.push({
      kind: "rest-not-taken",
      short,
      noReport: d.restSource === "none",
      detail: `${d.restTaken ?? 0} of ${d.restRequired} recorded`,
    });
  }
  const booked = d.mealViolation && !d.mealLate ? mealBookedInside(entry) : null;
  if (d.mealViolation) {
    out.push(
      d.mealLate
        ? { kind: "meal-late", detail: `started ${d.mealStartedAfterMin} minutes in` }
        : booked
          ? {
            kind: booked.kind === "clocked" ? "meal-in-shift" : "meal-movable",
            detail: `${clock(booked.mealFrom)}-${clock(booked.mealTo)}, inside ${booked.service}`,
          }
          : {
          kind: "meal-not-recorded",
          detail: `nothing recorded on a ${r2(d.paidHours).toFixed(2)} hour day`,
          // WHETHER THE DAY EVER HAD ROOM FOR ONE, read from the engine's own
          // windows rather than worked out again here. It is the same fact the
          // employee's card reads to stop offering "I took it": see `noRoom` on
          // the meal slot in `slotsFor`. Two screens, one answer about the day.
          noRoom: !mealWindows(d).length,
        },
    );
  }
  return out;
}

// one person's whole period: every day they worked, with its violations
// attached. CLEAN DAYS ARE KEPT, because the person page draws their schedule
// and a schedule with the quiet days deleted is not a schedule - it is the list
// again, and you cannot see that the ten minute hole at 12:30 on the 1st is the
// same hole as the one on the 2nd if only the flagged days are drawn.
export function violationsFor(data) {
  const byDate = data?.scheduleCheck?.byDate || {};
  const days = (data?.days || []).map((d) => ({ day: d, list: dayViolations(d, byDate[d.date]) }));
  const flagged = days.filter((x) => x.list.length);
  const total = flagged.reduce((n, x) => n + x.list.length, 0);
  const kinds = [];
  for (const x of flagged) for (const v of x.list) if (!kinds.includes(v.kind)) kinds.push(v.kind);
  // how many of their rest violations are missing because the report never
  // mentions them. A PERSON's fact, not a day's: printed per day it repeated
  // identically on all five of Aranda's. The screens use it for one line of
  // explanation and never as a finding of its own.
  const noReport = flagged.reduce(
    (n, x) => n + x.list.filter((v) => v.kind === "rest-not-taken" && v.noReport).length,
    0,
  );
  return { days, flagged, total, kinds, dayCount: flagged.length, noReport };
}

// "2 rest periods not taken", "no meal period recorded" - the heading for one
// day, which is a different sentence from the kind's own label because the
// count belongs in it.
export function violationHead(v) {
  if (v.kind === "rest-not-taken") {
    return v.short === 1 ? "a rest period not taken" : `${v.short} rest periods not taken`;
  }
  return VIOLATION_KINDS[v.kind].label.toLowerCase();
}
