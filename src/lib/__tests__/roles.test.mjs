// THE FIELD SUPERVISOR'S SLICE OF THE ADMIN AREA, 2026-08-31.
//
// Mánu: supervisors "can see admin dashboard but only the client attestations
// card and the Annual satisfaction survey card. they can also see the user
// management card but they cant make any edits to them or see any roles like
// super can." These tests hold that boundary still: the door opens, exactly
// those desks work, and everything sharper stays shut.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  canEnterAdmin,
  isElevated,
  canManageClientAttestations,
  canManageTimesheets,
  canSeeRoles,
  canManageUser,
  canAssignRole,
  canViewFormRecords,
  isAdminUp,
} from "../roles.js";

test("the admin door opens for the oversight tier and field supervisors, nobody else", () => {
  for (const r of ["SUPER", "IT_ADMIN", "ADMIN", "MANAGER", "HR", "SUPERVISOR"]) {
    assert.equal(canEnterAdmin(r), true, r);
  }
  assert.equal(canEnterAdmin("STAFF"), false);
  assert.equal(canEnterAdmin(undefined), false);
  assert.equal(canEnterAdmin("ROBOT"), false);
});

test("entering admin does not make a supervisor elevated", () => {
  assert.equal(isElevated("SUPERVISOR"), false);
});

test("the attestation and survey desk now includes field supervisors", () => {
  assert.equal(canManageClientAttestations("SUPERVISOR"), true);
  // and still everyone it already had
  for (const r of ROLES.filter((x) => canManageTimesheets(x))) {
    assert.equal(canManageClientAttestations(r), true, r);
  }
  assert.equal(canManageClientAttestations("STAFF"), false);
});

test("timesheets did not come along for the ride", () => {
  assert.equal(canManageTimesheets("SUPERVISOR"), false);
});

test("a supervisor sees no privilege roles and manages no accounts", () => {
  assert.equal(canSeeRoles("SUPERVISOR"), false);
  for (const target of ROLES) {
    assert.equal(canManageUser("SUPERVISOR", target), false, target);
    assert.equal(canAssignRole("SUPERVISOR", target), false, target);
  }
});

test("the sharper desks stay shut to supervisors", () => {
  assert.equal(canViewFormRecords("SUPERVISOR"), false);
  assert.equal(isAdminUp("SUPERVISOR"), false);
});
