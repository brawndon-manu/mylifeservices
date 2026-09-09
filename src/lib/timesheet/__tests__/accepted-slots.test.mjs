// AN ACCEPTED HOURS CORRECTION REBUILDS THE DAY (Mánu 2026-09-08).
// A claim carries every work slot, so accepting it replaces the day's clock
// rather than moving a number and leaving every picture of the day wrong.
import test from "node:test";
import assert from "node:assert/strict";

import { patchFor, punchesFromSlots, applyOverrides, mergeOverride } from "../corrections.js";
import { reanalyzeDays } from "../reanalyze.js";
import { breaksAgainstSlots, droppedBreakLabel } from "../work-slots.js";

const SLOTS = [{ from: 480, to: 660 }, { from: 690, to: 900 }]; // 8-11, 11:30-3

test("slots become the punch list the engine reads, with printable times", () => {
  assert.deepEqual(punchesFromSlots(SLOTS), [
    { raw: "8:00a", min: 480 },
    { raw: "11:00a", min: 660 },
    { raw: "11:30a", min: 690 },
    { raw: "3:00p", min: 900 },
  ]);
  // sorted, whatever order they arrive in
  assert.deepEqual(punchesFromSlots([SLOTS[1], SLOTS[0]]), punchesFromSlots(SLOTS));
  // nothing usable changes nothing, so a caller can spread the result
  assert.equal(punchesFromSlots([]), null);
  assert.equal(punchesFromSlots(null), null);
  assert.equal(punchesFromSlots([{ from: 600, to: 600 }]), null);
  assert.equal(punchesFromSlots([{ from: 600, to: 540 }]), null);
  // midnight and noon read as themselves, not as 0 or 12 in the wrong half
  assert.deepEqual(punchesFromSlots([{ from: 0, to: 720 }]), [
    { raw: "12:00a", min: 0 },
    { raw: "12:00p", min: 720 },
  ]);
});

test("accepting an hours claim patches the clock as well as the hours", () => {
  const day = { date: "07/16/26", paidHours: 6, punches: [{ raw: "9:00a", min: 540 }, { raw: "3:00p", min: 900 }] };
  const patch = patchFor("hours", day, 6.5, SLOTS);
  assert.equal(patch.paidHours, 6.5);
  assert.equal(patch.correctedPunches, true);
  assert.deepEqual(patch.punches, punchesFromSlots(SLOTS));
  // and with no slots on the claim it behaves exactly as it always did
  const bare = patchFor("hours", day, 6.5, null);
  assert.deepEqual(bare, { paidHours: 6.5 });
  assert.equal(bare.correctedPunches, undefined);
});

test("a missing day arrives with the clock the employee gave us", () => {
  // it used to arrive with punches: [], so the calendar drew nothing and the
  // sheet printed a total beside empty punch cells
  const patch = patchFor("day_missing", null, 6.5, SLOTS);
  assert.equal(patch.added, true);
  assert.deepEqual(patch.punches, punchesFromSlots(SLOTS));
  const built = applyOverrides([], { "07/20/26": patch });
  assert.equal(built.length, 1);
  assert.equal(built[0].addedByHand, true);
  assert.equal(built[0].paidHours, 6.5);
  assert.deepEqual(built[0].punches, punchesFromSlots(SLOTS));
  assert.equal(built[0].correctedPunches, true);
  // a claim with no slots still adds the day, with an empty clock as before
  const old = applyOverrides([], { "07/20/26": patchFor("day_missing", null, 8, null) });
  assert.deepEqual(old[0].punches, []);
});

test("the override whitelist actually copies the corrected clock", () => {
  // THE TRAP THIS FILE WARNS ABOUT TWICE: a key missing from applyOverrides is
  // ignored in silence, which once left a day claiming hours it did not have.
  const day = { date: "07/16/26", paidHours: 6, punches: [{ raw: "9:00a", min: 540 }] };
  const ov = mergeOverride({}, "07/16/26", patchFor("hours", day, 6.5, SLOTS));
  const [out] = applyOverrides([day], ov);
  assert.deepEqual(out.punches, punchesFromSlots(SLOTS));
  assert.equal(out.paidHours, 6.5);
  assert.equal(out.correctedPunches, true);
});

test("re-analysis reads the corrected clock and does not call the move drift", () => {
  // THE REASON THIS MATTERS: the rebuild falls back to the STORED days for the
  // whole sheet the moment paidDrift is non-zero, so one corrected day reading
  // as drift would discard every other day's re-analysis too.
  const day = {
    date: "07/16/26",
    paidHours: 6,
    punches: [{ raw: "9:00a", min: 540 }, { raw: "3:00p", min: 900 }],
    restTaken: 0,
    restRequired: 1,
  };
  const scheduleByDate = { "07/16/26": { shifts: [{ text: "8:00a-3:00p", meal: null }] } };
  const overrides = { "07/16/26": patchFor("hours", day, 6.5, SLOTS) };

  const res = reanalyzeDays([day], { scheduleByDate, overrides });
  assert.equal(res.skipped, 0, "the day has schedule shifts, so it is rebuildable");
  // whatever the engine makes of the new clock, an accepted correction is never
  // counted as reconstruction drift
  assert.equal(res.paidDrift, 0);
  const moves = res.moved.filter((m) => m.field === "paidHours");
  for (const m of moves) {
    assert.equal(m.corrected, true, "a move on a corrected day is reported as corrected");
    assert.equal(m.suspect, undefined);
  }

  // and an UNEXPLAINED move is still drift: same day, no accepted correction
  const bad = reanalyzeDays([{ ...day, punches: [] }], { scheduleByDate, overrides: {} });
  const suspect = bad.moved.filter((m) => m.suspect);
  assert.equal(bad.paidDrift, suspect.length);
});

// BREAK RECORDS THAT NO LONGER FIT (Mánu 2026-09-08). A stored day's `breaks`
// are the gaps BETWEEN its punches, so replacing the clock leaves gaps
// describing a day nobody is claiming.
const gap = (from, to, kind = "meal") => ({
  kind,
  min: to - from,
  start: { min: from, raw: "x" },
  end: { min: to, raw: "y" },
});

test("a gap survives only where the corrected slots leave exactly that hole", () => {
  // 8-11, 11:30-3 leaves one hole: 11:00 to 11:30
  const slots = [{ from: 480, to: 660 }, { from: 690, to: 900 }];
  const { kept, dropped } = breaksAgainstSlots(
    [gap(660, 690), gap(720, 750), gap(900, 960, "rest")],
    slots,
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].start.min, 660);
  assert.equal(dropped.length, 2);
  // the one inside worked time, and the one after the last punch
  assert.deepEqual(dropped.map((d) => [d.from, d.to]), [[720, 750], [900, 960]]);
  assert.equal(dropped[0].why, "outside the corrected clock");
  assert.equal(droppedBreakLabel(dropped[0]), "meal 12:00 PM to 12:30 PM");
  assert.equal(droppedBreakLabel(dropped[1]), "rest 03:00 PM to 04:00 PM");
});

test("a gap with unreadable ends is never claimed to fit", () => {
  const { kept, dropped } = breaksAgainstSlots(
    [{ kind: "meal", start: {}, end: {} }, { kind: "rest" }],
    [{ from: 480, to: 660 }],
  );
  assert.equal(kept.length, 0);
  assert.equal(dropped.length, 2);
  assert.equal(dropped[0].why, "unreadable");
  assert.equal(droppedBreakLabel(dropped[0]), "meal with unreadable times");
  // and nothing to check against still refuses rather than keeps
  assert.equal(breaksAgainstSlots([gap(660, 690)], []).dropped.length, 1);
  assert.deepEqual(breaksAgainstSlots(null, []), { kept: [], dropped: [] });
});

test("applying a corrected clock takes the stranded breaks off and names them", () => {
  const day = {
    date: "07/16/26",
    paidHours: 6,
    punches: [{ raw: "8:00a", min: 480 }, { raw: "12:00p", min: 720 }, { raw: "1:00p", min: 780 }, { raw: "3:00p", min: 900 }],
    breaks: [gap(720, 780)], // the old lunch, 12 to 1
  };
  // the claim says the lunch was 11 to 11:30 instead
  const claimed = [{ from: 480, to: 660 }, { from: 690, to: 900 }];
  const ov = mergeOverride({}, day.date, patchFor("hours", day, 6.5, claimed));
  const [out] = applyOverrides([day], ov);
  assert.equal(out.breaks.length, 0, "the 12-1 gap does not exist on the new clock");
  assert.equal(out.breaksDropped.length, 1);
  assert.equal(out.breaksDropped[0].from, 720);
  assert.equal(out.breaksDropped[0].why, "outside the corrected clock");

  // AND THE NO-OP CASE: a claim that keeps the same lunch keeps the record
  const same = [{ from: 480, to: 720 }, { from: 780, to: 900 }];
  const ov2 = mergeOverride({}, day.date, patchFor("hours", day, 6, same));
  const [out2] = applyOverrides([day], ov2);
  assert.equal(out2.breaks.length, 1);
  assert.equal(out2.breaksDropped, undefined);
});

test("a day with no corrected clock keeps every break record untouched", () => {
  const day = { date: "07/16/26", paidHours: 6, breaks: [gap(720, 780)], punches: [] };
  const ov = mergeOverride({}, day.date, patchFor("hours", day, 6.5, null));
  const [out] = applyOverrides([day], ov);
  assert.equal(out.breaks.length, 1);
  assert.equal(out.breaksDropped, undefined);
});
