// THE REST OF THE MONTH OFF THE SCHEDULE, pinned. only days after the copy's
// last one and inside its month, only ils and self determination, the staff
// member's own client before a lone surname and initial, and a short name two
// clients share left out and named, never guessed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { plannedFromSchedule } from "../planned.js";
import { clientKey as initialKey } from "../note-audit.js";

const whoKey = (name) => String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
const day = (date, ...texts) => ({ date, entries: texts.map((text) => ({ text, meal: /meal/i.test(text) })) });
const people = [
  {
    employee: "Dana Whitfield",
    days: [
      day("09/22/26", "10a-12p Rivera, A-ILS Service(2:00)"),            // the copy's last day: billed, not planned
      day("09/23/26", "10a-12p Rivera, A-ILS Service(2:00)", "12p-12:30p Meal", "1p-2p Office-ILS Admin(1:00)"),
      day("09/24/26", "3p-5:30p Hale, N-Self Determination Program(2:30)"),
      day("10/01/26", "10a-12p Rivera, A-ILS Service(2:00)"),            // next month: not this one
    ],
  },
  {
    employee: "Owen Tate",
    days: [
      day("09/25/26", "9a-11a Marsh, D-ILS Service(2:00)"),              // two clients fit, he serves neither
      day("09/26/26", "9a-10a ILS Service(1:00)"),                        // names no client
    ],
  },
  {
    employee: "Rosa Lind",
    days: [day("09/29/26", "4p-6p Marsh, D-ILS Service(2:00)")],          // she serves one of them already
  },
];
const rows = [
  { employeeKey: "dana whitfield", client: "Rivera, Ana", authKey: "ana rivera" },
  { employeeKey: "rosa lind", client: "Marsh, Daniel", authKey: "daniel marsh" },
];
const authLines = [
  { clientName: "Rivera, Ana", clientKey: "ana rivera" },
  { clientName: "Rivera, Abel", clientKey: "abel rivera" },          // shares "rivera|a": the staff member settles it
  { clientName: "Hale, Nora", clientKey: "hale nora" },
  { clientName: "Marsh, Daniel", clientKey: "daniel marsh" },
  { clientName: "Marsh, Dylan", clientKey: "dylan marsh" },
];

test("only service shifts after the copy's last day and inside its month are the plan", () => {
  const out = plannedFromSchedule(people, { through: "09/22/26", rows, authLines, whoKey, initialKey });
  assert.deepEqual(out.shifts.map((s) => `${s.key} ${s.date} ${s.min}`), [
    "ana rivera 09/23/26 120",
    "hale nora 09/24/26 150",
    "daniel marsh 09/29/26 120",
  ]);
  assert.equal(out.from, "09/23/26");
  assert.equal(out.to, "09/29/26");
  assert.deepEqual(out.noClient, { shifts: 1, min: 60 });
});

test("the staff member's own client wins over a shared surname and initial, and a shared one alone is named, not counted", () => {
  const out = plannedFromSchedule(people, { through: "09/22/26", rows, authLines, whoKey, initialKey });
  // Rivera, A fits Ana and Abel, and Dana Whitfield has billed Ana: Ana's
  assert.equal(out.shifts.find((s) => s.date === "09/23/26").key, "ana rivera");
  // Marsh, D with Rosa Lind, who has billed Daniel: Daniel's
  assert.equal(out.shifts.find((s) => s.date === "09/29/26").key, "daniel marsh");
  // Marsh, D with Owen Tate, who has billed neither: left out, both named
  assert.equal(out.unclear.length, 1);
  assert.equal(out.unclear[0].client, "Marsh, D");
  assert.equal(out.unclear[0].who, "Owen Tate");
  assert.deepEqual(out.unclear[0].could.sort(), ["Marsh, Daniel", "Marsh, Dylan"]);
});

test("a copy that reads to the month's end has nothing planned", () => {
  const out = plannedFromSchedule(people, { through: "09/30/26", rows, authLines, whoKey, initialKey });
  assert.equal(out.shifts.length, 0);
  assert.equal(out.unclear.length, 0);
  assert.equal(out.from, null);
  assert.deepEqual(plannedFromSchedule(null, { through: "09/22/26", whoKey, initialKey }).shifts, []);
});
