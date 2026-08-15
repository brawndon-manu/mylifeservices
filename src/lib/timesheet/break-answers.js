// WHAT SOMEBODY SAID ABOUT A BREAK THEY DID NOT TAKE.
//
// Two answers, and the whole design turns on them behaving oppositely when the
// next export lands:
//
//   not-taken   they confirm they did not take it. There is NOTHING TO PUNCH,
//               so the finding will still be on that day on every future
//               upload. It must read as settled, not as them failing to act,
//               or it nags daily about something already answered.
//   took-it     they say they took it and QSP does not show it. That IS a fix
//               to make, and the next export either carries it or it does not.
//
// The premium is unaffected either way. A reason is a record, not a figure.
export const BREAK_ANSWERS = {
  "not-taken": {
    key: "not-taken",
    label: "Confirm not taken",
    // what the card says once it is set
    settled: "Confirmed not taken",
    // green: nothing is outstanding, whatever the finding still says
    chip: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300",
    // and it needs a WHY, which is the half QSP has no field for
    asksReason: true,
    // the next export will still show this finding, and that is correct
    expectsChange: false,
  },
  "took-it": {
    key: "took-it",
    label: "They took it, needs punching",
    settled: "They took it, needs punching",
    chip: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-300",
    asksReason: false,
    // the next export is the evidence. We cannot change their schedule; it is
    // theirs to do and ours to enforce.
    expectsChange: true,
  },
};

export const BREAK_ANSWER_KEYS = Object.keys(BREAK_ANSWERS);

export function breakAnswer(key) {
  return BREAK_ANSWERS[key] || null;
}

export function isBreakAnswer(key) {
  return Object.prototype.hasOwnProperty.call(BREAK_ANSWERS, key);
}

// HOW WE HEARD IT. Not the same list as the contact marks: a reason can also
// come from the employee's own page, which is nobody contacting anybody.
export const HEARD_VIA = [
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "in-person", label: "In person" },
];

export const HEARD_VIA_KEYS = HEARD_VIA.map((v) => v.key);
export const isHeardVia = (k) => HEARD_VIA_KEYS.includes(k);

// SOME TAKEN IS STILL SOME MISSED. A day short two rests where they took one is
// a day with one rest not taken, and that one still needs a reason like any
// other - so the obligation is about what is left, not about which button.
export function stillMissing(a) {
  if (!a) return 0;
  const n = a.missingCount || 1;
  const took = a.takenCount ?? (a.answer === "took-it" ? n : 0);
  return Math.max(0, n - took);
}

// A REASON WE WROTE DOWN IS NOT YET A REASON ON RECORD.
//
// We took it off a phone call, so they get to check we wrote it right before it
// goes on their timesheet. Until they do, or until somebody types one in for
// them, the obligation sits with the employee and their sheet does not generate.
export function needsEmployeeReason(a) {
  if (!a) return false;
  // NOT "did they press the not-taken button". A day short two rests where they
  // took one still has a rest nobody took, and that one is owed a reason exactly
  // like a day where they took neither.
  if (stillMissing(a) < 1) return false;
  return !a.reason;
}

// what the employee is asked, if anything: nothing, write one, or check ours.
export function employeeAsk(a) {
  if (!a || stillMissing(a) < 1) return null;
  if (!a.reason) return "write";
  if (!a.confirmedAt) return "confirm";
  return null;
}

export const answersByFinding = (rows = []) =>
  new Map(rows.map((r) => [`${r.personKey}|${r.findingKey}`, r]));

// THE KEY BOTH ENDS OF ONE CONVERSATION HAVE TO AGREE ON.
//
// A break answer can be written from two places: a reviewer pressing "Confirm
// not taken" after a call, and the employee saying they missed it on their own
// page. They are the same fact about the same day, so they have to be the same
// ROW - otherwise a call and a reply become two records that can disagree, and
// the sheet prints both.
//
// It was built inline on the admin screen as `break-${slot}-${date}` and
// nowhere else, because nowhere else could write one yet. Lifted here the
// moment the employee's side needed to produce the identical string.
//
// THREE KINDS, THREE KEYS. A late meal and a missing meal are different
// questions about the same day - one asks why it was not taken, the other why it
// started when it did - so they must not collide on one row. `meal-late` maps to
// `meallate` rather than being punctuated, which is the spelling already in the
// database on the admin path and is not worth a migration to prettify.
const SLOT = { rest: "rest", meal: "meal", "meal-late": "meallate" };

export function breakFindingKey(kind, date) {
  const slot = SLOT[kind];
  if (!slot || !date) return null;
  return `break-${slot}-${date}`;
}

// and back again, so a stored row can say which violation it belongs to without
// the caller parsing the string itself
export function breakFindingKind(findingKey) {
  const m = /^break-(rest|meallate|meal)-(.+)$/.exec(String(findingKey || ""));
  if (!m) return null;
  const kind = m[1] === "meallate" ? "meal-late" : m[1];
  return { kind, date: m[2] };
}

// THE REASONS, AS LINES FOR THE BOTTOM OF THE PRINTED SHEET.
//
// They go in the block QSP already calls "Comments Details:", after QSP's own
// numbered notes and continuing their numbering, because to a reader it is one
// list of things somebody wrote about this period.
//
// WHAT QSP PUTS THERE IS NOT THIS. Its notes are about clock-ins - "forgot to
// punch in", "traffic", "accidental late clock in" - time-ranged against a
// shift. Nothing it collects is ever about a missed break, which is why these
// have to be gathered and why they are labelled differently.
//
// BOTH SIDES PRINT when they corrected us. Ours stays and theirs follows it, so
// the document shows that the record moved rather than quietly showing only the
// version that survived.
//
// PROVENANCE ON EVERY LINE. A reason taken off a phone call and a reason the
// employee typed are different kinds of evidence, and a sheet somebody signs
// should not blur them.
export function formatBreakComments(answers = [], startAt = 0) {
  const out = [];
  let n = startAt;
  const rows = [...answers]
    .filter((a) => a && a.answer === "not-taken" && (a.reason || a.confirmedText))
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  for (const a of rows) {
    const kind = a.kind === "rest" ? "rest period" : "meal period";
    const when = a.date ? `${a.date} ` : "";
    // ours, when we took one
    if (a.reason) {
      const said = a.confirmedText && a.confirmedText === a.reason
        ? "confirmed by employee"
        : a.confirmedText
          ? "recorded from a call"
          : "recorded from a call, not yet confirmed by the employee";
      out.push(`${++n}) ${when}${kind} not taken: ${a.reason}  [${said}]`);
    }
    // theirs, when it differs - either a correction to ours, or the only one
    if (a.confirmedText && a.confirmedText !== a.reason) {
      const label = a.reason ? "employee correction" : `${kind} not taken`;
      out.push(`${++n}) ${when}${label}: ${a.confirmedText}  [in the employee's own words]`);
    }
  }
  return out;
}

// EVERY ANSWER THE DAY ACTUALLY ALLOWS.
//
// A meal is one thing: taken or not, two buttons. A rest violation is "0 of 2
// recorded", and two buttons cannot say what happened - they may have taken
// neither, or one of the two. One control per day could not say it either, which
// is why there is now one per violation.
//
// So the options are built from the shortfall rather than written out: 2 short
// gives none / one / both, 1 short gives none / it, and 3 short would give none
// / one / two / all three without anybody adding a case.
//
// `takenCount` is what separates them, and it is the number that ends up on the
// timesheet - "took 1 of the 2 they were owed" is a different sentence from
// "took neither".
export function answerOptionsFor({ kind, missing = 1 }) {
  const n = Math.max(1, Number(missing) || 1);
  const thing = kind === "rest" ? "rest period" : "meal break";

  // A LATE MEAL WAS TAKEN. Asking whether they took it is the wrong question -
  // the record says they did, after the fifth hour. What is actually in doubt is
  // whether the punched time is right, so those are the two answers.
  if (kind === "meal-late") {
    return [
      {
        key: "not-taken:0",
        answer: "not-taken",
        takenCount: 0,
        label: "Confirm it really was that late",
        tone: "green",
        asksReason: true,
      },
      {
        key: "took-it:1",
        answer: "took-it",
        takenCount: 1,
        label: "The punched time is wrong, needs correcting",
        tone: "sky",
        asksReason: false,
      },
    ];
  }

  const none = {
    key: "not-taken:0",
    answer: "not-taken",
    takenCount: 0,
    label: n === 1 ? "Confirm not taken" : `Confirm none of the ${n} taken`,
    tone: "green",
    asksReason: true,
  };
  // one option per number they could actually have taken
  const took = [];
  for (let i = 1; i <= n; i += 1) {
    took.push({
      key: `took-it:${i}`,
      answer: "took-it",
      takenCount: i,
      label: n === 1
        ? `They took it, needs punching`
        : i === n
          ? `They took all ${n}, needs punching`
          : `They took ${i} of ${n}, needs punching`,
      tone: "sky",
      // taking SOME of them still leaves the rest untaken, and that half needs a
      // why like any other
      asksReason: i < n,
      thing,
    });
  }
  return [none, ...took];
}

// what the card says once it is answered, with the count in it
export function answerSummary(a) {
  if (!a) return null;
  const n = a.missingCount || 1;
  const took = a.takenCount ?? (a.answer === "took-it" ? n : 0);
  const thing = a.kind === "rest" ? "rest period"
    : a.kind === "meal-late" ? "meal break, late"
      : "meal break";
  if (a.kind === "meal-late") {
    return took ? "The punched time is wrong, needs correcting" : "Confirmed it really was that late";
  }
  if (a.answer === "not-taken" || took === 0) {
    return n === 1 ? `Confirmed ${thing} not taken` : `Confirmed none of the ${n} taken`;
  }
  if (took >= n) return n === 1 ? "They took it, needs punching" : `They took all ${n}, needs punching`;
  return `They took ${took} of ${n}, needs punching`;
}


// WHAT THE EMPLOYEE IS ACTUALLY ASKED, which is not one sentence with a noun
// swapped into it.
//
// It was exactly that - `kind === "rest" ? "rest break" : "meal break"` - and it
// got three of the five cases wrong. It told somebody who took one of their two
// rests that they took neither, and it told somebody whose lunch merely started
// late that they never had one. The counts were already on the row; only the
// sentence had not learned about them.
//
// `told` is the statement for somebody writing their own reason. `toldUs` is the
// same fact framed as OUR record of what they said, which is what a quote-back
// has to be - they are checking our transcription, not being informed.
const WORDS = ["", "one", "two", "three", "four", "five", "six"];
const word = (n) => WORDS[n] || String(n);

// "5 hours 30 minutes", because "330 minutes in" is a number somebody has to do
// arithmetic on to feel
function saidLate(min) {
  const n = Number(min);
  if (!n || n < 0) return null;
  const h = Math.floor(n / 60), m = n % 60;
  if (!h) return `${m} minutes`;
  return m ? `${h} hour${h === 1 ? "" : "s"} ${m} minutes` : `${h} hour${h === 1 ? "" : "s"}`;
}

export function employeeQuestion(a, { lateMinutes = null } = {}) {
  const missing = a?.missingCount || 1;
  const took = a?.takenCount ?? 0;
  const left = Math.max(0, missing - took);

  // A LATE MEAL WAS TAKEN. Telling them they did not take it is the one that
  // would put a wrong sentence on a document they sign.
  if (a?.kind === "meal-late") {
    const late = saidLate(lateMinutes);
    const when = late ? `, ${late} into the day` : "";
    return {
      told: `Your meal break that day started later than it should have${when}.`,
      toldUs: `You told us why your meal break started late that day${when ? ` - it began ${late} in` : ""}.`,
      ask: "Can you tell us what held it up?",
      placeholder: "For example: I was mid-appointment with the client and could not break away.",
    };
  }

  if (a?.kind === "rest") {
    if (took > 0) {
      return {
        told: `You took ${word(took)} of your ${word(missing)} rest breaks that day, and `
          + `${took === 1 ? "it needs" : "they need"} logging in QuickSolve.`,
        toldUs: `You took ${word(took)} of your ${word(missing)} rest breaks that day, and told us `
          + `why you could not take the ${left === 1 ? "other one" : `other ${word(left)}`}.`,
        ask: left === 1
          ? "Why were you not able to take the other one?"
          : `Why were you not able to take the other ${word(left)}?`,
        placeholder: "In your own words.",
      };
    }
    const none = missing === 1
      ? "You did not take your rest break that day."
      : missing === 2
        ? "You did not take either of your two rest breaks that day."
        : `You did not take any of your ${word(missing)} rest breaks that day.`;
    return {
      told: none,
      toldUs: none.replace(/^You /, "You told us you "),
      ask: "Can you tell us why?",
      // THE EXAMPLE IS THE COMMONEST REAL REASON, not a generic one. Mánu
      // 2026-08-14: appointments that left no room for it. Somebody reading an
      // example that matches their own day writes a sentence; one that does not
      // makes them invent a form of words.
      placeholder: "For example: I had appointments with clients that did not make room for the break.",
    };
  }

  return {
    told: "You did not take your meal break that day.",
    toldUs: "You told us you did not take your meal break that day.",
    ask: "Can you tell us why?",
    placeholder: "For example: the client would not settle and I could not leave them.",
  };
}
