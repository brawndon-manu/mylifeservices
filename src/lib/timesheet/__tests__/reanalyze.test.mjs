// RE-RUNNING analyzeDay OVER A STORED BATCH.
//
// Until 2026-08-12 `rebuildSheetFor` never called `analyzeDay` again, so a rule
// that landed after an upload reached nothing already in the database. These
// tests cover the reconstruction that makes the re-run possible, and they exist
// mostly to pin the trap: `stored.js` drops SIX inputs, and rebuilding only
// `scheduleBlocks` looks like it works while quietly paying rest minutes twice.
import { test } from "node:test";
import assert from "node:assert/strict";

import { reanalyzeDays, restWindowsByDate } from "../reanalyze.js";
import { analyzeDay } from "../parse.js";

const at = (h, m = 0) => ({ min: h * 60 + m, raw: `${h}:${String(m).padStart(2, "0")}` });

// a stored day the way `stored.js` leaves one: the answers, none of the raw
// material. Built by running the engine and then dropping what it read, which is
// exactly what the projection does.
function storedish(punches, shifts, extra = {}) {
  const day = {
    date: "08/03/26",
    punches,
    printed: null,
    repaired: false,
    mealScheduled: false,
    restRecorded: 0,
    ...extra,
  };
  const full = analyzeDay({
    ...day,
    scheduleBlocks: [],
    restTimes: null,
    restsAlreadyPaid: true,
    restSourceAvailable: true,
  });
  // drop the raw inputs, as the stored projection does
  const { scheduleBlocks, restTimes, restsAlreadyPaid, restSourceAvailable, ...rest } = full;
  return { stored: rest, shifts };
}

const sched = (shifts) => ({ "08/03/26": { shifts } });

// ------------------------------------------------------- the rules take effect

test("a whole day rostered as Misc stops owing rests once the engine re-runs", () => {
  // eight hours on the clock, every one of them Misc. This is Aranda's 08/03.
  const { stored } = storedish([at(8, 30), at(16, 30)], null);
  assert.equal(stored.restRequired, 2, "the stored day owes two, as at upload");

  const res = reanalyzeDays([stored], {
    scheduleByDate: sched([{ text: "8:30a-4:30p -ILS Misc(8:00)", meal: false }]),
    restSourceAvailable: true,
  });
  assert.equal(res.days[0].restRequired, 0, "Misc time is not time worked");
  assert.equal(res.days[0].mealRequired, false);
  assert.equal(res.paidDrift, 0, "what they are PAID must not move");
  assert.equal(res.days[0].paidHours, stored.paidHours);
});

test("the move is reported rather than made quietly", () => {
  const { stored } = storedish([at(8, 30), at(16, 30)], null);
  const res = reanalyzeDays([stored], {
    scheduleByDate: sched([{ text: "8:30a-4:30p -ILS Misc(8:00)", meal: false }]),
    restSourceAvailable: true,
  });
  const fields = res.moved.map((m) => m.field);
  assert.ok(fields.includes("restRequired"), "a changed entitlement is listed");
  const r = res.moved.find((m) => m.field === "restRequired");
  assert.equal(r.was, 2);
  assert.equal(r.now, 0);
  assert.equal(r.date, "08/03/26");
});

// ------------------------------------------------- the inputs that get dropped

test("the injected raw inputs do not ride back into the stored day", () => {
  // `analyzeDay` spreads `...day`, so anything handed in comes back out. Left
  // on, `scheduleBlocks` and `restTimes` would land in `data.days` - the two
  // fields `stored.js` drops on purpose.
  const { stored } = storedish([at(9), at(17)], null);
  const res = reanalyzeDays([stored], {
    scheduleByDate: sched([{ text: "9a-5p Smith, J-ILS Service(8:00)", meal: false }]),
    restTimesFor: () => [{ out: 720, in: 730, fit: null }],
    restSourceAvailable: true,
  });
  for (const k of ["scheduleBlocks", "restTimes", "restsAlreadyPaid", "restSourceAvailable"]) {
    assert.ok(!(k in res.days[0]), `${k} must not be stored`);
  }
});

test("a day with no schedule shifts is left exactly as it was, and counted", () => {
  // no blocks means no way to tell Misc from service, and re-analysing without
  // them goes back to judging the whole day as one lump. Keeping the stored
  // answer is the honest outcome.
  const { stored } = storedish([at(9), at(17)], null);
  const res = reanalyzeDays([stored], { scheduleByDate: {}, restSourceAvailable: true });
  assert.equal(res.skipped, 1);
  assert.equal(res.days[0], stored, "the same object, untouched");
  assert.equal(res.moved.length, 0);
});

test("paid hours moving is reported as SUSPECT, not as a rule taking effect", () => {
  // the canary. Paid hours come from the punches and the printed floor, so a
  // re-analysis that moves them means an input was rebuilt wrongly.
  const { stored } = storedish([at(9), at(17)], null);
  const lying = { ...stored, paidHours: 99 };
  const res = reanalyzeDays([lying], {
    scheduleByDate: sched([{ text: "9a-5p Smith, J-ILS Service(8:00)", meal: false }]),
    restSourceAvailable: true,
  });
  assert.equal(res.paidDrift, 1);
  const s = res.moved.find((m) => m.suspect);
  assert.ok(s, "the drift is flagged suspect so a caller can refuse it");
  assert.equal(s.field, "paidHours");
  assert.equal(s.was, 99);
});

// ------------------------------------------------------------- answers survive

test("a reviewer's 'that Misc time was worked' survives the re-run", () => {
  // `analyzeDay` reads `miscWorked` at the top, so a re-analysis that ignored
  // the override would recompute the entitlement straight back over somebody's
  // answer - the Dinley 08/07 shape.
  const { stored } = storedish([at(8, 30), at(16, 30)], null);
  const scheduleByDate = sched([{ text: "8:30a-4:30p -ILS Misc(8:00)", meal: false }]);

  const unanswered = reanalyzeDays([stored], { scheduleByDate, restSourceAvailable: true });
  assert.equal(unanswered.days[0].restRequired, 0);

  const answered = reanalyzeDays([stored], {
    scheduleByDate,
    restSourceAvailable: true,
    overrides: { "08/03/26": { miscKind: "worked", miscWorked: true } },
  });
  assert.equal(answered.days[0].restRequired, 2, "saying it was work puts the hours back");
  assert.equal(answered.days[0].miscWorked, true);
});

// ------------------------------------------------------------- the rest windows

test("restWindowsByDate keeps only rows it can place", () => {
  const helpers = {
    restRowTimes: (r) => ({ from: r.out, to: r.in }),
    clockMin: (v) => {
      const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(String(v || ""));
      if (!m) return null;
      let h = Number(m[1]) % 12;
      if (m[3] === "PM") h += 12;
      return h * 60 + Number(m[2]);
    },
    serviceFit: () => null,
  };
  const rows = [
    { name: "A", date: "08/03/26", out: "12:00 PM", in: "12:10 PM", counted: true },
    // not counted: the report itself says it does not count
    { name: "A", date: "08/03/26", out: "1:00 PM", in: "1:10 PM", counted: false },
    // unreadable: a window nobody can place is worse than no window, because
    // `restsOutsideShift` reads absence as "not outside" and bad minutes as fact
    { name: "A", date: "08/04/26", out: "nonsense", in: "1:10 PM", counted: true },
  ];
  const byDate = restWindowsByDate(rows, helpers);
  assert.equal(byDate.get("08/03/26").length, 1);
  assert.equal(byDate.get("08/03/26")[0].out, 720);
  assert.equal(byDate.get("08/03/26")[0].in, 730);
  assert.ok(!byDate.has("08/04/26"), "the unreadable row is dropped, not guessed");
});

test("no days, no schedule, nothing throws", () => {
  const res = reanalyzeDays(null, {});
  assert.deepEqual(res.days, []);
  assert.equal(res.skipped, 0);
});
