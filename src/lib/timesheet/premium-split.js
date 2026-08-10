// The two premium figures, and why there are two.
//
// Mánu 2026-08-09: staff map out their own schedules. Company policy requires
// them to enter the ten minute rest periods and the lunch the DLSE bands
// entitle them to, and they signed an acknowledgment form saying they would.
// So a break missing from the record is not the company failing to provide one -
// it is a gap in a record the EMPLOYEE was responsible for keeping. We assume it
// was taken, and we ask them.
//
// That makes one premium figure impossible to state honestly, so there are two:
//
//   PROJECTED             what we think is owed after those assumptions
//   IGNORING ASSUMPTIONS  what is owed if every assumption is wrong
//
// The gap between them is the size of what is still unanswered, and it shrinks
// as people reply. Showing only the projected figure would hide the exposure;
// showing only the other would charge for breaks people took.
//
// WHAT COUNTS AS DOCUMENTED. Exactly one thing: a meal that was rostered and
// punched and BEGAN after the end of the fifth hour. The schedule affirmatively
// records the violation - the meal is right there, at the wrong time. Nobody had
// to fail to write something down for us to know.
//
// Everything else is an absence. The Rest Periods Report showing 1 of 2, or
// never mentioning somebody, or a day over six hours with no meal rostered:
// in every case what is missing is an entry the employee was supposed to make.
// R1 and R2 were split across "witnessed" and "settled by a ruling" under the
// old model and there is no principled line between them under this one - a day
// showing 1 of 2 is the same species as a person showing 0 of any.
//
// A premium the employee has CONFIRMED they are owed stops being an assumption
// and joins the projected figure, which is the whole point of asking.

import { buildQuestions } from "./questions.js";

const PER_VIOLATION = 1;

// ---------------------------------------------------------------------------
// WHAT AN ANSWER SAYS ABOUT A PREMIUM.
//
// The answers are `TimesheetCorrection` rows keyed `q_<kind>`, and only some of
// the seven kinds speak to a premium at all - `restOutsideShift` and
// `restSnappedToShift` move paid MINUTES and leave the premium alone, so they
// are deliberately absent from this table.
//
// A DECLINE IS THE EMPLOYEE SAYING THEY ARE OWED IT. Every one of these is
// phrased so that "yes" agrees with the cheap reading the engine already took;
// saying no is what puts a premium back. So declined -> owed, accepted -> taken.
//
// This table used to be inline in the pay period page and covered three kinds.
// It missed `q_nothingDocumented`, which is the question 53 of 59 people are
// being asked - so a decline on the big one would have put the premium back on
// the stored day and into the ignoring-assumptions figure while the projected
// figure sat still. The two are supposed to CONVERGE as people answer; that
// omission would have made the gap grow instead.
const PREMIUM_ANSWER_KINDS = {
  q_repair: ["rest"],
  q_restNoTimes: ["rest"],
  q_restIsMealLength: ["meal"],
  q_shortMealRest: ["rest"],
  q_nothingDocumented: ["meal", "rest"],
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
// somebody answered "no, I did not take it" and is owed after all.
export function splitPremium(days, { confirmed } = {}) {
  const has = (date, kind) => !!confirmed && confirmed.has(`${date}:${kind}`);
  let documented = 0;
  let assumed = 0;
  const rows = [];

  for (const d of days || []) {
    const date = d.date;
    // ONE meal premium and ONE rest premium per day at most, per UPS v.
    // Superior Court (2011). This mirrors how `premiums` is summed in parse.js
    // rather than inventing a second way to count the same hours.
    const mealOwed = d.mealViolation === true || d.mealLate === true;
    const restOwed = d.restViolation === true;

    if (mealOwed) {
      // M1 and only M1: rostered, punched, started too late.
      const isDocumented = d.mealLate === true || has(date, "meal");
      if (isDocumented) documented += PER_VIOLATION;
      else assumed += PER_VIOLATION;
      rows.push({
        date, kind: "meal", hours: PER_VIOLATION,
        documented: isDocumented,
        why: d.mealLate
          ? "a meal was rostered and began after the fifth hour"
          : has(date, "meal")
            ? "the employee confirmed they did not get their meal"
            : "no meal is recorded, and recording it was theirs to do",
      });
    }

    if (restOwed) {
      const isDocumented = has(date, "rest");
      if (isDocumented) documented += PER_VIOLATION;
      else assumed += PER_VIOLATION;
      rows.push({
        date, kind: "rest", hours: PER_VIOLATION,
        documented: isDocumented,
        why: isDocumented
          ? "the employee confirmed they did not get their break"
          : "fewer rests are recorded than the hours require, and recording them was theirs to do",
      });
    }
  }

  return {
    // what we think is owed, after the assumptions
    projected: documented,
    // what is owed if every single assumption turns out to be wrong
    ignoringAssumptions: documented + assumed,
    // the size of what is still unanswered
    assumed,
    rows,
  };
}

// ---------------------------------------------------------------------------
// THE PROJECTED DAY ROWS, which is what makes a second document possible
// without a second renderer.
//
// `renderCorrected` counts nothing itself - it draws the day rows it is handed
// and the premium table it is handed. So the projected sheet is the SAME
// renderer over days whose assumed violations have been cleared. One document
// generator, three documents, and no chance of the two drifting into different
// layouts or different arithmetic.
//
// NONE OF THIS IS EVER STORED. These fields exist for the length of one render.
// Do NOT add them to `storedDay` or `REQUIRED_DAY_FIELDS`: a stored day is the
// raw finding, and which of the three documents you are looking at is not a
// property of the day.
//
// CLEARING THE VIOLATION IS NOT ENOUGH ON ITS OWN. 359 day rows on the live
// batch carry an assumed premium and nothing else worth printing, so simply
// dropping the flag would flip all 359 from a red finding to a green
// "compliant" - a clean bill of health for a break nobody verified. That is the
// opposite of what the model claims. `premiumNote` is what keeps the row
// speaking, and render.js prints it in grey: noted, not charged.
//
// @param confirmed  premiums the employee says they ARE owed (see above)
// @param answers    "MM/DD/YY:meal" -> "taken" | "owed", the full answer record
// @param pastDue    their deadline has passed, so silence has settled it
export function projectDays(days, { confirmed, answers, pastDue } = {}) {
  const has = (date, kind) => !!confirmed && confirmed.has(`${date}:${kind}`);
  const said = (date, kind) => answers?.[`${date}:${kind}`] || null;
  // WHAT AN UNANSWERED ASSUMPTION IS CALLED, and the two names are not the same
  // claim. Before the deadline we are still asking. After it, Mánu 2026-08-09:
  // "if they don't sign off on it, then the form will be our assumption" - the
  // acknowledgment form they signed is the answer, and the sheet says what the
  // company is now treating as true rather than pretending a question is open.
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
// the same two flags; this rebuilds it for a projected render, where the flags
// have moved. Kept beside `projectDays` so the table and the rows it summarises
// can only ever be counted the same way.
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
    // what is actually being charged: penalties a document records on its own,
    // plus every one the employee has told us they are owed
    charged: split.projected,
    // assumed taken, charged nothing, still open to them
    assumed: split.assumed,
    // what it would be if every assumption turned out to be wrong
    ignoring: split.ignoringAssumptions,
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
// saying how many people have still to answer - because until they all have,
// that figure can only go up. A payout sheet that looks final while 53 people
// have an open question is the one way this model can actually hurt somebody.
export function batchPremiumStanding(sheets, { restRows } = {}) {
  let charged = 0;
  let assumed = 0;
  let ignoring = 0;
  let waiting = 0;
  const byId = {};

  for (const s of sheets || []) {
    const st = premiumStanding(s.data?.days || [], s.corrections);
    byId[s.id] = st;
    charged += st.charged;
    assumed += st.assumed;
    ignoring += st.ignoring;

    // the same classifier the employee's page renders from, so payroll's idea
    // of "still waiting" cannot drift from what the person was actually asked
    const asked = buildQuestions(s.data, {
      restRows: restRows || [],
      sourceName: s.sourceName,
    }).length;
    const answered = new Set(
      (s.corrections || [])
        .filter((c) => String(c.kind || "").startsWith("q_") && c.status !== "open")
        .map((c) => c.kind),
    ).size;
    if (answered < asked) waiting++;
  }

  return {
    charged, assumed, ignoring, byId,
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
  let ignoringAssumptions = 0;
  let assumed = 0;
  for (const s of sheets || []) {
    const r = splitPremium(s.data?.days || [], {
      confirmed: confirmedBySheet?.[s.id],
    });
    projected += r.projected;
    ignoringAssumptions += r.ignoringAssumptions;
    assumed += r.assumed;
  }
  return { projected, ignoringAssumptions, assumed };
}
