// ONE POST, SEVERAL FORMS TO SIGN. A person is finished only when every form
// carries their submission - a roster that counted the first signature as
// done would tell HR the second attestation was on file when it was not.
import test from "node:test";
import assert from "node:assert/strict";

import {
  signFormIds,
  signedAllByUser,
  unsignedFormIds,
  missingSignatureWhere,
} from "../announcement-sign.js";

const post = { id: "post1", formId: "hospital", extraFormIds: ["attendance"] };
const sub = (userId, formId, createdAt) => ({ userId, formId, createdAt });

test("the forms to sign are formId first, then the extras, each once", () => {
  assert.deepEqual(signFormIds(post), ["hospital", "attendance"]);
  // an older post carries one form and no extras column at all
  assert.deepEqual(signFormIds({ formId: "only" }), ["only"]);
  assert.deepEqual(signFormIds({ formId: null, extraFormIds: [] }), []);
  assert.deepEqual(signFormIds(null), []);
  // a duplicate pick or a blank never doubles the debt
  assert.deepEqual(
    signFormIds({ formId: "a", extraFormIds: ["a", "", null, "b"] }),
    ["a", "b"],
  );
});

test("signed means every form, finished when the last one landed", () => {
  const rows = [
    sub("ana", "hospital", "2026-09-22T10:00:00Z"),
    sub("ana", "attendance", "2026-09-23T10:00:00Z"),
    sub("ben", "hospital", "2026-09-22T10:00:00Z"),
    // a re-send of a form already signed does not move the date
    sub("ana", "hospital", "2026-09-25T10:00:00Z"),
    // a row that never got attributed counts for nobody
    sub(null, "attendance", "2026-09-22T10:00:00Z"),
  ];
  const done = signedAllByUser(post, rows);
  assert.deepEqual([...done.keys()], ["ana"]);
  assert.equal(done.get("ana").createdAt.toISOString(), "2026-09-23T10:00:00.000Z");
  assert.equal(done.has("ben"), false);
});

test("an older single-form post behaves exactly as before", () => {
  const old = { id: "p", formId: "only" };
  const done = signedAllByUser(old, [sub("ana", "only", "2026-09-01T00:00:00Z")]);
  assert.deepEqual([...done.keys()], ["ana"]);
  // rows selected without a date (the cron and the feed only ask who) still count
  assert.equal(signedAllByUser(old, [{ userId: "ben", formId: "only" }]).has("ben"), true);
});

test("a post with nothing to sign finishes nobody here", () => {
  assert.equal(signedAllByUser({ id: "p", formId: null }, [sub("ana", "x")]).size, 0);
});

test("what one person still owes, in signing order", () => {
  const rows = [sub("ana", "attendance", "2026-09-22T10:00:00Z")];
  assert.deepEqual(unsignedFormIds(post, rows, "ana"), ["hospital"]);
  assert.deepEqual(unsignedFormIds(post, rows, "ben"), ["hospital", "attendance"]);
  assert.deepEqual(unsignedFormIds(post, [...rows, sub("ana", "hospital")], "ana"), []);
});

test("the owed filter asks for anyone missing any one of the forms", () => {
  assert.deepEqual(missingSignatureWhere(post), {
    OR: [
      { formSubmissions: { none: { announcementId: "post1", formId: "hospital" } } },
      { formSubmissions: { none: { announcementId: "post1", formId: "attendance" } } },
    ],
  });
  assert.deepEqual(missingSignatureWhere({ id: "p", formId: null }), {});
});
