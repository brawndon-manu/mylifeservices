// A RESET PUTS THE WALK BACK TOO.
//
// the day rail keeps a quiet day's check light until somebody has been through
// it, and "been through" is the walk: Timesheet.walkedDays, written by Next.
// neither reset touched it, so a sheet reset to the upload came back with every
// quiet day it had been walked through already solid. and an open tab only ever
// added the sheet's dates to its own, so even an emptied list stayed solid there
// until a reload. both resets empty it now, and a tab follows the sheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { walkedFromSheet } from "../day-shell.js";

const read = (file) => fs.readFileSync(file, "utf8");
const actions = read("src/app/portal/admin/timesheets/actions.js");
const card = read("src/app/t/[token]/TimesheetQuestion.js");
const flow = read("src/app/t/[token]/ReviewFlow.js");
const bodyOf = (name) => {
  const at = actions.indexOf(`export async function ${name}`);
  return actions.slice(at, actions.indexOf("\nexport async function", at + 10));
};

test("a reset that empties the sheet's list leaves no day walked", () => {
  assert.deepEqual([...walkedFromSheet([], new Map())], []);
  // what the tab held before the reset does not come into it at all
  assert.deepEqual([...walkedFromSheet([])], []);
});

test("the sheet's list is what counts once its writes have landed", () => {
  assert.deepEqual([...walkedFromSheet(["09/16/26", "09/21/26"])].sort(), ["09/16/26", "09/21/26"]);
});

test("a press made here and not written yet is kept, either way round", () => {
  // Next on the 22nd, the write still out: the ring must not untick on a refresh
  assert.deepEqual([...walkedFromSheet(["09/16/26"], new Map([["09/22/26", true]]))].sort(), ["09/16/26", "09/22/26"]);
  // Change this on the 16th, the undo still out: it must not come back solid
  assert.deepEqual([...walkedFromSheet(["09/16/26"], new Map([["09/16/26", false]]))], []);
});

test("the tab's walk follows the sheet instead of only adding to it", () => {
  assert.match(card, /const unwritten = useRef\(new Map\(\)\);/);
  // on every list the server sends: keyed on the dates as a string, an empty
  // list before the walk and an empty one after the reset looked unchanged, and
  // the tab kept its solid days (two quiet days on the July rehearsal did)
  assert.match(card, /useEffect\(\(\) => \{\n\s*setReady\(walkedFromSheet\(walked \|\| \[\], unwritten\.current\)\);\n\s*\}, \[walked\]\);/);
  assert.doesNotMatch(card, /fromSheet/);
  // the old merge kept every date the tab had ever seen
  assert.doesNotMatch(card, /new Set\(\[\.\.\.r, \.\.\./);
  // a press is held until its write comes back, and let go once it has
  assert.match(card, /unwritten\.current\.set\(date, !undo\);/);
  assert.match(card, /if \(res\?\.ok && unwritten\.current\.get\(date\) === !undo\) unwritten\.current\.delete\(date\);/);
});

test("nothing keeps a second copy of the walk in the tab", () => {
  assert.doesNotMatch(flow, /reviewedDays|markReviewed/);
  assert.doesNotMatch(card, /markReviewed/);
});

test("the one-sheet reset empties the walk, after its checks and before the rebuild", () => {
  const body = bodyOf("resetTimesheetAnswers");
  const guard = body.indexOf('if (ts.signedAt && !confirmUnsign) return { ok: false, error: "needsunsign" };');
  const approved = body.indexOf('if (ts.approvedAt && !confirmUnapprove) return { ok: false, error: "needsunapprove" };');
  const deletes = body.indexOf("prisma.timesheetCorrection.deleteMany");
  const walks = body.indexOf("await prisma.timesheet.update({ where: { id: ts.id }, data: { walkedDays: [] } });");
  const rebuild = body.indexOf("await rebuildSheetFor(");
  assert.ok(guard > 0 && approved > 0 && deletes > 0 && walks > 0 && rebuild > 0, "every step is there");
  // refused before anything goes: a sheet signed after the confirm opened keeps its answers
  assert.ok(guard < deletes && approved < deletes, "the checks come before the deletes");
  assert.ok(deletes < walks && walks < rebuild, "the walk goes with the answers, before the rebuild");
});

test("the whole-period reset empties every sheet's walk", () => {
  const body = bodyOf("resetBatchAnswers");
  assert.match(body, /await prisma\.timesheet\.updateMany\(\{ where: \{ batchId \}, data: \{ walkedDays: \[\] \} \}\);/);
  assert.ok(body.indexOf("walkedDays: []") < body.indexOf("rebuildSheetFor("), "before the sheets rebuild");
});
