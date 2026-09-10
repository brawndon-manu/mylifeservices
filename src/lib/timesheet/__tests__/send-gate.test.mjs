// THE PERIOD GATE ON SENDING, PINNED IN SOURCE.
//
// READ THIS IF A TEST IN HERE JUST FAILED. You have almost certainly removed the
// last thing standing between a click and every employee in a pay period being
// emailed their payroll document. Nothing else in the app enforces this.
//
// THE RULE (Mánu 2026-09-09, "fix the send gate on the server too"):
// a pay period cannot be sent until somebody has marked it final, which is the
// same thing as it being LOCKED - `batchState` reads `lockedAt` and returns
// "final" for exactly that. `sendTimesheets` refuses when the batch is unlocked
// unless the request explicitly says it means to, by posting `anyway=1`.
//
// WHY IT IS PINNED HERE RATHER THAN TRUSTED. Until 2026-09-09 the rule lived
// ONLY in `SendPanel`'s `blocked` prop - whose default is `false` - plus two
// window.confirms. A rewrite of the page that dropped the prop would have removed
// the rule with no error anywhere, and the per-row Send button never carried the
// prop at all, so one person at a time was sendable on an open period with a
// single click. Both halves are fixed; these tests are what keep them fixed.
//
// THE DOOR IS DELIBERATE AND MUST SURVIVE TOO. Payroll has needed it: of the
// eight batches ever sent, three were sent while never locked, one of them a
// 31-person day-program send. So this file does not assert that sending early is
// impossible. It asserts that going early is EXPLICIT - the server refuses unless
// the request says `anyway`, and the three places that may say it each ask a
// human first (the panel twice, the row button once, and the employee-page
// preview send, whose whole purpose is one person on the phone who cannot open
// their link).
//
// Source-read rather than executed, like break-reasons-reach-the-sheet.test.mjs:
// these are server actions and client components, and the failure being guarded
// against is a line going missing, which running the happy path cannot catch.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

const ACTIONS = read("../../../app/portal/admin/timesheets/actions.js");
const PANEL = read("../../../app/portal/admin/timesheets/_components/SendPanel.js");
const TABLE = read("../../../app/portal/admin/timesheets/_components/ReviewTable.js");
const PREVIEW = read("../../../app/t/[token]/PreviewSend.js");
const PAGE = read("../../../app/portal/admin/timesheets/[id]/page.js");

// the action is 5,000 lines; only `sendTimesheets` is the subject here
const SEND = ACTIONS.slice(
  ACTIONS.indexOf("export async function sendTimesheets"),
  ACTIONS.indexOf("export async function", ACTIONS.indexOf("export async function sendTimesheets") + 10),
);

test("the send action still asks whether the period is locked", () => {
  assert.ok(SEND.length > 500, "sendTimesheets was not found in actions.js");
  assert.match(
    SEND, /lockedAt:\s*true/,
    "sendTimesheets must SELECT lockedAt. Without the column the check below reads "
    + "undefined and every period looks unlocked, or worse, looks sendable.",
  );
  assert.match(
    SEND, /!batch\.lockedAt/,
    "sendTimesheets must refuse an unlocked period. This is the server half of the "
    + "send gate and it is the only half that cannot be removed by editing the UI.",
  );
});

test("only an explicit override gets past the gate, and it is read from the request", () => {
  assert.match(
    SEND, /formData\.get\("anyway"\)/,
    "the override has to arrive on the request. If you stop reading it, either the "
    + "gate refuses sends payroll is entitled to make, or you have replaced it with "
    + "something that cannot tell a deliberate early send from a broken UI.",
  );
  assert.match(
    SEND, /error: "notfinal"/,
    "the inline path (the per-row Send button) needs a refusal it can report. "
    + "Returning nothing makes a refused send look like a successful one.",
  );
});

test("the refusal happens before anything is emailed", () => {
  const gate = SEND.search(/!batch\.lockedAt/);
  const rows = SEND.indexOf("prisma.timesheet.findMany");
  const mail = SEND.search(/sendTimesheet\(/);
  assert.ok(gate > 0, "no gate found");
  assert.ok(
    rows === -1 || gate < rows,
    "the period check must come BEFORE the query that picks who to email, or a "
    + "refusal has already done work it should not have.",
  );
  assert.ok(
    mail === -1 || gate < mail,
    "the period check must come BEFORE anything is sent. A gate after the send "
    + "loop is not a gate.",
  );
});

test("the panel still explains the rule and still offers the door", () => {
  assert.match(PANEL, /blocked\s*=\s*false/, "SendPanel keeps its `blocked` prop");
  assert.match(PANEL, /blockedWhy/, "SendPanel keeps the sentence that says why");
  assert.match(
    PANEL, /Send anyway, before the period is closed/,
    "the override door has to stay. Payroll has needed it three times, and a wall "
    + "with no door means somebody edits the database at 6pm on payroll day.",
  );
  assert.match(
    PANEL, /name="anyway"/,
    "the panel has to POST the override, or the server refuses the very send it "
    + "just took two confirms to allow.",
  );
  assert.match(
    PANEL, /blocked && override && <input/,
    "the panel's override must be conditional on the human having taken it. An "
    + "unconditional `anyway` input disables the gate for every send.",
  );
  assert.equal(
    (PANEL.match(/window\.confirm/g) || []).length, 2,
    "both confirms stay: one about how many people, one naming what is being "
    + "overridden. They are the last two steps before real email goes out.",
  );
});

test("the per-row Send button asks before it sends an unfinished period", () => {
  assert.match(
    TABLE, /blocked = false/,
    "ReviewTable and SendOneButton keep `blocked`. Without it the row button sends "
    + "with no question while Send all beside it is shut - which is exactly the hole "
    + "that was closed on 2026-09-09.",
  );
  assert.match(
    TABLE, /if \(blocked && !window\.confirm/,
    "the row button must ask once before sending an unfinished period.",
  );
  assert.match(
    TABLE, /if \(blocked\) fd\.set\("anyway", "1"\)/,
    "and it must only claim the override when the period is actually unfinished and "
    + "the person said yes.",
  );
});

test("the override is never posted unconditionally, except by the one control that means to", () => {
  const files = [
    ["SendPanel.js", PANEL],
    ["ReviewTable.js", TABLE],
    ["[id]/page.js", PAGE],
  ];
  for (const [name, src] of files) {
    for (const line of src.split("\n")) {
      if (!/name="anyway"|\.set\("anyway"/.test(line)) continue;
      assert.match(
        line, /blocked/,
        `${name} posts the send override on a line that does not mention \`blocked\`. `
        + "An unconditional override turns the gate off silently for every send.",
      );
    }
  }
  // AND THE ONE EXCEPTION, PINNED SO IT STAYS A DECISION. The /t preview send is
  // one person on the phone who cannot open their own link, which is the case the
  // door exists for, and it already asks twice on its own.
  assert.match(
    PREVIEW, /name="anyway"/,
    "PreviewSend carries the override on purpose - see the note there. If you are "
    + "removing it, that control stops working on any period nobody has locked.",
  );
});

test("whatever renders the panel and the table hands the gate down to both", () => {
  // Asserted on the page that renders them today. If the send panel moves inside
  // another component, move this read with it - what matters is that the two
  // components are GIVEN `blocked` and `blockedWhy`, not which file does it.
  assert.match(
    PAGE, /blocked=\{/,
    "something has to pass `blocked` to SendPanel, or the panel defaults to open "
    + "and the only thing refusing is the server, with no explanation on screen.",
  );
  assert.match(PAGE, /blockedWhy=\{/, "and the sentence that says why");
  assert.ok(
    (PAGE.match(/blocked=\{/g) || []).length >= 2,
    "BOTH the panel and the review table need it. One of them having it is the "
    + "state this gate was in before 2026-09-09: Send all shut, and the Send button "
    + "on every row sending one person on a single click.",
  );
});
