// A REASON HAS TO SAY SOMETHING: no ".", no "n/a", no " " in
// any box that asks why - the report's note, the break reasons - on the page
// and on the server alike.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { meaningfulText, standInText, NEEDS_REAL_WORDS } from "../meaningful-text.js";
import { correctionNoteProblem } from "../corrections.js";

const read = (p) => fs.readFileSync(p, "utf8");
const actions = read("src/app/portal/admin/timesheets/actions.js");
const card = read("src/app/t/[token]/TimesheetQuestion.js");
const form = read("src/app/t/[token]/ReportProblem.js");

test("a dot, an n/a and a space, and the stand-ins people type to get past a box", () => {
  for (const junk of [".", "n/a", " ", "", "   ", "-", "...", "N/A", "na", "NA.", "none", "x", "xxx", "idk", "ok", "no", "asdf", "!!", "12", "a b", "n.a."]) {
    assert.equal(meaningfulText(junk), false, JSON.stringify(junk));
  }
  assert.equal(meaningfulText(null), false);
  assert.equal(meaningfulText(undefined), false);
});

test("a few words pass, whatever the language or the case", () => {
  for (const words of ["Stayed with the client.", "no time", "  ran late  ", "Client emergency", "Se quedó con el cliente", "the bus"]) {
    assert.equal(meaningfulText(words), true, JSON.stringify(words));
  }
});

test("only a stand-in gets the short line; a reason still being typed is not refused, just not done", () => {
  for (const junk of [".", "n/a", "N/A.", "-", "...", "12", "!!", "none", "ok", "no", "x", "idk", "asdf", "n.a."]) {
    assert.equal(standInText(junk), true, JSON.stringify(junk));
    assert.equal(meaningfulText(junk), false, JSON.stringify(junk));
  }
  // halfway through a real reason: still can't be saved, but nothing is refused
  for (const typing of ["I", "I w", "Th", "hi", "a b", "5pm"]) {
    assert.equal(standInText(typing), false, JSON.stringify(typing));
    assert.equal(meaningfulText(typing), false, JSON.stringify(typing));
  }
  // an empty box is its own case, and words are words
  for (const other of ["", "   ", null, undefined, "Stayed late", "yesterday I"]) {
    assert.equal(standInText(other), false, JSON.stringify(other));
  }
});

test("an hours report always carries a reason, named for the change, and junk is refused", () => {
  const day = { paidHours: 6.8 };
  assert.equal(correctionNoteProblem("hours", day, 9, ""), "addedHoursReason");
  assert.equal(correctionNoteProblem("hours", day, 3.5, ""), "changeReason");
  assert.equal(correctionNoteProblem("hours", day, 6.8, ""), "changeReason");
  assert.equal(correctionNoteProblem("day_missing", null, 2, ""), "addedHoursReason");
  assert.equal(correctionNoteProblem("hours", day, 3.5, "."), "junk");
  assert.equal(correctionNoteProblem("hours", day, 9, "n/a"), "junk");
  assert.equal(correctionNoteProblem("other", day, null, "N/A"), "junk");
  assert.equal(correctionNoteProblem("hours", day, 3.5, "Left early, the client was sick."), null);
  // the kinds that never asked keep not asking
  assert.equal(correctionNoteProblem("day_extra", day, null, ""), null);
  assert.equal(correctionNoteProblem("meal_missed", day, null, ""), null);
});

test("the report form asks for the right reason and refuses junk with the one line", () => {
  assert.match(form, /const needsNote = meta\?\.needsNote \|\| takesSlots;/);
  assert.match(form, /const removingHours = takesSlots && !addingHours && !!day && slotTotal != null && slotTotal < \(day\.paidHours \|\| 0\);/);
  assert.match(form, /\{addingHours \? "Reason for adding hours" : removingHours \? "Reason for removing hours" : takesSlots \? "Reason for the change" : needsNote \? "Reason for the correction" : "Anything else about it\?"\}/);
  assert.match(form, /placeholder=\{reasonLine \|\| "Anything that helps payroll check it"\}/);
  // on Add: a stand-in gets the short line, a note still short of words the box's own ask
  assert.match(form, /setError\(noteProblem === "junk" \? \(standInText\(note\) \? NEEDS_REAL_WORDS : reasonLine \|\| "Tell us briefly what's wrong\."\)/);
  assert.match(form, /case "junk":\n\s*return NEEDS_REAL_WORDS;/);
});

test("the break reasons read the same rule on the page and on the server", () => {
  assert.match(card, /const reasonBlocked = needsReason && !meaningfulText\(reasonText\);/);
  assert.match(card, /\{standInText\(reasonText\) \? NEEDS_REAL_WORDS : "Needed before this can be saved\. It goes at the bottom of your timesheet\."\}/);
  assert.match(card, /if \(owesReason\(q, v\) && !meaningfulText\(reasonOf\(q\)\)\) return false;/);
  // the batched card: `said` is the box's text, so the stand-in branch can be
  // reached. the old one asked for an empty box that was also not words, and
  // never showed
  assert.match(card, /const said = reasonOf\(q\);/);
  assert.match(card, /\) : !said \|\| \(!meaningfulText\(said\) && !standInText\(said\)\) \? \(\s*\/\/ empty, or a reason still being typed: asked the same way\s*<p className="mt-1\.5 text-\[12\.5px\] text-muted">\s*Add a reason to complete this answer\./);
  assert.match(card, /\) : standInText\(said\) \? \(\s*\/\/ a stand-in, not a reason - see standInText\s*<p className="mt-1\.5 text-\[12\.5px\] font-semibold text-amber-800 dark:text-amber-300">\s*\{NEEDS_REAL_WORDS\}/);
  assert.doesNotMatch(card, /!said && !meaningfulText\(reasons\[q\.id\]\)/);
  assert.match(actions, /if \(reasonOwedOn\(q\.kind, a\.choice\) && !meaningfulText\(a\.reason\)\) \{/);
  assert.match(actions, /const said = String\(text \?\? ""\)\.trim\(\)\.slice\(0, 1000\) \|\| null;\n\s*if \(said && !meaningfulText\(said\)\) return \{ ok: false, error: "needreason", at: \{ key: findingKey \} \};/);
});

test("the standalone break-reason box reads the rule too, and says the line when the server refuses", () => {
  const box = read("src/app/t/[token]/BreakReason.js");
  assert.equal((box.match(/disabled=\{pending \|\| !meaningfulText\(text\)\}/g) || []).length, 2);
  assert.doesNotMatch(box, /disabled=\{pending \|\| !text\.trim\(\)\}/);
  assert.match(box, /res\?\.error === "needreason" \? NEEDS_REAL_WORDS/);
  // and the server's refusal there names its finding, like every other
  assert.match(actions, /if \(said && !meaningfulText\(said\)\) return \{ ok: false, error: "needreason", at: \{ key: findingKey \} \};/);
});

test("the line is one string, typed once", () => {
  assert.equal(NEEDS_REAL_WORDS, "Write a few words.");
  // and it doesn't say what was refused
  assert.doesNotMatch(NEEDS_REAL_WORDS, /n\/a|dot|dash|period|letters/i);
  for (const f of [card, form, actions, read("src/app/t/[token]/BreakReason.js")]) assert.doesNotMatch(f, /tells payroll nothing/);
});
