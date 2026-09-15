// WHO MAY SEE A FORM. The four field supervisor documents are the first
// restricted ones the library has ever held; before them every form was
// visible to everybody signed in, and every PDF was fetchable with no session
// at all. These pin both halves of the rule.
import test from "node:test";
import assert from "node:assert/strict";
import { canSeeForm, visibleFormsWhere, formFileHref, mayShare } from "../form-visibility.js";

const open = { id: "f1", minRole: null, fileUrl: "/forms/handbook.pdf" };
const sup = { id: "f2", minRole: "SUPERVISOR", fileUrl: "https://blob/x.pdf" };

test("a form with no floor is visible to everyone, which is all fourteen today", () => {
  for (const r of ["STAFF", "SUPERVISOR", "HR", "MANAGER", "ADMIN", "IT_ADMIN", "SUPER"]) {
    assert.equal(canSeeForm(open, r), true, r);
  }
});

test("a supervisor floor admits supervisor and everyone above, and nobody below", () => {
  for (const r of ["SUPERVISOR", "HR", "MANAGER", "ADMIN", "IT_ADMIN", "SUPER"]) {
    assert.equal(canSeeForm(sup, r), true, `${r} should see it`);
  }
  assert.equal(canSeeForm(sup, "STAFF"), false, "plain staff must not");
});

test("an unknown or missing role sees only the open forms", () => {
  assert.equal(canSeeForm(open, undefined), true);
  assert.equal(canSeeForm(sup, undefined), false);
  assert.equal(canSeeForm(sup, "NOT_A_ROLE"), false);
});

test("a floor nobody can read hides the form rather than showing it", () => {
  // a typo in the column must not open the document to the office
  assert.equal(canSeeForm({ minRole: "SUPERVISER" }, "SUPER"), false);
});

test("the query says the same thing as the per-row check", () => {
  // STAFF is below SUPERVISOR, so the supervisor floor is among the blocked set
  const staff = visibleFormsWhere("STAFF");
  assert.ok(staff.OR, "staff must be filtered");
  const blocked = staff.OR[1].minRole.notIn;
  assert.ok(blocked.includes("SUPERVISOR"), "a supervisor-only form is excluded for staff");
  assert.ok(blocked.includes("SUPER"), "and so is anything higher");
  assert.ok(!blocked.includes("STAFF"), "a staff floor is one they clear");

  // SUPER clears every floor, so nothing is filtered at all
  assert.deepEqual(visibleFormsWhere("SUPER"), {});

  // and the two agree on the case that matters, rather than only looking alike
  for (const role of ["STAFF", "SUPERVISOR", "SUPER"]) {
    const w = visibleFormsWhere(role);
    const excluded = w.OR ? w.OR[1].minRole.notIn : [];
    assert.equal(
      !excluded.includes("SUPERVISOR"),
      canSeeForm(sup, role),
      `query and row check disagree for ${role}`,
    );
  }
});

test("a restricted form is fetched through the route, an open one from its own url", () => {
  assert.equal(formFileHref(open), "/forms/handbook.pdf");
  assert.equal(formFileHref(sup), "/portal/forms/f2/file");
  // the blob address is the thing that must never reach a page
  assert.ok(!formFileHref(sup).includes("blob"));
});

test("a restricted form can never carry a public share link", () => {
  assert.equal(mayShare(open), true);
  assert.equal(mayShare(sup), false);
});
