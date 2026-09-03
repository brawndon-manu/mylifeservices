// A GUESS NEVER SENDS - Mánu 2026-09-03, after Megan Lines's sheet reached
// Megan McAlpine's inbox on a 50% first-name guess. These pin the one rule
// and both places that enforce it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { unconfirmedMatch } from "../match-confirm.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("a fuzzy match needs a person; exact, manual and unmatched do not", () => {
  assert.equal(unconfirmedMatch({ matchMethod: "fuzzy" }), true);
  assert.equal(unconfirmedMatch({ matchMethod: "exact" }), false);
  // picking the person - the guessed account included - IS the confirmation
  assert.equal(unconfirmedMatch({ matchMethod: "manual" }), false);
  // an unmatched row has no user and never reaches a send button anyway
  assert.equal(unconfirmedMatch({ matchMethod: "unmatched" }), false);
  assert.equal(unconfirmedMatch(null), false);
});

test("the send action refuses fuzzy rows in the query itself", () => {
  const actions = read("src/app/portal/admin/timesheets/actions.js");
  assert.match(actions, /where\.matchMethod = \{ not: "fuzzy" \}/);
  // and counts them so the screen can say why they were left out
  assert.match(actions, /matchMethod: "fuzzy"/);
  assert.match(actions, /unconfirmed \? `&unconfirmed=/);
});

test("the review screen hides the send behind the same rule", () => {
  const table = read("src/app/portal/admin/timesheets/_components/ReviewTable.js");
  assert.match(table, /import \{ unconfirmedMatch \} from "@\/lib\/timesheet\/match-confirm"/);
  assert.match(table, /unconfirmedMatch\(r\)/);
  assert.match(table, /Confirm the match to send/);
});
