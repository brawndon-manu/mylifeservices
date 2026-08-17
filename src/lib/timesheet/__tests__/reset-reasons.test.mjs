// A RESET HAS TO REACH THE REASONS, AND STOP SHORT OF SOMEBODY ELSE'S WORK.
//
// Reset deleted the question answers and rebuilt the sheet. Reasons live in
// another table, keyed on the PERIOD and the person rather than on the sheet -
// which is what makes an answer survive a re-upload - so nothing about a reset
// reached them and they sat there afterwards looking like it had.
//
// The two halves of a row have different owners. `reason` may be ours, written
// down off a phone call; `confirmedText` is always theirs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resetAction } from "../break-answers.js";

const ME = "user-employee";
const GABE = "user-reviewer";

test("a row the employee wrote is theirs to delete", () => {
  const row = { byId: ME, reason: "no cover", confirmedAt: new Date(), confirmedText: "no cover" };
  assert.equal(resetAction(row, ME), "delete");
});

test("a row a reviewer recorded keeps its sentence", () => {
  // it goes back to "we wrote this down, please check it", which is what an
  // unconfirmed reviewer reason already means everywhere else
  const row = { byId: GABE, reason: "said on the phone", confirmedAt: new Date(), confirmedText: "yes that is right" };
  assert.equal(resetAction(row, ME), "unconfirm");
});

test("and one they never confirmed is left completely alone", () => {
  const row = { byId: GABE, reason: "said on the phone", confirmedAt: null, confirmedText: null };
  assert.equal(resetAction(row, ME), null);
});

test("confirming a reviewer's reason does not make the row yours", () => {
  // the employee path updates confirmedText and deliberately does not touch
  // byId, so a row that was never theirs to delete stays that way
  const act = fs.readFileSync("src/app/portal/admin/timesheets/actions.js", "utf8");
  const write = act.slice(act.indexOf("const writeBreakAnswer"), act.indexOf("const writeBreakAnswer") + 2600);
  const update = write.slice(write.indexOf("data: prior.reason"), write.indexOf("data: prior.reason") + 200);
  assert.doesNotMatch(update, /byId/);
});

test("a sheet with no account behind it changes nothing", () => {
  // `personKey` is the user id, so without one there is nothing to match and
  // deleting on a null would be deleting somebody else's
  assert.equal(resetAction({ byId: ME, confirmedAt: new Date() }, null), "unconfirm");
  assert.equal(resetAction(null, ME), null);
});

test("the action applies exactly that rule, and only to this person and period", () => {
  const act = fs.readFileSync("src/app/portal/admin/timesheets/actions.js", "utf8");
  const body = act.slice(
    act.indexOf("export async function resetTimesheetAnswers"),
    act.indexOf("export async function", act.indexOf("export async function resetTimesheetAnswers") + 10),
  );
  assert.match(body, /resetAction\(r, ts\.userId\) === "delete"/);
  assert.match(body, /resetAction\(r, ts\.userId\) === "unconfirm"/);
  // scoped, never a bare delete
  assert.match(body, /periodFrom: ts\.batch\.periodFrom/);
  assert.match(body, /personKey: ts\.userId/);
  assert.match(body, /confirmedAt: null, confirmedText: null/);
});

test("the button counts what it will actually remove", () => {
  const panel = fs.readFileSync("src/app/t/[token]/PreviewReset.js", "utf8");
  assert.match(panel, /const total = answers \+ reasons;/);
  assert.match(panel, /Undo their \$\{total\}/);
  const page = fs.readFileSync("src/app/t/[token]/page.js", "utf8");
  // counted through the same rule the action applies, not a second guess at it
  assert.match(page, /reasons=\{breakAnswers\.filter\(\(r\) => resetAction\(r, ts\.userId\)\)\.length\}/);
});

test("and the panel says whose words go", () => {
  const panel = fs.readFileSync("src/app/t/[token]/PreviewReset.js", "utf8");
  assert.match(panel, /wrote about a missed break goes/);
  assert.match(panel, /goes back to waiting on them to check it/);
});
