// WHICH FORM GOES WHERE. A route is keyed by a title match, so a new form
// drops in without a schema change - and a loose pattern would quietly send
// one form's signed copies to another form's reviewer. These pin the
// september 2026 series against every title in the library today.
import test from "node:test";
import assert from "node:assert/strict";

import { FORM_CATEGORIES, formEmailRoute } from "../forms.js";

const key = (title) => formEmailRoute(title)?.key ?? null;

test("the september attestations route to the HR record", () => {
  assert.equal(key("ILS Hospital Admission Staff Attestation"), "hospital-admission-attestation");
  assert.equal(key("Staff Attendance Quick Reference Guide & Attestation"), "staff-attendance-attestation");
  for (const t of ["ILS Hospital Admission Staff Attestation", "Staff Attendance Quick Reference Guide & Attestation"]) {
    assert.equal(formEmailRoute(t).recipientTitle, "HR Administrator");
    // nine initials, a name, dates and a signature: none may stay blank
    assert.equal(formEmailRoute(t).requireAll, true);
  }
  // and nothing older started demanding every box
  assert.equal(!!formEmailRoute("ILS Service Note Documentation Training Attestation").requireAll, false);
  assert.equal(!!formEmailRoute("Special Incident Report (SIR)").requireAll, false);
});

test("the decks and the hospital quick reference have nowhere to send", () => {
  assert.equal(key("ILS Hospital Admission Training"), null);
  assert.equal(key("ILS Hospital Admission Quick Reference Guide"), null);
  assert.equal(key("Staff Attendance & Documentation Training"), null);
});

test("the older titles keep their routes", () => {
  // every routed title in the library at the time the series went in
  assert.equal(key("Special Incident Report (SIR)"), "sir");
  assert.equal(key("Training Acknowledgment & Attestation"), "training-ack");
  assert.equal(key("MLS Employee Handbook"), "employee-handbook");
  assert.equal(key("Rest & Meal Period Policy and Acknowledgement"), "rest-meal-break");
  assert.equal(key("Day Program Driver Accident Protocol"), "driver-accident-protocol");
  assert.equal(key("ILS Service Note Documentation Training Attestation"), "ils-attestation");
  // and the unrouted ones stay unrouted - "attendance" alone must not match.
  // (the restricted "Field Supervisor Training Acknowledgment" already answers
  // to training-ack by title; it is not fillable, so nothing ever rides it.)
  assert.equal(key("Attendance, Call-Outs, and Missed Sessions"), null);
  assert.equal(key("Scheduling & QSP Retraining Attestation"), null);
});

test("the series has its own shelf in the library", () => {
  assert.ok(FORM_CATEGORIES.includes("September Series Trainings 2026"));
  // it sits with the training documents, ahead of the catch-all
  assert.ok(FORM_CATEGORIES.indexOf("September Series Trainings 2026") > FORM_CATEGORIES.indexOf("Training"));
  assert.equal(FORM_CATEGORIES.at(-1), "Other");
});
