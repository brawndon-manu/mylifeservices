// SCHEDULING RULES THE OFFICE HAS TO STOP, not money anybody is owed.
//
// Mánu 2026-08-22: "I want to have a way to have MLS violations where it becomes
// admins job to see patterns and repeats and stop it." A booking rostered at
// eight hours is not something the person who worked it did - it was built that
// way before they clocked in - so it can never reach their pay or the sheet they
// sign. That is the rule this file exists to hold.
//
// Measured on the live batches when it was written: 418 over-cap bookings and 77
// overlapping days across 07/16-08/31, over 56 people.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CAP_MINUTES, CAPPED_SERVICES, isCappedService,
  overCapBookings, overlappingDays, complianceFor, complianceCounts, repeatsByPerson,
} from "../compliance.js";
import { blockService, blockClient, blockKind } from "../schedule-overlap.js";

const day = (...texts) => ({ shifts: texts.map((t) => ({ text: t, minutes: mins(t) })) });
// read the (h:mm) QSP prints, so a fixture cannot disagree with its own text
const mins = (t) => {
  const m = /\((\d{1,2}):(\d{2})\)/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// ---- which services carry the cap ----

test("the cap is 3.5 hours", () => {
  assert.equal(CAP_MINUTES, 210);
});

test("it applies to ILS Service and Self Determination, by name", () => {
  assert.ok(isCappedService("ILS Service"));
  assert.ok(isCappedService("Self Determination Program"));
});

// the four that are NOT capped, and two of them routinely run longer
test("and to nothing else the schedule prints", () => {
  for (const s of ["ILS Travel", "ILS Admin", "ILS Training", "ILS Misc", "Meal Break", "Personal Appointment"]) {
    assert.equal(isCappedService(s), false, `${s} must not be capped`);
  }
});

test("an unreadable block is not capped rather than assumed capped", () => {
  assert.equal(isCappedService(null), false);
  assert.equal(isCappedService(""), false);
});

// ---- the cap itself ----

test("a booking over 3.5 hours is a finding, with how far over", () => {
  const f = overCapBookings({ "07/20/26": day("9a-5p Durell, H-ILS Service (8:00)") });
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "booking-over-cap");
  assert.equal(f[0].minutes, 480);
  assert.equal(f[0].over, 270);
  assert.equal(f[0].service, "ILS Service");
  assert.equal(f[0].client, "Durell, H");
});

test("exactly 3.5 hours is not over it", () => {
  assert.deepEqual(overCapBookings({ "08/17/26": day("7:30a-11a Groty, M-ILS Service(3:30)") }), []);
});

test("Self Determination carries the same cap", () => {
  const f = overCapBookings({ "08/10/26": day("9a-3p Wood, A-Self Determination Program(6:00)") });
  assert.equal(f.length, 1);
  assert.equal(f[0].service, "Self Determination Program");
});

// THE ONE THAT KEEPS IT HONEST. A long travel or admin block is not a breach,
// and reading "is it a client booking" instead of the service name would make
// every one of them one.
test("a long uncapped block is not a finding", () => {
  assert.deepEqual(overCapBookings({ "08/01/26": day("8a-5p -ILS Admin(9:00)") }), []);
  assert.deepEqual(overCapBookings({ "08/02/26": day("8a-4p -ILS Travel(8:00)") }), []);
});

// two authorisations to fix, not one bad day
test("two long bookings in a day are two findings", () => {
  const f = overCapBookings({
    "08/05/26": day("7a-11:30a A, B-ILS Service(4:30)", "12p-4:30p C, D-ILS Service(4:30)"),
  });
  assert.equal(f.length, 2);
});

test("findings come back worst first", () => {
  const f = overCapBookings({
    "08/05/26": day("7a-11:30a A, B-ILS Service(4:30)", "12p-8p C, D-ILS Service(8:00)"),
  });
  assert.equal(f[0].minutes, 480);
});

// ---- overlap, read through the same function the checks list uses ----

test("two blocks over each other are a finding with the overlapping minutes", () => {
  const f = overlappingDays({
    "08/05/26": day("9a-12p A, B-ILS Service(3:00)", "11a-1p C, D-ILS Service(2:00)"),
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "blocks-overlap");
  assert.equal(f[0].minutes, 60);
});

test("blocks that merely touch do not overlap", () => {
  assert.deepEqual(
    overlappingDays({ "08/05/26": day("9a-12p A, B-ILS Service(3:00)", "12p-1p C, D-ILS Service(1:00)") }),
    [],
  );
});

// ---- the parser both rules read ----

test("the service name survives a client whose surname has a hyphen", () => {
  const t = "9a-5p Conklin-Miller, E-ILS Service (8:00)";
  assert.equal(blockService(t), "ILS Service");
  assert.equal(blockClient(t), "Conklin-Miller, E");
});

test("blockKind still says what it always said", () => {
  assert.equal(blockKind("2:45p-5:34p Mienik, G-ILS Service(2:49)"), "a client booking");
  assert.equal(blockKind("2p-2:30p -ILS Travel(0:30)"), "a travel block");
  assert.equal(blockKind("12p-12:30p -Meal Break(0:30)"), "a meal break");
  assert.equal(blockKind("8a-9a -ILS Admin(1:00)"), "an admin block");
});

// read as "another scheduled block" until 2026-08-22, which described an
// overlap between two of them as vaguely as one with a training block
test("and now knows Self Determination is a client booking", () => {
  assert.equal(blockKind("1p-4p Wood, A-Self Determination Program(3:00)"), "a client booking");
});

// ---- the rollup, which is the thing that was actually asked for ----

const rowsFixture = [
  { who: "Hardin, Brandon", period: "P1", findings: overCapBookings({ "07/20/26": day("9a-5p A, B-ILS Service(8:00)") }) },
  { who: "Hardin, Brandon", period: "P2", findings: overCapBookings({ "08/01/26": day("9a-2p A, B-ILS Service(5:00)") }) },
  { who: "Clean, Person", period: "P1", findings: [] },
];

test("repeats count per person across periods", () => {
  const r = repeatsByPerson(rowsFixture);
  assert.equal(r.length, 1);
  assert.equal(r[0].who, "Hardin, Brandon");
  assert.equal(r[0].total, 2);
  assert.deepEqual(r[0].periods.sort(), ["P1", "P2"]);
});

// a person with ten in one fortnight is a different conversation from one with
// ten spread over five, so the periods are kept rather than counted
test("the worst single booking is kept, to lead with", () => {
  assert.equal(repeatsByPerson(rowsFixture)[0].worst.minutes, 480);
});

test("somebody with nothing flagged never appears", () => {
  assert.equal(repeatsByPerson(rowsFixture).some((p) => p.who === "Clean, Person"), false);
});

test("counts break down by kind", () => {
  const c = complianceCounts([{ kind: "booking-over-cap" }, { kind: "booking-over-cap" }, { kind: "blocks-overlap" }]);
  assert.deepEqual(c, { "booking-over-cap": 2, "blocks-overlap": 1 });
});

test("a sheet with no schedule produces nothing rather than throwing", () => {
  assert.deepEqual(complianceFor({}), []);
  assert.deepEqual(complianceFor(null), []);
  assert.deepEqual(complianceFor({ scheduleCheck: {} }), []);
});

// ---- THE RULE THAT MATTERS MOST ----
//
// A compliance finding is about how the schedule was BUILT. The person who
// worked it did not choose it, so it must never reach their pay or the document
// they sign. Read as source, because the guarantee is about what this file is
// allowed to touch, not about one return value.
// COMMENTS STRIPPED FIRST. The prose above every rule in that file explains what
// it must not touch, in those exact words - so reading the raw source finds
// "premium" and "signed sheet" in the sentences promising to leave them alone,
// and the guarantee tests itself as broken. The code is what is under test.
const CODE = fs
  .readFileSync(new URL("../compliance.js", import.meta.url), "utf8")
  .replace(/^\s*\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

test("nothing here computes pay", () => {
  assert.doesNotMatch(CODE, /premium|paidHours|regularHours|otHours|doubleHours|payable/i);
});

test("and nothing here reaches the signed sheet", () => {
  assert.doesNotMatch(CODE, /renderCorrected|renderSheet|signedAt|signedPdfUrl/i);
});
