// WHAT A RE-UPLOAD WOULD CHANGE, worked out without changing anything.
//
// Mánu 2026-08-12: people are told to fix their records in QuickSolve, the
// period is exported again, and the sheet should reconcile itself rather than
// starting over. Before any of that can be trusted, one question has to be
// answerable: what would this actually do? Today it is unanswerable, which is
// the whole reason this file exists.
//
// PURE. It takes two sets of days and a list of answers and returns a
// description. It reads no database, fetches nothing, and writes nothing, so it
// can be pointed at a live batch without any risk to it.
//
// WHERE THE "FRESH" SIDE COMES FROM IS THE CALLER'S PROBLEM, deliberately. Today
// the only fresh side available is the same export re-analysed by today's engine
// - which is a real and useful diff, because August is still carrying answers
// from the rules that existed when it was uploaded. When a genuinely new export
// can be parsed without being stored, it drops into the same function.

const r2 = (n) => Math.round((n || 0) * 100) / 100;
const near = (a, b) => Math.abs((a || 0) - (b || 0)) < 0.005;

// The fields worth reporting on, and why each one is here. Anything not on this
// list is not compared, so adding a field to the engine does not silently start
// or stop being watched - the same discipline as REQUIRED_DAY_FIELDS.
const WATCHED = [
  // THE ONE THAT MUST NOT MOVE. Paid hours come from the punches and QSP's
  // printed floor. A re-upload of a CHANGED export can move them legitimately;
  // a re-analysis of the same export cannot, and the caller is told which it is
  // looking at so it can judge.
  { key: "paidHours", label: "paid hours", numeric: true, grave: true },
  { key: "restRequired", label: "rest periods owed", numeric: true },
  { key: "mealRequired", label: "meal owed" },
  { key: "restTaken", label: "rest periods credited", numeric: true },
  { key: "restViolation", label: "rest premium", charges: true },
  { key: "mealViolation", label: "meal premium", charges: true },
];

// one day, before and after
export function diffDay(before, after) {
  const changes = [];
  for (const f of WATCHED) {
    const a = before?.[f.key];
    const b = after?.[f.key];
    const same = f.numeric ? near(a, b) : (a ?? null) === (b ?? null);
    if (same) continue;
    changes.push({
      field: f.key,
      label: f.label,
      was: f.numeric ? r2(a) : a ?? null,
      now: f.numeric ? r2(b) : b ?? null,
      grave: !!f.grave,
      charges: !!f.charges,
    });
  }
  // premium is one hour per day per kind, so the delta is countable rather than
  // inferred from the hours column
  const premiumBefore = (before?.restViolation ? 1 : 0) + (before?.mealViolation ? 1 : 0);
  const premiumAfter = (after?.restViolation ? 1 : 0) + (after?.mealViolation ? 1 : 0);
  return { date: before?.date || after?.date, changes, premiumBefore, premiumAfter };
}

// one person's whole period. `after` may be missing days the stored side has, or
// carry days it does not: a fixed export can add a day somebody was never paid
// for, and that is exactly the kind of thing this has to surface rather than
// quietly skip.
export function diffSheet({ storedDays = [], freshDays = [] } = {}) {
  const byDate = new Map(freshDays.map((d) => [d.date, d]));
  const seen = new Set();
  const days = [];
  let premiumBefore = 0, premiumAfter = 0, grave = 0;

  for (const before of storedDays) {
    seen.add(before.date);
    const after = byDate.get(before.date);
    if (!after) {
      // A DAY THAT VANISHED. Never silent: it is either a QSP correction that
      // removed a day somebody was paid for, or the wrong file.
      days.push({ date: before.date, gone: true, changes: [], premiumBefore: (before.restViolation ? 1 : 0) + (before.mealViolation ? 1 : 0), premiumAfter: 0 });
      premiumBefore += (before.restViolation ? 1 : 0) + (before.mealViolation ? 1 : 0);
      continue;
    }
    const d = diffDay(before, after);
    premiumBefore += d.premiumBefore;
    premiumAfter += d.premiumAfter;
    grave += d.changes.filter((c) => c.grave).length;
    if (d.changes.length) days.push(d);
  }
  for (const after of freshDays) {
    if (seen.has(after.date)) continue;
    const p = (after.restViolation ? 1 : 0) + (after.mealViolation ? 1 : 0);
    premiumAfter += p;
    days.push({ date: after.date, added: true, changes: [], premiumBefore: 0, premiumAfter: p });
  }

  days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    days,
    premiumBefore,
    premiumAfter,
    premiumDelta: premiumAfter - premiumBefore,
    graveChanges: grave,
    changedDays: days.length,
  };
}

// ---------------------------------------------------------------- the answers

// WHAT BECOMES OF SOMETHING THEY ALREADY TOLD US.
//
// An answer is stored as a TimesheetCorrection with `kind` "q_<questionKind>"
// and a date. A question's identity in code is `${kind}:${date}:${at}`, so the
// stored key is WEAKER than the question's - it drops `at`. Measured on both
// live batches, no person has two questions of one kind on one date, so the
// weaker key is currently sufficient. It is not sufficient BY CONSTRUCTION, so
// an ambiguous match is reported rather than guessed at.
//
// Three outcomes, and only two of them are decidable from the data we hold:
//
//   still-asked   the fresh side still generates this question, so the answer
//                 still applies and should be carried
//   settled       the question is gone. Either they fixed it in QSP or the rule
//                 stopped asking. The answer is kept as the record of why a
//                 figure moved between two versions of one document, and they
//                 are not asked again.
//   ambiguous     two questions share the stored key, so which one they answered
//                 cannot be recovered. Refused rather than guessed.
//
// A fourth - CONTRADICTED, where the fixed export disagrees with what they said
// - is deliberately NOT inferred here. Telling it apart from "settled" needs the
// fresh export to genuinely differ from the stored one, and no QSP fix has been
// re-exported yet, so any rule written for it now would be untested against the
// case it exists for. It is named in REUPLOAD-SCOPE.md as an open decision.
export function classifyAnswers(answers, freshQuestions) {
  const counts = new Map();
  for (const q of freshQuestions || []) {
    const k = `${q.kind}|${q.date || ""}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const out = [];
  for (const a of answers || []) {
    const kind = String(a.kind || "").replace(/^q_/, "");
    const key = `${kind}|${a.date || ""}`;
    const n = counts.get(key) || 0;
    out.push({
      id: a.id,
      kind,
      date: a.date || null,
      status: a.status,
      choice: a.choice ?? null,
      outcome: n === 0 ? "settled" : n === 1 ? "still-asked" : "ambiguous",
    });
  }
  return {
    answers: out,
    stillAsked: out.filter((x) => x.outcome === "still-asked").length,
    settled: out.filter((x) => x.outcome === "settled").length,
    ambiguous: out.filter((x) => x.outcome === "ambiguous").length,
  };
}

// ------------------------------------------------------------- one whole batch

// `people` is [{ who, storedDays, freshDays, answers, freshQuestions }].
// Matching people is the CALLER's job: it needs the database to do it properly
// (userId first, the export's spelling as a fallback) and this file touches no
// database. What comes back is the report, in the order a reader wants it -
// the graves first, then whoever moves the most.
export function diffBatch(people = []) {
  const rows = [];
  let premiumBefore = 0, premiumAfter = 0, grave = 0, ambiguous = 0;
  for (const p of people) {
    const d = diffSheet({ storedDays: p.storedDays, freshDays: p.freshDays });
    const a = classifyAnswers(p.answers, p.freshQuestions);
    premiumBefore += d.premiumBefore;
    premiumAfter += d.premiumAfter;
    grave += d.graveChanges;
    ambiguous += a.ambiguous;
    if (d.changedDays || p.answers?.length) rows.push({ who: p.who, ...d, answers: a });
  }
  rows.sort(
    (x, y) =>
      y.graveChanges - x.graveChanges ||
      Math.abs(y.premiumDelta) - Math.abs(x.premiumDelta) ||
      String(x.who).localeCompare(String(y.who)),
  );
  return {
    rows,
    people: rows.length,
    premiumBefore,
    premiumAfter,
    premiumDelta: premiumAfter - premiumBefore,
    graveChanges: grave,
    ambiguousAnswers: ambiguous,
  };
}
