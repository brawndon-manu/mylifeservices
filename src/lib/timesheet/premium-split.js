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

const PER_VIOLATION = 1;

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
