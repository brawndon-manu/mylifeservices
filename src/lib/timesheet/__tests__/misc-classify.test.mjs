// THE REVIEWER CLASSIFYING MISC TIME, and the undo that has to match it.
//
// The engine half of this was already covered: `patchesFor` translates the
// card's yes/no/third and the reviewer's pto/sick/worked to the identical patch,
// and `applyOverrides` copies every key it writes. What was not covered is the
// UNDO. Taking a classification off has to remove exactly what putting it on
// added, and a list written out at the undo site is a list that goes stale the
// day a sixth field joins the patch.
import { test } from "node:test";
import assert from "node:assert/strict";

import { patchesFor } from "../questions.js";
import { applyOverrides, mergeOverride, MISC_PATCH_FIELDS } from "../corrections.js";
import { reanalyzeDays } from "../reanalyze.js";
import { scheduleBlocks } from "../schedule.js";

const at = (h, m = 0) => ({ min: h * 60 + m, raw: `${h}:${String(m).padStart(2, "0")}` });
// an eight hour day, every minute of it rostered as Misc. Aranda's 08/03.
const miscDay = (extra = {}) => ({
  date: "08/03/26",
  paidHours: 8,
  punches: [at(8, 30), at(16, 30)],
  miscBlocks: [{ start: 510, end: 990, min: 480, from: "8:30a", to: "4:30p" }],
  miscMin: 480,
  restRequired: 0,
  mealRequired: false,
  restTaken: 0,
  restUnknown: false,
  mealScheduled: false,
  ...extra,
});

test("every key the Misc patch writes is on the shared field list", () => {
  // the whole point: the undo reads this list, so a key missing from it is a
  // field that can be set and never taken off again
  for (const answer of ["pto", "sick", "worked"]) {
    const p = patchesFor({ kind: "miscTime" }, answer, miscDay());
    for (const k of Object.keys(p)) {
      assert.ok(
        MISC_PATCH_FIELDS.includes(k),
        `patchesFor("${answer}") writes ${k}, which MISC_PATCH_FIELDS does not list`,
      );
    }
  }
});

test("undoing a classification puts the day back exactly as it was", () => {
  // THE PATCH IS THE FLAG NOW. It stopped carrying the entitlement on
  // 2026-08-12, when the rebuild started re-running `analyzeDay` - so what this
  // has to prove is that the flag goes on, the ENGINE reads it, and taking it
  // off puts the engine's answer back.
  const day = miscDay();
  const blocks = scheduleBlocks([{ text: "8:30a-4:30p -ILS Misc(8:00)", meal: false }]);
  const on = mergeOverride({}, day.date, {
    ...patchesFor({ kind: "miscTime" }, "worked", day),
    _by: "Somebody",
    _at: "2026-08-12T21:00:00.000Z",
    _source: "misc-classify",
  });
  const worked = applyOverrides([day], on)[0];
  assert.equal(worked.miscWorked, true);

  const shifts = { [day.date]: { shifts: [{ text: "8:30a-4:30p -ILS Misc(8:00)", meal: false }] } };
  // `restSourceAvailable` matters: without a rest report collected at all the
  // day comes back restUnknown, which is NOT a violation. That is the engine
  // being right, and it is why the flag alone cannot be assumed to charge.
  const after = reanalyzeDays([day], {
    scheduleByDate: shifts, overrides: on, restSourceAvailable: true,
  }).days[0];
  assert.equal(after.restRequired, 2, "eight hours of real work owes two rests");
  assert.equal(after.restViolation, true, "none taken, and the report covers them");

  // now take it off, the way the action does
  const off = { ...on };
  const rest = { ...off[day.date] };
  for (const k of [...MISC_PATCH_FIELDS, "_was", "_by", "_at", "_source"]) delete rest[k];
  if (Object.keys(rest).length) off[day.date] = rest;
  else delete off[day.date];

  const back = reanalyzeDays([day], {
    scheduleByDate: shifts, overrides: off, restSourceAvailable: true,
  }).days[0];
  assert.equal(back.restRequired, 0, "back to owing nothing, as the engine had it");
  assert.equal(back.mealRequired, false);
  assert.ok(!back.miscWorked);
  assert.ok(blocks.length, "the block list the engine reads is not empty");
});

test("undo leaves another decision on the same day alone", () => {
  // a day can carry an hours override AND a Misc classification. Undoing one
  // must not quietly discard the other.
  const day = miscDay();
  let ov = mergeOverride({}, day.date, { paidHours: 7.5, _source: "data-check" });
  ov = mergeOverride(ov, day.date, patchesFor({ kind: "miscTime" }, "pto", day));

  const rest = { ...ov[day.date] };
  for (const k of [...MISC_PATCH_FIELDS, "_was", "_by", "_at", "_source"]) delete rest[k];
  assert.deepEqual(rest, { paidHours: 7.5 }, "the hours correction survives the undo");
});

test("only worked moves a figure; pto and sick record and stop", () => {
  const day = miscDay();
  const shifts = { [day.date]: { shifts: [{ text: "8:30a-4:30p -ILS Misc(8:00)", meal: false }] } };
  for (const answer of ["pto", "sick"]) {
    const ov = mergeOverride({}, day.date, patchesFor({ kind: "miscTime" }, answer, day));
    const out = reanalyzeDays([day], {
      scheduleByDate: shifts, overrides: ov, restSourceAvailable: true,
    }).days[0];
    assert.equal(applyOverrides([day], ov)[0].miscKind, answer);
    assert.equal(out.miscWorked, false);
    assert.equal(out.restRequired, 0, `${answer} is not time worked, so nothing is owed`);
    assert.equal(out.mealRequired, false);
  }
});

test("the reviewer's three answers are the only ones accepted", () => {
  // the action rejects anything else before it reaches here; this pins that the
  // three it does accept all produce a patch rather than silently nothing
  for (const answer of ["pto", "sick", "worked"]) {
    const p = patchesFor({ kind: "miscTime" }, answer, miscDay());
    assert.ok(Object.keys(p).length > 0, `${answer} must produce a patch`);
    assert.equal(p.miscKind, answer);
  }
});
