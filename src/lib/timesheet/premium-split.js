// The two premium figures, and which one payroll pays.
//
// THE SILENCE DEFAULT REVERSED ON 2026-08-11. Until then an unanswered question
// resolved to NOT PAID, and the figure payroll paid was the small one: 14.00
// hours against 678.00 on the live batch, a 664 hour swing. Mánu confirmed the
// full reversal and had it costed first. It now resolves to PAID.
//
// So the two figures kept their arithmetic and swapped their jobs:
//
//   PROJECTED           every fault the reports actually show, taken literally,
//                       with its penalty. THE DEFAULT, and what payroll pays.
//   POLICY ASSUMPTIONS  what we assume instead. Each one REDUCES the projected
//                       figure, and each one needs confirmation before it does.
//
// The gap between them is the size of what is still unanswered, and the total
// can now only ever come DOWN as people reply. That is the point of the
// reversal: an employee who never opens the email keeps every hour, and nobody
// loses pay by not filling in a form.
//
// WHAT AN ANSWER DOES, therefore, is the opposite of what it used to do. "Yes I
// took it" REMOVES an hour. "No I missed it" changes nothing, because the sheet
// already says they missed it.
//
// WHAT IS NOT AN ASSUMPTION AT ALL. Exactly one thing: a meal that was rostered
// and punched and BEGAN after the end of the fifth hour. The schedule
// affirmatively records the violation - the meal is right there, at the wrong
// time - so there is nothing to assume and nothing to ask. It is in the
// projected figure and no answer can take it out.
//
// Everything else is an absence: the Rest Periods Report showing 1 of 2, or
// never mentioning somebody, or a day over six hours with no meal rostered. All
// of those are now PAID unless somebody tells us otherwise.

import { buildQuestions, answerProgress } from "./questions.js";

const PER_VIOLATION = 1;

// ---------------------------------------------------------------------------
// WHAT AN ANSWER SAYS ABOUT A PREMIUM.
//
// The answers are `TimesheetCorrection` rows keyed `q_<kind>`, and only some of
// the kinds speak to a premium at all - `restOutsideShift` and
// `restAtServiceEdge` move paid MINUTES and leave the premium alone, so they are
// deliberately absent from this table.
//
// AN ACCEPT IS THE EMPLOYEE GIVING A PREMIUM UP, and after the 2026-08-11 flip
// that is the only direction one moves. Every question is phrased so that "yes"
// says the break happened; the premium is on the sheet until they say so, and
// saying so is what takes it off. So accepted -> taken, declined -> owed, and a
// decline now simply agrees with what the sheet already says.
//
// This table used to be inline in the pay period page and covered three kinds.
// It missed `q_nothingDocumented`, which is the question 53 of 59 people are
// being asked - so an answer on the big one moved one figure and not the other,
// when the two are supposed to CONVERGE as people reply.
const PREMIUM_ANSWER_KINDS = {
  q_repair: ["rest"],
  q_restNoTimes: ["rest"],
  q_restIsMealLength: ["meal"],
  q_shortMealRest: ["rest"],
  // kept for answers written before the split on 2026-08-10; nothing produces
  // this kind any more
  q_nothingDocumented: ["meal", "rest"],
  // ONE PART EACH, which is the point of splitting it. The combined kind above
  // settled both premiums off a single answer, so a day short both could never
  // land on one hour.
  q_nothingDocumentedMeal: ["meal"],
  q_nothingDocumentedRest: ["rest"],
};

// "MM/DD/YY:meal" -> "taken" | "owed", for every answer on record.
export function answersByDate(corrections) {
  const out = {};
  for (const c of corrections || []) {
    if (!c || c.status === "open") continue;
    const kinds = PREMIUM_ANSWER_KINDS[c.kind];
    if (!kinds) continue;
    for (const k of kinds) out[`${c.date}:${k}`] = c.status === "declined" ? "owed" : "taken";
  }
  return out;
}

// the premiums an employee has told us they ARE owed. This is what `confirmed`
// below wants, and every screen that needs it builds it here rather than
// deriving its own - the pay period page, the stats page and the PDF route all
// have to agree about what somebody said.
export function confirmedFromAnswers(corrections) {
  const answers = answersByDate(corrections);
  return new Set(Object.keys(answers).filter((k) => answers[k] === "owed"));
}

// `confirmed` is a Set of "MM/DD/YY:meal" / "MM/DD/YY:rest" - the days where
// somebody answered "no, I did not take it". After the flip that answer AGREES
// with the sheet: the premium was already on it. What the set does now is mark
// the premium as SETTLED, so no assumption can come along and take it off.
//
// A premium somebody answered "yes" to never reaches here at all: the override
// clears the day's violation flag, and a day with no violation has no premium.
export function splitPremium(days, { confirmed } = {}) {
  const has = (date, kind) => !!confirmed && confirmed.has(`${date}:${kind}`);
  let settled = 0;
  let assumable = 0;
  const rows = [];

  for (const d of days || []) {
    const date = d.date;
    // ONE meal premium and ONE rest premium per day at most, per UPS v.
    // Superior Court (2011). This mirrors how `premiums` is summed in parse.js
    // rather than inventing a second way to count the same hours.
    const mealOwed = d.mealViolation === true || d.mealLate === true;
    const restOwed = d.restViolation === true;

    if (mealOwed) {
      // M1 and only M1 is beyond assuming: rostered, punched, started too late.
      // A confirmed "no" is the other way a premium stops being assumable.
      const isSettled = d.mealLate === true || has(date, "meal");
      if (isSettled) settled += PER_VIOLATION;
      else assumable += PER_VIOLATION;
      rows.push({
        date, kind: "meal", hours: PER_VIOLATION,
        // whether an assumption could still take this hour away
        settled: isSettled,
        why: d.mealLate
          ? "a meal was rostered and began after the fifth hour"
          : has(date, "meal")
            ? "the employee confirmed they did not get their meal"
            : "no meal is recorded, so it is paid unless they tell us they took it",
      });
    }

    if (restOwed) {
      const isSettled = has(date, "rest");
      if (isSettled) settled += PER_VIOLATION;
      else assumable += PER_VIOLATION;
      rows.push({
        date, kind: "rest", hours: PER_VIOLATION,
        settled: isSettled,
        why: isSettled
          ? "the employee confirmed they did not get their break"
          : "fewer rests are recorded than the hours require, so it is paid unless they tell us they took them",
      });
    }
  }

  return {
    // EVERY fault the reports show, taken literally. The default, and what
    // payroll pays.
    projected: settled + assumable,
    // what the policy assumptions would take off, if every one were confirmed.
    // Nothing here is applied on its own.
    assumptions: assumable,
    // what would be left if they all held. The floor, not the figure.
    ifAssumptionsHold: settled,
    rows,
  };
}

// ---------------------------------------------------------------------------
// THE DAY ROWS WITH THE POLICY ASSUMPTIONS APPLIED, which is what makes a
// second document possible without a second renderer.
//
// `renderCorrected` counts nothing itself - it draws the day rows it is handed
// and the premium table it is handed. So the assumed sheet is the SAME renderer
// over days whose assumable violations have been cleared. One document
// generator, three documents, and no chance of them drifting into different
// layouts or different arithmetic.
//
// THIS IS NO LONGER THE DEFAULT. Before 2026-08-11 this produced the figure
// payroll paid; now it produces the alternative reading, and the sheet that goes
// out is the untouched one. Renamed from `projectDays` for exactly that reason -
// "projected" is the other document now, and leaving the old name on this would
// have pointed every future reader at the wrong one.
//
// NONE OF THIS IS EVER STORED. These fields exist for the length of one render.
// Do NOT add them to `storedDay` or `REQUIRED_DAY_FIELDS`: a stored day is the
// raw finding, and which of the three documents you are looking at is not a
// property of the day.
//
// CLEARING THE VIOLATION IS NOT ENOUGH ON ITS OWN. 359 day rows on the live
// batch carry an assumable premium and nothing else worth printing, so simply
// dropping the flag would flip all 359 from a red finding to a green
// "compliant" - a clean bill of health for a break nobody verified. That is the
// opposite of what the model claims. `premiumNote` is what keeps the row
// speaking, and render.js prints it in grey: noted, not charged.
//
// @param confirmed  premiums the employee has SETTLED by telling us they missed
//                   them, which no assumption may take away
// @param answers    "MM/DD/YY:meal" -> "taken" | "owed", the full answer record
// @param pastDue    their deadline has passed, so silence has settled it
export function applyAssumptions(days, { confirmed, answers, pastDue } = {}) {
  const has = (date, kind) => !!confirmed && confirmed.has(`${date}:${kind}`);
  const said = (date, kind) => answers?.[`${date}:${kind}`] || null;
  // WHAT AN UNCONFIRMED ASSUMPTION IS CALLED, and the two names are not the same
  // claim. Before the deadline we are still asking. After it, Mánu 2026-08-09:
  // "if they don't sign off on it, then the form will be our assumption" - the
  // acknowledgment form they signed is the answer, and the sheet says what the
  // company would be treating as true rather than pretending a question is open.
  const state = pastDue ? "not-documented" : "needs-confirmation";

  return (days || []).map((d) => {
    const mealOwed = d.mealViolation === true || d.mealLate === true;
    const restOwed = d.restViolation === true;
    const mealAssumed = mealOwed && d.mealLate !== true && !has(d.date, "meal");
    const restAssumed = restOwed && !has(d.date, "rest");
    // a day they answered "yes, I took it" on has already had its violation
    // cleared by the override, so there is nothing left here to notice. Say so
    // anyway: on the corrected copy that sentence is the evidence.
    const mealTaken = said(d.date, "meal") === "taken" && !mealOwed;
    const restTaken = said(d.date, "rest") === "taken" && !restOwed;

    if (!mealAssumed && !restAssumed && !mealTaken && !restTaken) return d;

    return {
      ...d,
      mealViolation: mealAssumed ? false : d.mealViolation,
      restViolation: restAssumed ? false : d.restViolation,
      premiumNote: {
        meal: mealAssumed ? "assumed" : mealTaken ? "taken" : null,
        rest: restAssumed ? "assumed" : restTaken ? "taken" : null,
        state,
        // the figure the rest note prints, kept here because clearing
        // restViolation is what stops render.js reaching for it
        restTaken: d.restTaken ?? 0,
        restRequired: d.restRequired ?? 0,
      },
    };
  });
}

// the premium table for a set of day rows. parse.js builds this at upload from
// the same two flags; this rebuilds it for a render where the assumptions have
// moved them. Kept beside `applyAssumptions` so the table and the rows it
// summarises can only ever be counted the same way.
export function premiumsFromDays(days) {
  const mealDays = (days || []).filter((d) => d.mealViolation).map((d) => d.date);
  const restDays = (days || []).filter((d) => d.restViolation).map((d) => d.date);
  return {
    mealDays,
    restDays,
    mealHours: mealDays.length * PER_VIOLATION,
    restHours: restDays.length * PER_VIOLATION,
    totalHours: (mealDays.length + restDays.length) * PER_VIOLATION,
  };
}

// WHERE ONE PERSON'S PREMIUM ACTUALLY STANDS, from their stored days and their
// answers. Every employee-facing surface reads this and nothing else: the
// email, the page they sign on, and the PDF embedded in it.
//
// Mánu 2026-08-09 late: those three were telling three different stories. The
// email said "break premium hours owed 17 hrs" and "you are owed an extra hour
// of pay for each one"; the page underneath it said "we have assumed you took
// them and have not added any penalty pay"; the PDF charged all 17. Both of the
// first two sat above a signature. One function now, so they cannot disagree.
export function premiumStanding(days, corrections) {
  const answers = answersByDate(corrections);
  const confirmed = confirmedFromAnswers(corrections);
  const split = splitPremium(days, { confirmed });
  return {
    // WHAT IS ACTUALLY BEING CHARGED, and after 2026-08-11 that is every fault
    // the reports show. It falls as people confirm they took their breaks; it
    // cannot rise.
    charged: split.projected,
    // what the policy assumptions would take off if every one were confirmed.
    // Not applied, and not deducted from `charged`.
    assumptions: split.assumptions,
    // the floor: what would be left if they all held
    ifAssumptionsHold: split.ifAssumptionsHold,
    confirmed,
    answers,
  };
}

// WHAT PAYROLL PAYS, AND WHETHER IT IS FINISHED CHANGING.
//
// Mánu 2026-08-09 late: "have the projected report be the one and it be updated
// as people confirm with a notice when everyone has confirmed new choices."
//
// So the payroll documents pay the CHARGED figure, and they carry a notice
// saying how many people have still to answer. THE DIRECTION OF THAT NOTICE
// REVERSED ON 2026-08-11 along with everything else: until every answer is in
// the figure can only come DOWN, never up. A payout sheet that looks final while
// 53 people have an open question is still the thing to guard against, but it is
// now over-stating payroll rather than under-paying an employee.
export function batchPremiumStanding(sheets, { restRows } = {}) {
  let charged = 0;
  let assumptions = 0;
  let ifAssumptionsHold = 0;
  let waiting = 0;
  const byId = {};

  for (const s of sheets || []) {
    const st = premiumStanding(s.data?.days || [], s.corrections);
    byId[s.id] = st;
    charged += st.charged;
    assumptions += st.assumptions;
    ifAssumptionsHold += st.ifAssumptionsHold;

    // the same classifier the employee's page renders from, so payroll's idea
    // of "still waiting" cannot drift from what the person was actually asked
    const progress = answerProgress(
      buildQuestions(s.data, { restRows: restRows || [], sourceName: s.sourceName }),
      s.corrections,
    );
    if (!progress.settled) waiting++;
  }

  return {
    charged, assumptions, ifAssumptionsHold, byId,
    people: (sheets || []).length,
    waiting,
    // everybody has answered every question put to them, so nothing else is
    // going to move this figure
    settled: waiting === 0,
  };
}

// the same two figures across a whole batch
export function splitPremiumForSheets(sheets, { confirmedBySheet } = {}) {
  let projected = 0;
  let assumptions = 0;
  let ifAssumptionsHold = 0;
  for (const s of sheets || []) {
    const r = splitPremium(s.data?.days || [], {
      confirmed: confirmedBySheet?.[s.id],
    });
    projected += r.projected;
    assumptions += r.assumptions;
    ifAssumptionsHold += r.ifAssumptionsHold;
  }
  return { projected, assumptions, ifAssumptionsHold };
}
