// ONE PROGRESS STORE, TWO UPLOADS - 2026-09-12.
//
// The client schedules upload reuses the timesheet upload's progress store
// rather than copying it, which meant giving progressKey a scope. The risk in
// that refactor is silent: change the timesheet key format and every in-flight
// upload's counter is orphaned, the screen shows nothing, and the upload itself
// looks broken while working perfectly - which is the exact bug the client
// schedules page was being fixed for.
//
// So the timesheet key is pinned byte for byte, and the two lanes are pinned
// apart.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// progressKey is pure, but its module calls Redis.fromEnv() at import time, so
// it is read as source rather than imported - the same reason timesheet-stages
// exists apart from timesheet-progress.
function loadProgressKey() {
  const src = read("src/lib/timesheet-progress.js");
  const body = src
    .slice(src.indexOf("const KEY_MAX"), src.indexOf("// One write"))
    .replace(/^export /gm, "");
  return new Function(`${body}; return progressKey;`)();
}

test("the timesheet key is exactly what it always was", () => {
  const progressKey = loadProgressKey();
  assert.equal(progressKey("u1", "abc"), "mls:ts:progress:u1:abc");
  assert.equal(progressKey("u1", "abc", "ts"), "mls:ts:progress:u1:abc");
});

test("the two uploads cannot read each other's counters", () => {
  const progressKey = loadProgressKey();
  assert.equal(progressKey("u1", "abc", "ca"), "mls:ca:progress:u1:abc");
  assert.notEqual(progressKey("u1", "abc", "ca"), progressKey("u1", "abc"));
});

test("a key still needs a user, an id and a lane", () => {
  const progressKey = loadProgressKey();
  assert.equal(progressKey(null, "abc"), null);
  assert.equal(progressKey("u1", ""), null);
  assert.equal(progressKey("u1", "abc", ""), null, "an empty lane is not the default");
  // the id comes from the browser and is never trusted as a key on its own
  assert.equal(progressKey("u1", "../../etc", "ca"), "mls:ca:progress:u1:etc");
  assert.equal(progressKey("u1", "abc", "../ts"), "mls:ts:progress:u1:abc");
});

test("each upload reads its own lane, and only its own", () => {
  const ts = read("src/app/portal/admin/timesheets/new/progress/route.js");
  const ca = read("src/app/portal/admin/client-attestations/new/progress/route.js");
  assert.doesNotMatch(ts, /progressKey\(user\.id, id, "/, "the timesheet route keeps the default");
  assert.match(ca, /progressKey\(user\.id, id, "ca"\)/);
  // and each is behind its own permission
  assert.match(ts, /canManageTimesheets/);
  assert.match(ca, /canManageClientAttestations/);
});
