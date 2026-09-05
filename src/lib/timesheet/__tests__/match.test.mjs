// THE MATCHER NEVER SEES AN EXEMPT ACCOUNT. Mánu 2026-09-04: his brawndonu
// admin login "is never used for the timesheets... make it completely
// exempt" - renamed to "Mánu Uribe" it scores 50 on the surname against
// QSP's "Uribe, Brandon", the exact score of the McAlpine mis-send. So the
// rule lives in matchEmployee itself: exempt accounts are invisible to
// matching, suggestions included, whatever they score.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchEmployee } from "../match.js";

const mls = { id: "u-staff", name: "Brandon Uribe", preferredFirstName: "Mánu", preferredLastName: null };
const admin = { id: "u-admin", name: "Mánu Uribe", preferredFirstName: null, preferredLastName: null, timesheetExempt: true };

test("an exempt account is never matched even when it scores", () => {
  const m = matchEmployee("Uribe, Brandon", [admin]);
  assert.equal(m.userId, null);
  assert.equal(m.method, "unmatched");
  assert.deepEqual(m.suggestions, []);
});

test("an exempt account never appears in the suggestions", () => {
  const m = matchEmployee("Uribe, Brandon", [mls, admin]);
  assert.equal(m.userId, "u-staff");
  assert.equal(m.method, "exact");
  assert.ok(!m.suggestions.some((s) => s.id === "u-admin"));
});

test("an exempt twin cannot spoil the real account's unique exact match", () => {
  // without the filter the admin account would be a 0.5 runner-up - harmless
  // today, but its presence in the pool is exactly what the flag removes
  const m = matchEmployee("Uribe, Brandon", [admin, mls]);
  assert.equal(m.method, "exact");
  assert.equal(m.confidence, 100);
});

test("accounts without the field are matched exactly as before", () => {
  const m = matchEmployee("Uribe, Brandon", [mls]);
  assert.equal(m.userId, "u-staff");
  assert.equal(m.method, "exact");
});
