// THE MARK STATES, and the one rename that had to be survivable.
//
// "Verified on QSP" became "Responded" because whether a fix landed is something
// the next export answers per finding, while whether somebody got back to us is
// something only a person knows. Rows written under the old spelling were left
// in the database rather than migrated, because production is whatever is on
// `main`: moving the data first would render every one of those chips as unset
// on a batch somebody is working.
//
// So these pin the alias in both directions - the old value still resolves, and
// the resolver has not simply been made to answer everything.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CHECK_STATUSES,
  CHECK_STATUS_KEYS,
  MARK_OPTIONS,
  MARK_STATUS_VALUES,
  STANDING_STATUSES,
  checkStatus,
  isCheckStatus,
  normalizeCheckStatus,
  statusAfter,
} from "../check-status.js";

test("a row stored as the old spelling still resolves, and reads as Responded", () => {
  const meta = checkStatus("verified");
  assert.ok(meta, "legacy value resolved to nothing, so the chip would render unset");
  assert.equal(meta.key, "responded");
  assert.equal(meta.label, "Responded");
  assert.equal(normalizeCheckStatus("verified"), "responded");
});

// THE HALF THAT MAKES THE TEST ABOVE WORTH ANYTHING. A resolver that answered
// every input would pass it while proving nothing.
test("the resolver still refuses things that are not states", () => {
  assert.equal(checkStatus("nonsense"), null);
  assert.equal(checkStatus(null), null);
  assert.equal(checkStatus(""), null);
  assert.equal(normalizeCheckStatus(null), null);
  assert.equal(normalizeCheckStatus("nonsense"), "nonsense");
});

test("nothing writes the old spelling any more", () => {
  assert.equal(isCheckStatus("verified"), false);
  assert.equal(isCheckStatus("responded"), true);
  assert.ok(!CHECK_STATUS_KEYS.includes("verified"));
  assert.ok(!MARK_OPTIONS.includes("verified"));
});

// the query list and the button list are deliberately different, and a query
// written against MARK_OPTIONS would drop the logged legacy events it exists to
// show
test("the database match list carries the legacy spelling, the button list does not", () => {
  assert.ok(MARK_STATUS_VALUES.includes("verified"));
  assert.ok(MARK_STATUS_VALUES.includes("responded"));
  assert.ok(MARK_STATUS_VALUES.includes("contacted"));
  for (const k of MARK_OPTIONS) assert.ok(MARK_STATUS_VALUES.includes(k));
});

test("responded is a state somebody is left in, contacted is not", () => {
  assert.equal(statusAfter("contacted"), "no-response");
  assert.equal(statusAfter("responded"), "responded");
  const standing = STANDING_STATUSES.map((s) => s.key);
  assert.ok(standing.includes("responded"));
  assert.ok(!standing.includes("contacted"));
});

// a reply is not a fix. green is kept back for the outcome the export derives,
// so a mark a person pressed can never wear it.
test("no mark is emerald", () => {
  for (const s of CHECK_STATUSES) {
    assert.ok(
      !/emerald/.test(s.chip + s.dot + s.ring),
      `${s.key} wears emerald, which reads as the data confirming it`,
    );
  }
});

test("every state names a full literal class string Tailwind can see", () => {
  for (const s of CHECK_STATUSES) {
    for (const k of ["chip", "ring", "dot"]) {
      assert.equal(typeof s[k], "string");
      assert.ok(s[k].length > 0, `${s.key}.${k} is empty`);
      assert.ok(!s[k].includes("${"), `${s.key}.${k} is built at runtime`);
    }
  }
});
