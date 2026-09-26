// THE DRAFT CARD SHOWS ONLY WHAT THE REPORT CHANGES: the
// shift stretched to 11pm as the old range crossed out beside the new one and
// the hours it adds, an added shift with a plus, a removed one crossed out,
// and nothing at all for a slot left as it was.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { slotChanges } from "../report-diff.js";

const h = (hh, mm = 0) => hh * 60 + mm;
// a day of 9-1, 1:48-4:41, 4:41-6:30
const DAY = [{ from: h(9), to: h(13) }, { from: h(13, 48), to: h(16, 41) }, { from: h(16, 41), to: h(18, 30) }];

test("a shift stretched to 11pm is the one line, with the hours it adds", () => {
  const out = slotChanges(DAY, [{ from: h(9), to: h(13) }, { from: h(13, 48), to: h(16, 41) }, { from: h(16, 41), to: h(23) }]);
  assert.deepEqual(out, [{ kind: "changed", from: h(16, 41), to: h(23), wasFrom: h(16, 41), wasTo: h(18, 30), delta: 4.5 }]);
});

test("a shift added on top reads as added, with its own hours", () => {
  const out = slotChanges(DAY, [...DAY, { from: h(19), to: h(21) }]);
  assert.deepEqual(out, [{ kind: "added", from: h(19), to: h(21), delta: 2 }]);
});

test("a shift taken out is crossed out with the hours it takes", () => {
  const out = slotChanges(DAY, DAY.slice(0, 2));
  assert.deepEqual(out, [{ kind: "removed", wasFrom: h(16, 41), wasTo: h(18, 30), delta: -1.82 }]);
});

test("the same slots change nothing; a day with no record makes every slot added", () => {
  assert.deepEqual(slotChanges(DAY, DAY), []);
  assert.deepEqual(slotChanges([], [{ from: h(9), to: h(12) }]), [{ kind: "added", from: h(9), to: h(12), delta: 3 }]);
  assert.deepEqual(slotChanges(null, null), []);
});

test("a shift that started earlier and ended earlier is one change, matched by overlap", () => {
  const out = slotChanges(DAY, [{ from: h(8, 30), to: h(12, 30) }, ...DAY.slice(1)]);
  assert.deepEqual(out, [{ kind: "changed", from: h(8, 30), to: h(12, 30), wasFrom: h(9), wasTo: h(13), delta: 0 }]);
});

test("a shift split in two is one change and one added, in time order", () => {
  const out = slotChanges(DAY, [{ from: h(9), to: h(11) }, { from: h(11, 30), to: h(13) }, ...DAY.slice(1)]);
  assert.deepEqual(out.map((c) => c.kind), ["changed", "added"]);
  assert.equal(out[0].wasTo, h(13));
  assert.equal(out[1].from, h(11, 30));
});

test("the day card draws the changes off the day's own shifts, and the figure crossed out beside the new one", () => {
  const flow = fs.readFileSync("src/app/t/[token]/ReviewFlow.js", "utf8");
  const byDay = fs.readFileSync("src/app/t/[token]/DayByDay.js", "utf8");
  assert.match(flow, /import \{ slotChanges \} from "@\/lib\/timesheet\/report-diff";/);
  assert.match(flow, /const changes = item\.kind === "hours" && day \? slotChanges\(shiftsOf\(day\), minuteSlots\) : null;/);
  assert.match(flow, /\{changes && changes\.length > 0 \? \(/);
  assert.match(flow, /<s className=\{styles\.wasFigure\}>\{range\(c\.wasFrom, c\.wasTo\)\}<\/s>/);
  assert.match(flow, /\{c\.kind === "added" && <span className="text-muted">\+<\/span>\}/);
  assert.match(flow, /\{c\.delta >= 0 \? "\+" : "−"\}\{Math\.abs\(c\.delta\)\.toFixed\(2\)\} hrs/);
  assert.match(flow, /\{day && item\.kind === "hours" && <span className=\{styles\.wasFigure\}>\{Number\(day\.paidHours \|\| 0\)\.toFixed\(2\)\}<\/span>\}/);
  assert.match(byDay, /<DayReport\s+day=\{day\}/);
});
