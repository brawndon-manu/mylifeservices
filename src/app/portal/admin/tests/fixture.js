// WHAT THE TESTS CARD RENDERS, assembled from the fabricated sheet.
//
// SERVER ONLY, AND IT TOUCHES NOTHING. No Prisma client is imported, no Resend
// client is constructed, no fetch is made. Everything below is a pure function
// of `fixture-sheet.js` run through the same builders the real pages run.
//
// The point of the whole card: `TimesheetBreakAnswer` and `TimesheetCorrection`
// are both at zero rows, so the confirm-not-taken chain has never rendered
// against anything. `?preview=1` cannot help - it opens a real person's page
// and then REFUSES every write, so no control can be seen after it is pressed.
// These fabricated rows are what a real one would look like.
import {
  buildQuestions, signingGate, dependencyGate, questionId, patchesFor,
} from "@/lib/timesheet/questions";
import { premiumStanding, premiumsFromDays } from "@/lib/timesheet/premium-split";
import { blockTimes, serviceOf } from "@/lib/timesheet/schedule";
import { restKey, restNameFor } from "@/lib/timesheet/rests";
import { drawnBreaksFor, mealAmPmSlip } from "@/lib/timesheet/recorded-breaks";
import { buildTimesheetEmailHtml } from "@/lib/timesheet-email";
import { buildCorrectionAlertHtml } from "@/lib/timesheet-correction-email";
import { buildSignedTimesheetEmailHtml } from "@/lib/timesheet-signed-email";
import { buildReviewCorrectionsEmailHtml } from "@/lib/timesheet-review-email";
// the subjects from the dependency-free module rather than through the two
// above: the alert's file constructs a Resend client, and a preview has no
// business importing a mail client to read a string
import {
  timesheetSubject, correctionAlertSubject, signedCopySubject, reviewCorrectionsSubject,
} from "@/lib/timesheet-subjects";
import {
  FIXTURE_NAME, FIXTURE_PERIOD, FIXTURE_DAYS, FIXTURE_SCHEDULE, KIND_DATES,
  FIXTURE_RESTS as SEEDED_RESTS,
} from "./fixture-sheet";
import { SHAPE_ROWS } from "./fixture-shapes";

// the seeded rows, plus the three hand-built ones that provoke the ways a moved
// break can meet the axis which neither batch currently holds - see
// fixture-shapes.js. Kept in separate files so what is real stays obviously
// real: everything in fixture-sheet.js came off a batch, everything in
// fixture-shapes.js was written.
const FIXTURE_RESTS = [...SEEDED_RESTS, ...SHAPE_ROWS]
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));

const PERIOD_LABEL = `${FIXTURE_PERIOD.from} to ${FIXTURE_PERIOD.to}`;

// QSP's own numbered notes, so the printed Comments Details block shows a real
// list for the break reasons to continue the numbering of. Two, because a break
// reason landing at "3)" is the thing worth seeing and one note cannot show it.
const QSP_COMMENTS = [
  "1) 07/17/26 9a-1p: Reason given: Traffic on the way to the first stop",
  "2) 07/22/26 11a-12:30p: Additional stop: pharmacy",
];

// THE FABRICATED TIMESHEET, in the shape `renderSheet` and the review page both
// take. `RENDER_SELECT` is the contract: id, sourceName, data, and a batch
// carrying the period and the rest rows.
export function fixtureTimesheet() {
  const days = FIXTURE_DAYS;
  return {
    id: "tests-fixture",
    sourceName: FIXTURE_NAME,
    data: {
      days,
      payPeriod: FIXTURE_PERIOD,
      scheduleCheck: { byDate: FIXTURE_SCHEDULE },
      comments: QSP_COMMENTS,
      punchCorrections: [],
      // RECOUNTED, never carried. `renderSheet` reuses `d.premiums` on the
      // projected basis by design, so a stale figure here would print a table
      // that disagrees with the days above it.
      premiums: premiumsFromDays(days),
      generatedOn: "7/31/2026",
    },
    batch: {
      id: "tests-fixture-batch",
      periodFrom: FIXTURE_PERIOD.from,
      periodTo: FIXTURE_PERIOD.to,
      restsByDate: FIXTURE_RESTS,
    },
  };
}

// EVERY QUESTION THE FIXTURE RAISES, built by the real classifier.
//
// Not a hand-written list of question objects, and that distinction is the
// whole of this card's honesty: a fixture that stops provoking its card renders
// an empty stage, where an invented question object would happily render a
// shape the engine can no longer produce.
export function fixtureQuestions() {
  return buildQuestions(
    { days: FIXTURE_DAYS, scheduleCheck: { byDate: FIXTURE_SCHEDULE } },
    { restRows: FIXTURE_RESTS, sourceName: FIXTURE_NAME },
  );
}

// ONE CARD PER `batch`, FALLING BACK TO `questionId` - the same grouping the
// timesheet review page does, read off the same authority, so a card that is
// one card there is one card here.
export function groupQuestions(questions) {
  const cardKey = (q) => q.batch || questionId(q);
  const out = [];
  for (const q of questions) {
    const found = out.find((g) => cardKey(g[0]) === cardKey(q));
    if (found) found.push(q);
    else out.push([q]);
  }
  return out;
}

// WHAT THE RAIL LISTS. One row per kind, pointing at the group that holds it,
// with the outcomes that kind can actually land on. The counts come from the
// built questions rather than from `KIND_DATES`, so a kind the fixture stopped
// producing reads zero instead of quietly listing a card that is not there.
const OUTCOMES = {
  repair: ["open", "yes", "no"],
  restNoTimes: ["open", "yes", "no"],
  restIsMealLength: ["open", "yes", "no"],
  restOutsideScheduled: ["open", "took-then", "took-earlier", "not-taken"],
  restTooLongOffClock: ["open", "yes", "no", "wrongone"],
  miscTime: ["open", "pto", "sick", "cancelled", "worked"],
  shortMealRest: ["open", "yes", "no"],
  nothingDocumentedMeal: ["open", "yes", "no"],
  nothingDocumentedRest: ["open", "yes", "no"],
  // "yes, it really was that late" is the one that owes a sentence
  mealLate: ["open", "yes + why", "no, punch is wrong"],
};

// A RAIL ROW IS A KIND, AND A KIND CAN BE SEVERAL CARDS.
//
// This keyed off the FIRST group holding the kind, which is right only while a
// kind is one card. `repair` is one card per out-time, so the moment the fixture
// carried three of them the rail said "1 question" and the other two could not
// be opened at all - on the page whose entire purpose is that every state can be
// reached. Rows now carry every group they appear in.
//
// COUNTED PER KIND, NOT PER GROUP, for the other direction of the same problem:
// the lunch and the tens share a `batch` so they are ONE card holding both, and
// counting the group put the same figure on both rows. `shared` is what lets a
// row say so instead.
export function railRows(groups) {
  return Object.keys(KIND_DATES).map((kind) => {
    const indexes = groups
      .map((g, i) => (g.some((q) => q.kind === kind) ? i : -1))
      .filter((i) => i >= 0);
    const mine = indexes.flatMap((i) => groups[i].filter((q) => q.kind === kind));
    return {
      kind,
      indexes,
      seeded: KIND_DATES[kind],
      count: mine.length,
      cards: indexes.length,
      shared: indexes.some((i) => new Set(groups[i].map((q) => q.kind)).size > 1),
      outcomes: OUTCOMES[kind] || ["open", "yes", "no"],
    };
  });
}

// WHAT EACH ANSWER WOULD DO TO THE DAY, worked out ahead of time.
//
// The readout under a card shows the patch `patchesFor` would return, which is
// the half `?preview=1` can never reach: it refuses the write before anything
// is computed, so the one thing you want to see - what pressing that button
// actually does to the figures - is exactly what it withholds.
//
// COMPUTED HERE, ON THE SERVER, and handed down as plain data. `patchesFor`
// lives in questions.js, which reaches xls.js through rests.js, and none of
// that belongs in a browser bundle. The choices are the three a card can send:
// yes, no, and whichever third value that kind offers.
const THIRD_CHOICE = {
  restOutsideScheduled: "notaken",
  miscTime: "worked",
  restTooLongOffClock: "wrongone",
};

export function patchPreview(questions, days) {
  const dayOn = new Map((days || []).map((d) => [d.date, d]));
  const out = {};
  for (const q of questions) {
    const day = dayOn.get(q.date) || dayOn.get((q.dates || [])[0]) || null;
    const choices = ["yes", "no", THIRD_CHOICE[q.kind]].filter(Boolean);
    out[q.id] = Object.fromEntries(
      choices.map((choice) => [choice, patchesFor(q, choice, day)]),
    );
  }
  return out;
}

// everything the review page hands its two views, worked out here so the page
// and the stage cannot disagree about what a card is being shown
export function fixtureBoard() {
  const ts = fixtureTimesheet();
  const questions = fixtureQuestions();
  const groups = groupQuestions(questions);

  // WHAT THE ROSTER BOOKED EACH STRETCH AS, so the calendar can name it. Read
  // here, on the server, because `schedule.js` pulls in the pdf stack and none
  // of that belongs in a browser bundle.
  const scheduled = {};
  for (const [date, row] of Object.entries(FIXTURE_SCHEDULE)) {
    const blocks = [];
    for (const sh of row?.shifts || []) {
      const t = blockTimes(sh.text);
      const service = serviceOf(sh.text);
      if (!t || !service) continue;
      // the same AM/PM flip the review page applies - see the note there. The
      // fixture carries a 12a-12:10a rostered meal, which is how the seventeen
      // hour axis was found in the first place.
      const slip = sh.meal ? mealAmPmSlip(t.start, t.end) : null;
      blocks.push({
        from: slip ? slip.from : t.start,
        to: slip ? slip.to : t.end,
        service,
        meal: !!sh.meal,
        ...(slip ? { ampmFixed: true, wasFrom: t.start, wasTo: t.end } : null),
      });
    }
    if (blocks.length) scheduled[date] = blocks;
  }

  // the rest rows filed under this person, drawn where `drawnBreaksFor` says
  // rather than where the report recorded them - the same call the review page
  // makes, so the picture under a card agrees with the document it is about
  const mine = restKey(restNameFor(FIXTURE_NAME, ts.data));
  const dayOn = new Map(FIXTURE_DAYS.map((d) => [d.date, d]));
  const rowsByDate = {};
  for (const row of FIXTURE_RESTS) {
    if (!row.date || restKey(row.name) !== mine) continue;
    (rowsByDate[row.date] ||= []).push(row);
  }
  const restsOnRecord = {};
  for (const date of new Set([...Object.keys(rowsByDate), ...dayOn.keys()])) {
    const d = dayOn.get(date) || null;
    const blocks = drawnBreaksFor(rowsByDate[date] || [], d, {
      mealScheduled: d?.mealScheduled ?? null,
      dropped: new Set(),
    });
    if (blocks.length) restsOnRecord[date] = blocks;
  }

  return {
    days: FIXTURE_DAYS,
    groups,
    rail: railRows(groups),
    scheduled,
    restsOnRecord,
    standing: premiumStanding(FIXTURE_DAYS, []),
    gate: signingGate(questions, []),
    deps: dependencyGate(questions, []),
    patches: patchPreview(questions, FIXTURE_DAYS),
    period: PERIOD_LABEL,
    who: FIXTURE_NAME,
  };
}

// ---------------------------------------------------------------------------
// THE BREAK REASONS. Five sentences, because `employeeQuestion` writes five and
// not the one-noun-swapped-in it used to: a missed lunch, a single missed ten,
// neither of two, one of two taken, and a meal that merely started late.
//
// `mode` is what `employeeAsk` derives on the real page - "write" when nobody
// gathered a reason, "confirm" when somebody did and the employee has not
// checked it yet. The third shape, where they say our wording is wrong and give
// theirs, is client state inside BreakReason and is reached by pressing the
// button rather than by picking it here.
const OURS = "Client would not settle and I could not leave them.";

function ask(over) {
  return {
    findingKey: `${over.kind}|${over.date}`,
    date: over.date,
    reason: null,
    confirmedAt: null,
    confirmedText: null,
    takenCount: 0,
    missingCount: 1,
    lateMinutes: null,
    ...over,
  };
}

export const BREAK_ASKS = [
  {
    label: "A missed lunch, nobody gathered a reason",
    note: "write · the employee writes their own",
    ask: ask({ kind: "meal", date: "07/16/26", answer: "not-taken", mode: "write" }),
  },
  {
    label: "A missed lunch, we took a reason on the phone",
    note: "confirm · our wording read back to them",
    ask: ask({
      kind: "meal", date: "07/17/26", answer: "not-taken", mode: "confirm",
      reason: OURS, via: "phone",
    }),
  },
  {
    label: "The one ten of the day, missed",
    note: "write · one rest owed, none taken",
    ask: ask({
      kind: "rest", date: "07/18/26", answer: "not-taken", mode: "write",
      missingCount: 1, takenCount: 0,
    }),
  },
  {
    label: "Neither of two rest breaks",
    note: "confirm · the plural sentence",
    ask: ask({
      kind: "rest", date: "07/20/26", answer: "not-taken", mode: "confirm",
      missingCount: 2, takenCount: 0,
      reason: "Back-to-back clients with no cover to step away.", via: "phone",
    }),
  },
  {
    label: "One of two taken, one missed",
    note: "write · the count is the whole sentence",
    ask: ask({
      kind: "rest", date: "07/21/26", answer: "took-it", mode: "write",
      missingCount: 2, takenCount: 1,
    }),
  },
  {
    label: "A meal that started late",
    note: "confirm · asks what held it up, not whether they took it",
    ask: ask({
      kind: "meal-late", date: "07/22/26", answer: "not-taken", mode: "confirm",
      reason: "The client's family arrived and I stayed through the handover.",
      via: "in-person", lateMinutes: 330,
    }),
  },
  {
    label: "None of three rest breaks",
    note: "write · a shape no batch has produced yet",
    ask: ask({
      kind: "rest", date: "07/23/26", answer: "not-taken", mode: "write",
      missingCount: 3, takenCount: 0,
    }),
  },
];

// the reasons as they would reach the printed sheet, so the Comments Details
// block can be seen carrying both sides
export const FIXTURE_BREAK_REASONS = [
  {
    answer: "not-taken", kind: "meal", date: "07/17/26",
    reason: OURS,
    confirmedText: OURS,
  },
  {
    answer: "not-taken", kind: "rest", date: "07/20/26",
    reason: "Back-to-back clients with no cover to step away.",
    confirmedText: "I had two clients back to back and nobody could cover me.",
  },
  {
    answer: "not-taken", kind: "meal", date: "07/24/26",
    reason: null,
    confirmedText: "I ate at the wheel between stops so I did not clock out.",
  },
];

// ---------------------------------------------------------------------------
// THE FIVE EMAILS. Rendered by the same builders that render the ones we send,
// with the same subject functions, so nothing here can drift from what goes out
// without the preview drifting with it.
const SIGN_URL = "https://www.mylifeservicesinc.com/t/example-token";
const BATCH_URL = "https://www.mylifeservicesinc.com/portal/admin/timesheets/example-batch";
const TESTER = "payroll.tester@mylifeservicesinc.com";

const ALERT_ITEMS = [
  { date: "07/20/26", kind: "hours", claimedHours: 8.5, note: "I clocked out at 5, not 4." },
  { date: "07/22/26", kind: "day_missing", note: "I worked the 22nd and it is not on here." },
  { date: null, kind: "rest_missed", note: null },
];

// WHAT A FINISHED REVIEW LOOKS LIKE, in `reviewChoices` shape: each answer with
// the record facts it produced, and the action that belongs to the office.
//
// WRITTEN, NOT DERIVED, and that is the point of it being here. Running
// `reviewChoices` over the fabricated sheet would show whatever that sheet
// happens to hold; these are the four shapes the two emails have to survive -
// a break with nothing recorded for it, a recorded time the employee moved, an
// answer that changes nothing in QuickSolve, and the backwards entry, which has
// no receipt sentence and carries its facts alone.
//
// The sentences are the real ones, copied from qsp-changes.js. A preview whose
// job is to show what goes out must not paraphrase what goes out.
const REVIEW_ITEMS = [
  {
    date: "07/17/26",
    said: "You said you did not get your rest periods that day.",
    changes: [],
  },
  {
    date: "07/20/26",
    said: "You said you took your rest periods and did not write them down, at 11:30a to 11:40a.",
    changes: [{
      fact: "The rest break taken from 11:30a to 11:40a has nothing recorded for it.",
      action: "Log it.",
    }],
  },
  {
    date: "07/22/26",
    said: null,
    changes: [{
      fact: "The rest entry around 12:15p is recorded backwards - its out and in times are swapped.",
      action: "Swap them so it reads the right way round.",
    }],
  },
  {
    date: "07/24/26",
    said: "You said the recorded time was wrong, and gave 11:50a to 12p instead.",
    changes: [{
      fact: "The rest break recorded 12p to 12:10p actually happened 11:50a to 12p.",
      action: "Change the entry to match.",
    }],
  },
];

// what the toggles on the stage can change, and nothing else. Each variant is
// built here rather than in the browser because both builders read process.env
// for the logo and the base url.
export function emailVariants() {
  const employeeName = "Mánu";
  const message = "Payroll closes Thursday. Anything you have not answered stays as it is.";
  const dueAt = "August 4, 2026";

  const employee = ({ isResend, test, withMessage, withDue }) => ({
    subject: timesheetSubject({
      periodLabel: PERIOD_LABEL,
      isResend,
      redirectedFrom: test ? TESTER : null,
    }),
    html: buildTimesheetEmailHtml({
      employeeName,
      periodLabel: PERIOD_LABEL,
      message: withMessage ? message : null,
      dueAt: withDue ? dueAt : null,
      signUrl: SIGN_URL,
      redirectedFrom: test ? TESTER : null,
    }),
  });

  // THE SIGNED COPY BACK TO THEM. Facts only - the actions belong to the office
  // - and `noFixes` is the clean review: answers on record, nothing to change.
  const signed = ({ test, noFixes }) => ({
    subject: signedCopySubject({
      periodLabel: PERIOD_LABEL,
      redirectedFrom: test ? TESTER : null,
    }),
    html: buildSignedTimesheetEmailHtml({
      employeeName,
      periodLabel: PERIOD_LABEL,
      items: noFixes
        ? REVIEW_ITEMS.filter((it) => !it.changes.length)
        : REVIEW_ITEMS,
      redirectedFrom: test ? TESTER : null,
    }),
  });

  // THE SAME REVIEW GOING TO THE OFFICE, with the edits to make. `attached` is
  // the signed PDF riding along, which is the ordinary case - the send only
  // drops it if the bytes never arrived.
  const office = ({ test, noAttachment }) => ({
    subject: reviewCorrectionsSubject({
      employeeName: FIXTURE_NAME,
      periodLabel: PERIOD_LABEL,
      redirectedFrom: test ? TESTER : null,
    }),
    html: buildReviewCorrectionsEmailHtml({
      employeeName: FIXTURE_NAME,
      periodLabel: PERIOD_LABEL,
      items: REVIEW_ITEMS,
      batchUrl: BATCH_URL,
      attached: !noAttachment,
      redirectedFrom: test ? TESTER : null,
    }),
  });

  const alert = ({ test, oneItem }) => ({
    subject: correctionAlertSubject({
      employeeName: FIXTURE_NAME,
      redirectedFrom: test ? TESTER : null,
    }),
    html: buildCorrectionAlertHtml({
      employeeName: FIXTURE_NAME,
      periodLabel: PERIOD_LABEL,
      items: oneItem ? ALERT_ITEMS.slice(0, 1) : ALERT_ITEMS,
      reviewUrl: "https://www.mylifeservicesinc.com/portal/admin/timesheets",
      redirectedFrom: test ? TESTER : null,
    }),
  });

  return {
    review: {
      name: "Timesheet to review",
      goesTo: "the employee · first send",
      toggles: ["test", "withMessage", "withDue"],
      // every combination the toggles can reach, keyed so the client can pick
      // one without a server round trip
      states: Object.fromEntries(
        [false, true].flatMap((test) =>
          [false, true].flatMap((withMessage) =>
            [false, true].map((withDue) => [
              `${+test}${+withMessage}${+withDue}`,
              employee({ isResend: false, test, withMessage, withDue }),
            ]),
          ),
        ),
      ),
    },
    reminder: {
      name: "Signing reminder",
      goesTo: "the employee · every send after the first",
      toggles: ["test", "withMessage", "withDue"],
      // SAME BODY AS THE ONE ABOVE. `buildTimesheetEmailHtml` takes no
      // `isResend` - only the subject differs, which is what stops Gmail
      // collapsing the repeat behind "Show trimmed content". Worth seeing side
      // by side rather than worth hiding.
      states: Object.fromEntries(
        [false, true].flatMap((test) =>
          [false, true].flatMap((withMessage) =>
            [false, true].map((withDue) => [
              `${+test}${+withMessage}${+withDue}`,
              employee({ isResend: true, test, withMessage, withDue }),
            ]),
          ),
        ),
      ),
    },
    signed: {
      name: "Signed copy",
      goesTo: "the employee · the moment they sign",
      toggles: ["test", "noFixes"],
      states: Object.fromEntries(
        [false, true].flatMap((test) =>
          [false, true].map((noFixes) => [
            `${+test}${+noFixes}`,
            signed({ test, noFixes }),
          ]),
        ),
      ),
    },
    office: {
      name: "Corrections to the office",
      goesTo: "Gabriel, cc Kristy · April · David",
      toggles: ["test", "noAttachment"],
      states: Object.fromEntries(
        [false, true].flatMap((test) =>
          [false, true].map((noAttachment) => [
            `${+test}${+noAttachment}`,
            office({ test, noAttachment }),
          ]),
        ),
      ),
    },
    alert: {
      name: "Problem alert",
      goesTo: "us · they reported something from their review page",
      toggles: ["test", "oneItem"],
      states: Object.fromEntries(
        [false, true].flatMap((test) =>
          [false, true].map((oneItem) => [
            `${+test}${+oneItem}`,
            alert({ test, oneItem }),
          ]),
        ),
      ),
    },
  };
}
