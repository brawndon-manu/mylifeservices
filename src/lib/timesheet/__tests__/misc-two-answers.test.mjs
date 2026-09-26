// THE MISC QUESTION ASKS TWO THINGS NOW: worked, or given for a client
// cancellation. PTO and sick pay aren't asked on Misc any more (the office
// records those days on its calendar), in the meal card's shape: the hours and
// when on one line, the question in bold, the answers as sentences. answers
// given before that said PTO or sick pay keep what they said.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { patchesFor } from "../questions.js";

const read = (p) => fs.readFileSync(p, "utf8");
const card = read("src/app/t/[token]/TimesheetQuestion.js");
const MISC = card.slice(card.indexOf('case "miscTime": {'), card.indexOf("// THE MEAL HALF LANDED ON THE MISC CARD"));
const actions = read("src/app/portal/admin/timesheets/actions.js");
const office = read("src/app/portal/admin/timesheets/[id]/person/[sheetId]/MiscClassify.js");

test("the card: its title, the line of facts, the question and the two answers", () => {
  assert.ok(MISC.length > 200, "the case is where it was");
  assert.match(MISC, /title: "Confirm your Misc time",/);
  assert.match(MISC, /short: "Confirm your Misc time",/);
  assert.match(MISC, /ask: "Did you work these hours, or did your client cancel\?",/);
  assert.match(MISC, /prose: true,/);
  assert.match(MISC, /body: <>Your schedule has \{Number\(q\.row\?\.hours \|\| 0\)\.toFixed\(2\)\} hours marked as Misc\{when\}\.<\/>,/);
  // one block ", from 8:30 AM to 2:30 PM"; several ": A, B and C", in full clocks
  assert.match(MISC, /const spans = \(q\.row\?\.blocks \|\| \[\]\)\.map\(\(b\) => `\$\{longClock\(b\.from\)\} to \$\{longClock\(b\.to\)\}`\);/);
  assert.match(MISC, /spans\.length === 1 \? `, from \$\{spans\[0\]\}`/);
  assert.match(MISC, /spans\.length > 1 \? `: \$\{spans\.slice\(0, -1\)\.join\(", "\)\} and \$\{spans\[spans\.length - 1\]\}`/);
  assert.match(MISC, /value: "worked",\s*label: "I worked these hours",/);
  assert.match(MISC, /value: "cancelled",\s*label: "Given for client cancellation",/);
});

test("PTO and sick pay aren't offered, and an older answer still reads what it said", () => {
  // no yes and no "no" on this card: its stored yes/no mean PTO and sick pay
  assert.doesNotMatch(MISC, /\byes: \{/);
  assert.doesNotMatch(MISC, /\bno: \{/);
  assert.doesNotMatch(MISC, /yesEffect|noEffect/);
  assert.match(MISC, /legacy: \{ yes: "Paid time off", no: "Sick pay" \},/);
  assert.match(card, /shown === "yes" \? \(c\.yes\?\.label \?\? c\.legacy\?\.yes\)/);
  assert.match(card, /shown === "no" \? \(c\.no\?\.label \?\? c\.legacy\?\.no\)/);
  // the card draws a "no" only where the kind has one
  assert.match(card, /\{c\.no && \(\n\s*<Choice\n\s*on=\{shown === "no"\}/);
});

test("the server refuses a new PTO or sick answer on Misc, from either side", () => {
  assert.match(actions, /if \(q\.kind === "miscTime" && a\.choice != null && !\["worked", "cancelled"\]\.includes\(a\.choice\)\) \{\n\s*return \{ ok: false, error: "badchoice", at: \{ id: q\.id, date: q\.date \} \};/);
  // the office's classification takes the same two
  assert.match(actions, /if \(!\["worked", "cancelled"\]\.includes\(kind\)\) return \{ ok: false, error: "badkind" \};/);
  assert.match(office, /\{\["cancelled", "worked"\]\.map\(\(k\) => \(/);
  assert.doesNotMatch(office, /\["pto", "sick", "cancelled", "worked"\]/);
  // and still names an older classification
  assert.match(office, /const LABELS = \{ pto: "PTO", sick: "Sick pay", worked: "hours worked", cancelled: "Client cancellation" \};/);
});

test("an answer given before still means what it meant when the sheet rebuilds", () => {
  const q = { kind: "miscTime", date: "09/18/26" };
  assert.deepEqual(patchesFor(q, "yes"), { miscKind: "pto", miscWorked: false });
  assert.deepEqual(patchesFor(q, "no"), { miscKind: "sick", miscWorked: false });
  assert.deepEqual(patchesFor(q, "worked"), { miscKind: "worked", miscWorked: true });
  assert.deepEqual(patchesFor(q, "cancelled"), { miscKind: "cancelled", miscWorked: false });
});
