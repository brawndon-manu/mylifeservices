// THE TESTS CARD'S FIXTURE, AND THE SUBJECT LINES IT PREVIEWS.
//
// The card renders the real components over a fabricated sheet, and its whole
// claim to being worth looking at is that the questions come out of the real
// `buildQuestions` rather than being written by hand. That claim needs holding
// down: a change to the classifier that stops a fixture day provoking its card
// would otherwise show up as an empty stage that nobody notices, on a page
// whose entire job is to show states nobody can otherwise reach.
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildQuestions, isMandatory } from "../questions.js";
import { timesheetSubject, correctionAlertSubject } from "../../timesheet-subjects.js";
import {
  FIXTURE_NAME, FIXTURE_DAYS, FIXTURE_RESTS, FIXTURE_SCHEDULE, KIND_DATES,
} from "../../../app/portal/admin/tests/fixture-sheet.js";

const build = () =>
  buildQuestions(
    { days: FIXTURE_DAYS, scheduleCheck: { byDate: FIXTURE_SCHEDULE } },
    { restRows: FIXTURE_RESTS, sourceName: FIXTURE_NAME },
  );

test("the fixture provokes every question kind the card claims to show", () => {
  const kinds = new Set(build().map((q) => q.kind));
  for (const kind of Object.keys(KIND_DATES)) {
    assert.ok(kinds.has(kind), `the fixture no longer produces ${kind}, so its card renders empty`);
  }
});

test("each kind lands on the day it was seeded onto", () => {
  const qs = build();
  for (const [kind, date] of Object.entries(KIND_DATES)) {
    const dates = qs
      .filter((q) => q.kind === kind)
      .flatMap((q) => q.dates || [q.date]);
    assert.ok(
      dates.includes(date),
      `${kind} was seeded onto ${date} and now appears on ${dates.join(", ") || "nothing"}`,
    );
  }
});

// PROVING THE TEST ABOVE CAN FAIL. A day stripped of the flag its question is
// built from must stop producing it - otherwise the assertion is passing on
// something other than what it claims to check.
test("emptying the seeded day takes its question away", () => {
  const withoutMisc = FIXTURE_DAYS.map((d) =>
    d.date === KIND_DATES.miscTime ? { ...d, miscBlocks: [] } : d,
  );
  const kinds = new Set(
    buildQuestions(
      { days: withoutMisc, scheduleCheck: { byDate: FIXTURE_SCHEDULE } },
      { restRows: FIXTURE_RESTS, sourceName: FIXTURE_NAME },
    ).map((q) => q.kind),
  );
  assert.equal(kinds.has("miscTime"), false);
  // and only that one goes, so the fixture days are independent of each other
  assert.ok(kinds.has("repair"));
  assert.ok(kinds.has("shortMealRest"));
});

test("the fixture keeps a mandatory question and an optional one, so both gates can be seen", () => {
  const qs = build();
  assert.ok(qs.some((q) => isMandatory(q.kind)), "nothing blocks, so the gated sheet cannot be shown");
  assert.ok(qs.some((q) => !isMandatory(q.kind)), "nothing optional, so the reassurance popup cannot be shown");
});

// THE FIXTURE SHIPS IN TRACKED SOURCE. It was seeded from a real batch, so the
// scrub is not cosmetic - a name that survived it is a real person's name in a
// public repository.
test("no real employee is left in the fixture", () => {
  for (const r of FIXTURE_RESTS) {
    assert.equal(r.name, FIXTURE_NAME);
    // free text somebody wrote about a real client's real day
    assert.ok(
      !r.scheduleNotes || r.scheduleNotes === "Note recorded on the schedule.",
      `a schedule note survived the scrub on ${r.date}`,
    );
  }
});

test("one date per kind, because a sheet cannot hold two versions of a day", () => {
  const seen = new Set();
  for (const d of FIXTURE_DAYS) {
    assert.equal(seen.has(d.date), false, `${d.date} appears twice`);
    seen.add(d.date);
  }
});

// ---------------------------------------------------------------------------
// THE SUBJECT LINES. Pinned because the Tests card shows them as the real
// thing, and because two of them are one edit away from being indistinguishable.

test("the first send and the reminder do not share a subject", () => {
  const first = timesheetSubject({ periodLabel: "08/01/26 to 08/15/26" });
  const again = timesheetSubject({ periodLabel: "08/01/26 to 08/15/26", isResend: true });
  assert.notEqual(first, again);
  // Gmail threads on subject + sender, and a collapsed repeat arrives with its
  // body hidden above a signature
  assert.match(again, /^Reminder:/);
});

test("test mode prefixes the intended address onto every one of them", () => {
  assert.match(
    timesheetSubject({ periodLabel: "x", redirectedFrom: "a@b.com" }),
    /^\[TEST -> a@b\.com\] /,
  );
  assert.match(
    correctionAlertSubject({ employeeName: "Uribe, Mánu", redirectedFrom: "a@b.com" }),
    /^\[TEST -> a@b\.com\] /,
  );
});

// PINNED AS A DISAGREEMENT, not tidied. The live and test alerts have always
// said different things, and the Tests card shows both. This fails if somebody
// aligns them, which is the point: it should be a decision.
test("the problem alert's live and test wording still differ", () => {
  const live = correctionAlertSubject({ employeeName: "Uribe, Mánu" });
  const test_ = correctionAlertSubject({ employeeName: "Uribe, Mánu", redirectedFrom: "a@b.com" });
  assert.equal(live, "Uribe, Mánu reported a problem with their timesheet");
  assert.equal(test_, "[TEST -> a@b.com] Uribe, Mánu reported a timesheet problem");
});
