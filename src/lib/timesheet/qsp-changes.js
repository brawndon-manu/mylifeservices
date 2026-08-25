// THE CHANGES SOMEBODY STILL NEEDS TO MAKE IN QUICKSOLVE, from the answers
// they gave. One derivation, because three surfaces need the same list: the
// email that carries their signed copy back, the corrections email that goes
// to the office (timesheet-review-email.js), and later the screen that checks
// whether the fixes actually landed (the re-upload is what answers that - see
// reupload-diff.js).
//
// EVERYTHING HERE COMES OFF THE CORRECTION ROWS. They are the durable record
// of what the person said: the stated times survive every rebuild on the row
// (statedBreaks), the reversed entries leave an acknowledgment row, and a
// report management accepted is a row with a status. Deriving from the
// overrides instead would tie this list to a blob that is rebuilt from the
// rows anyway, one step removed from the source.
//
// WHAT MAKES THE LIST, AND WHAT STAYS OFF IT. A line here is an EDIT to the
// QuickSolve record - a break to log, a time to correct, a day to add or
// remove. An answer that agrees with the record ("I missed it", "the entry is
// a mistake") changes nothing in QuickSolve and gets no line. And nothing
// here speaks about pay - these are record fixes, and this list reaches
// employees.
//
// EACH EDIT IS A FACT AND AN ACTION, SPLIT ON PURPOSE. Mánu 2026-08-25: the
// office makes the QuickSolve edits now, not the employee. So the employee's
// email states the FACT ("The lunch recorded 12p to 12:30p actually happened
// 1p to 1:30p.") and the office email carries the fact with its ACTION
// ("Change the entry to match."). Both sentences are worded without "you",
// because the same words reach both inboxes.
//
// Imports only corrections.js (for the receipt sentences), which node --test
// reaches directly - so this stays testable the same way as
// timesheet-subjects.js.
import { employeeResolution } from "./corrections.js";

// minutes past midnight -> "12:10p", the same short form the sheet prints
function shortClock(min) {
  const h24 = Math.floor(min / 60);
  const mm = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h24 < 12 ? "a" : "p"}`;
}

const kindWord = (kindOf) => (kindOf === "meal" ? "lunch" : "rest break");

// every edit ONE row implies, as [{ date, fact, action }]. The rules live here
// once; both shapes below are built from them.
function changesForRow(c) {
  const out = [];
  const kind = String(c.kind || "");

  // THE TIMES THEY GAVE US. A stated break with `replaces` supersedes a
  // recorded row - the entry exists and holds the wrong times. Without it,
  // nothing is recorded at all and the break needs logging from scratch.
  for (const b of Array.isArray(c.statedBreaks) ? c.statedBreaks : []) {
    if (!b?.from || !b?.to) continue;
    const onDate = b.date || c.date;
    if (b.replaces?.from && b.replaces?.to) {
      out.push({ date: onDate,
        fact: `The ${kindWord(b.kindOf)} recorded ${b.replaces.from} to ${b.replaces.to} actually `
          + `happened ${b.from} to ${b.to}.`,
        action: "Change the entry to match." });
    } else {
      out.push({ date: onDate,
        fact: `The ${kindWord(b.kindOf)} taken from ${b.from} to ${b.to} has nothing recorded for it.`,
        action: "Log it." });
    }
  }

  // "MY LUNCH WAS ON TIME - THE PUNCH IS WHAT IS WRONG." The record holds a
  // late start that did not happen; the fix is the punch itself. Two rows
  // can say it: the question declined, and the reported problem accepted.
  const declinedLate =
    kind === "q_mealLate" && (c.choice === "no" || c.status === "declined");
  const acceptedOntime = kind === "meal_ontime" && c.status === "accepted";
  if (declinedLate || acceptedOntime) {
    out.push({ date: c.date,
      fact: "The lunch is punched starting later than it did.",
      action: "Correct the start time to when it actually began." });
  }

  // THE BACKWARDS ENTRY, acknowledged from their page. The engine already
  // reads it the right way round; QuickSolve still holds it ending before
  // it starts. The minute rides on the kind - see acknowledgeSpan.
  if (kind.startsWith("fix_reversed_") && c.status === "accepted") {
    const min = Number(kind.slice("fix_reversed_".length));
    const at = Number.isFinite(min) && min >= 0 && min <= 1439
      ? ` around ${shortClock(min)}` : "";
    out.push({ date: c.date,
      fact: `The rest entry${at} is recorded backwards - its out and in times are swapped.`,
      action: "Swap them so it reads the right way round." });
  }

  // REPORTS MANAGEMENT ACCEPTED. Each accepted kind that implies an edit
  // gets its line; the ones that agree with the record do not - a missed
  // break or a mistaken entry leaves QuickSolve already right.
  if (c.status === "accepted") {
    if (kind === "meal_taken") {
      out.push({ date: c.date, fact: "The lunch taken that day was never punched.", action: "Punch it in." });
    }
    if (kind === "rest_taken") {
      out.push({ date: c.date, fact: "The rest break taken that day is not recorded.", action: "Log it." });
    }
    if (kind === "day_missing") {
      out.push({ date: c.date, fact: "The whole day is missing its punches.", action: "Enter them." });
    }
    if (kind === "day_extra") {
      out.push({ date: c.date, fact: "The day should not be there.", action: "Remove its entries." });
    }
  }

  return out.filter((x) => x.date && x.fact);
}

// -> [{ date, text }], sorted by date, fact and action joined - the full
// instruction, for the surfaces that address whoever makes the edit.
// `corrections` are TimesheetCorrection rows with { kind, date, status,
// choice, statedBreaks }.
export function qspChanges(corrections) {
  const out = [];
  const seen = new Set();
  for (const c of corrections || []) {
    if (!c || c.status === "open") continue;
    for (const x of changesForRow(c)) {
      const key = `${x.date}|${x.fact}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ date: x.date, text: `${x.fact} ${x.action}` });
    }
  }
  out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return out;
}

// THE SAME EDITS, EACH UNDER THE CHOICE THAT PRODUCED IT. Mánu 2026-08-17:
// the email "needs to show the choices they made during the review timesheet
// they submitted so they know exactly what to change" - an instruction with
// no memory of the answer behind it asks somebody to trust it blind.
//
// `said` is employeeResolution's receipt - the row restated in their own
// direction, no figure, no consequence - and rows whose kind has no receipt
// (the acknowledged backwards entry) carry their changes alone, which explain
// themselves. Rows with a receipt and no edit are the rest of their review
// record: what they told us that changes nothing in QuickSolve. Pass those
// through so the email can show the whole set of choices, not only the ones
// that grew an edit.
//
// -> [{ date, said, changes: [{ fact, action }] }], sorted by date.
export function reviewChoices(corrections) {
  const out = [];
  const seen = new Set();
  for (const c of corrections || []) {
    if (!c || c.status === "open") continue;
    const said = employeeResolution(c, c.question || null);
    const changes = [];
    for (const x of changesForRow(c)) {
      const key = `${x.date}|${x.fact}`;
      if (seen.has(key)) continue;
      seen.add(key);
      changes.push({ fact: x.fact, action: x.action });
    }
    if (!said && !changes.length) continue;
    // a grouped answer's stated times can sit on a different date than the
    // row; the row's own date leads, the way their page groups it
    out.push({ date: c.date, said: said || null, changes });
  }
  out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return out;
}
