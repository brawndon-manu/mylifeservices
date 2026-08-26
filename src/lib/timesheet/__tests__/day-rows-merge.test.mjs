// A DAY'S TWO QUESTIONS ARE ONE ROW, WHEREVER THEY SIT IN THE LIST.
//
// `BatchDays` groups the batch into one entry per day. It used to merge with
// the PREVIOUS entry only, which assumed both of a day's questions arrive
// together - and the list is not in date order: an answered question sorts
// after every open one, so a day short both a lunch and its tens splits the
// moment ONE of them is answered.
//
// Uribe's 07/28 did exactly that on 2026-08-25: the meal at index 6, the rest
// at index 12, two entries carrying one date. That is two <li> keyed
// "07/28/26" - React warns the children may be duplicated or omitted - and the
// day drew as two separate rows instead of the one row reading "2 to answer".
//
// The grouping itself lives in a client component this runner cannot mount, so
// this pins BOTH halves: the rule, run against the real shape, and the source
// that must not go back to reading only the entry behind it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// the grouping as TimesheetQuestion does it, on `chosen`-shaped items
function groupByDay(items) {
  const byDay = [];
  const dayAt = new Map();
  for (const item of items) {
    const at = dayAt.get(item.q.date);
    if (at != null) byDay[at].items.push(item);
    else {
      dayAt.set(item.q.date, byDay.length);
      byDay.push({ date: item.q.date, hours: item.q.row?.hours, items: [item] });
    }
  }
  return byDay;
}

// the order the page actually hands over: every open question, then the
// answered ones. 07/28 carries one of each.
const LIST = [
  { kind: "nothingDocumentedMeal", date: "07/17/26" },
  { kind: "nothingDocumentedRest", date: "07/17/26" },
  { kind: "nothingDocumentedRest", date: "07/20/26" },
  { kind: "nothingDocumentedMeal", date: "07/28/26" },
  { kind: "nothingDocumentedRest", date: "07/16/26" },
  { kind: "nothingDocumentedRest", date: "07/27/26" },
  { kind: "nothingDocumentedRest", date: "07/28/26" },
].map((q) => ({ q: { ...q, row: { hours: 6 } }, v: null }));

test("a split day is one entry, not two", () => {
  const byDay = groupByDay(LIST);
  const dates = byDay.map((d) => d.date);
  assert.deepEqual(
    dates.filter((d, i) => dates.indexOf(d) !== i),
    [],
    "no date may appear twice - each one is a React key",
  );
  const day = byDay.find((d) => d.date === "07/28/26");
  assert.equal(day.items.length, 2, "the meal and the rest are the same day's row");
});

test("the adjacent pair still merges, and a plain day stays one item", () => {
  const byDay = groupByDay(LIST);
  assert.equal(byDay.find((d) => d.date === "07/17/26").items.length, 2);
  assert.equal(byDay.find((d) => d.date === "07/20/26").items.length, 1);
});

test("the day keeps the order it first appeared in", () => {
  // the row belongs where the day first showed up; merging must not move it
  assert.deepEqual(
    groupByDay(LIST).map((d) => d.date),
    ["07/17/26", "07/20/26", "07/28/26", "07/16/26", "07/27/26"],
  );
});

test("the source groups on the date, not on the entry behind it", () => {
  const src = fs.readFileSync("src/app/t/[token]/TimesheetQuestion.js", "utf8");
  const at = src.indexOf("one entry per DAY");
  assert.ok(at > 0, "the grouping comment is the anchor for this check");
  const block = src.slice(at, at + 1400);
  assert.match(block, /dayAt\.get\(item\.q\.date\)/);
  assert.doesNotMatch(
    block,
    /byDay\[byDay\.length - 1\]/,
    "merging with the previous entry only is what split the day",
  );
});
