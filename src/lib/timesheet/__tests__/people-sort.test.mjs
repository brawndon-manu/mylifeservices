// THE ORDER OF THE ALL-EMPLOYEES LIST.
//
// Mánu 2026-08-22: "default by last names, add in by first name, by amount of
// premiums, by amount of etc etc."
//
// The property worth pinning hardest is that every order is TOTAL. This list is
// a worklist two people read at once, and a tie broken arbitrarily lets the same
// data render in two orders - a row that moves for no reason reads as a row that
// changed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SORTS, DEFAULT_SORT, sortKeyFrom, sortPeople, splitSourceName, schedulingCount,
} from "../people-sort.js";

const person = (who, over = {}) => ({
  who, premium: 0, toRaise: 0, paid: 0, tags: [], ...over,
});

const names = (list) => list.map((p) => p.who);

// QSP writes every name "Last, First"
test("a name splits on the comma the export writes", () => {
  assert.deepEqual(splitSourceName("Adams, Taylor"), { last: "Adams", first: "Taylor" });
  assert.deepEqual(splitSourceName("  Hernandez-Nieves ,  Beatriz "), {
    last: "Hernandez-Nieves", first: "Beatriz",
  });
});

// an export spelling nobody matched still has to land somewhere sensible
test("a name with no comma is all surname", () => {
  assert.deepEqual(splitSourceName("B. Rotter"), { last: "B. Rotter", first: "" });
  assert.deepEqual(splitSourceName(null), { last: "", first: "" });
});

test("last name is the default, and it is the order the list already had", () => {
  assert.equal(DEFAULT_SORT, "name");
  const out = sortPeople(
    [person("Zermeno, Jessica"), person("Adams, Taylor"), person("Macareno, Allan")],
    "name",
  );
  assert.deepEqual(names(out), ["Adams, Taylor", "Macareno, Allan", "Zermeno, Jessica"]);
});

test("first name sorts on the other half", () => {
  const out = sortPeople(
    [person("Adams, Taylor"), person("Zermeno, Jessica"), person("Macareno, Allan")],
    "first",
  );
  assert.deepEqual(names(out), ["Macareno, Allan", "Zermeno, Jessica", "Adams, Taylor"]);
});

// "by amount of" always means most-first: nobody opens this to find the fewest
test("premium hours come back biggest first", () => {
  const out = sortPeople(
    [person("A, One", { premium: 1 }), person("B, Two", { premium: 9 }), person("C, Three", { premium: 5 })],
    "premium",
  );
  assert.deepEqual(names(out), ["B, Two", "C, Three", "A, One"]);
});

test("things to raise and hours worked do the same", () => {
  assert.deepEqual(
    names(sortPeople([person("A, A", { toRaise: 2 }), person("B, B", { toRaise: 7 })], "raise")),
    ["B, B", "A, A"],
  );
  assert.deepEqual(
    names(sortPeople([person("A, A", { paid: 8 }), person("B, B", { paid: 40 })], "hours")),
    ["B, B", "A, A"],
  );
});

// counted off the tags rather than recomputed, so the number the list sorts on
// is the number printed on the row
test("scheduling sorts on the chips the card actually shows", () => {
  const withTags = (n) => [{ tone: "scheduling", n }, { tone: "violation", n: 99 }];
  const out = sortPeople(
    [person("A, A", { tags: withTags(1) }), person("B, B", { tags: withTags(6) })],
    "scheduling",
  );
  assert.deepEqual(names(out), ["B, B", "A, A"]);
  assert.equal(schedulingCount(withTags(6)), 6, "and a violation tag is not counted into it");
});

// THE ONE THAT MATTERS. Two people on 3.00 premium hours must come back the same
// way every render, or the list reshuffles under somebody mid-scroll.
test("every order is total - ties fall through to surname", () => {
  const tied = [
    person("Young, Ann", { premium: 3 }),
    person("Baker, Zoe", { premium: 3 }),
    person("Mills, Kim", { premium: 3 }),
  ];
  for (const key of Object.keys(SORTS)) {
    const once = names(sortPeople(tied, key));
    const twice = names(sortPeople([...tied].reverse(), key));
    assert.deepEqual(once, twice, `${key} is not a total order`);
  }
});

test("sorting never reorders the caller's array", () => {
  const original = [person("Z, Z"), person("A, A")];
  const before = names(original);
  sortPeople(original, "name");
  assert.deepEqual(names(original), before, "the totals strip counts this same list");
});

// a stale link should show the list, not a screen about itself
test("an unknown or missing sort key falls back to the default", () => {
  assert.equal(sortKeyFrom("nonsense"), DEFAULT_SORT);
  assert.equal(sortKeyFrom(undefined), DEFAULT_SORT);
  assert.equal(sortKeyFrom("premium"), "premium");
});

// prototype keys are why this uses Object.hasOwn rather than SORTS[value]
test("a prototype key is not a sort", () => {
  assert.equal(sortKeyFrom("constructor"), DEFAULT_SORT);
  assert.equal(sortKeyFrom("toString"), DEFAULT_SORT);
});

test("every sort offers a label and a plain-language hint", () => {
  for (const [key, s] of Object.entries(SORTS)) {
    assert.ok(s.label, `${key} needs a label`);
    assert.ok(s.hint, `${key} needs a hint`);
    assert.equal(typeof s.compare, "function");
  }
});
