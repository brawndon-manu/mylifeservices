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

// A REASON WE WROTE DOWN IS NOT YET A REASON ON RECORD.
//
// We took it off a phone call, so they get to check we wrote it right before it
// goes on their timesheet. Until they do, or until somebody types one in for
// them, the obligation sits with the employee and their sheet does not generate.
export function needsEmployeeReason(a) {
  if (!a) return false;
  if (a.answer !== "not-taken") return false;
  return !a.reason;
}

// what the employee is asked, if anything: nothing, write one, or check ours.
export function employeeAsk(a) {
  if (!a || a.answer !== "not-taken") return null;
  if (!a.reason) return "write";
  if (!a.confirmedAt) return "confirm";
  return null;
}

export const answersByFinding = (rows = []) =>
  new Map(rows.map((r) => [`${r.personKey}|${r.findingKey}`, r]));

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
