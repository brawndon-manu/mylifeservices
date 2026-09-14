import { test } from "node:test";
import assert from "node:assert/strict";
import { payoutNameParts, payoutDisplayName, visiblePayoutRows } from "../payout-names.js";

const rows = [
  { id: "1", who: "Brandon Uribe", sourceName: "Uribe, Brandon", preferred: "Mánu" },
  { id: "2", who: "Taylor Adams", sourceName: "Adams, Taylor" },
  { id: "3", who: "Ruth Delgado Pineda", sourceName: "Delgado Pineda, Ruth", preferred: "Angel" },
];
test("first-name order and last-name order use legal names without changing rows", () => {
  assert.deepEqual(visiblePayoutRows(rows).map(r => r.id), ["1", "3", "2"]);
  assert.deepEqual(visiblePayoutRows(rows, "", "last").map(r => r.id), ["2", "3", "1"]);
  assert.deepEqual(rows.map(r => r.id), ["1", "2", "3"]);
});
test("compound surnames retain the export's explicit boundary and legal spelling", () => {
  assert.equal(payoutDisplayName(rows[2], "last"), "Delgado Pineda, Ruth");
  assert.deepEqual(payoutNameParts("Jane Marie De Leon", "de leon, Jane Marie"), { first: "Jane Marie", last: "De Leon" });
  assert.equal(payoutDisplayName({ who: "Jane Smith", sourceName: "Jones, Jane" }, "last"), "Smith, Jane");
});
test("unmatched comma names and single names display in either order", () => {
  assert.equal(payoutDisplayName({ who: "Adams, Taylor" }), "Taylor Adams");
  assert.equal(payoutDisplayName({ who: "Taylor" }, "last"), "Taylor");
});
test("search matches legal, preferred and reversed names, with accents ignored", () => {
  for (const query of ["manu", "MÁNU", "Uribe, Brandon", "  brandon  uribe "]) {
    assert.deepEqual(visiblePayoutRows(rows, query).map(r => r.id), ["1"]);
  }
  assert.deepEqual(visiblePayoutRows(rows, "Angel", "last").map(r => r.id), ["3"]);
  assert.deepEqual(visiblePayoutRows(rows, "nobody"), []);
});
test("ties are deterministic regardless of incoming order", () => {
  const same = [{ id: "b", who: "Taylor Adams" }, { id: "a", who: "Taylor Adams" }];
  assert.deepEqual(visiblePayoutRows(same).map(r => r.id), ["a", "b"]);
});
