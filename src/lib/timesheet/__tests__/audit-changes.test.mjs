// THE DELTA BETWEEN TWO AUDIT COPIES, pinned. The dangerous edges: a day only
// one copy covers is not a change, minute-identical shifts stay silent, a
// vanished shift keeps its identity, and a decided shift whose facts moved
// goes back in the flagged pile with the reviewer's verdict surviving inside
// the reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { diffAuditRows, periodOverlap, adjustedAfterReviewPlan, noteChangesPlan } from "../audit-changes.js";

const row = (over = {}) => ({
  shiftKey: "k1", who: "Bee Wye", whoLegal: "Brianna Wyatt", date: "08/20/26",
  client: "Acuna, Jacob", billedMin: 240, clockedMin: 240,
  note: { words: 50, summary: "walked to the bank", source: "dsn" }, scheduleNote: null,
  ...over,
});

test("the overlap of two ranges is the days both cover", () => {
  assert.deepEqual(
    periodOverlap({ from: "08/16/26", to: "08/31/26" }, { from: "08/01/26", to: "08/31/26" }),
    { from: "08/16/26", to: "08/31/26" },
  );
  assert.equal(periodOverlap({ from: "08/01/26", to: "08/15/26" }, { from: "09/01/26", to: "09/15/26" }), null);
});

test("moved hours and grown notes mark a change; identical shifts stay silent", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const oldRows = [row(), row({ shiftKey: "k2", billedMin: 120 }), row({ shiftKey: "k3", note: null })];
  const newRows = [
    row(),                                            // untouched
    row({ shiftKey: "k2", billedMin: 150 }),          // hours moved
    row({ shiftKey: "k3", note: { words: 40 } }),     // note appeared
    row({ shiftKey: "k4" }),                          // new on a covered day
  ];
  const { changed, details, gone } = diffAuditRows(oldRows, newRows, overlap);
  assert.equal(changed.k1, undefined);
  assert.deepEqual(changed.k2, ["hours"]);
  assert.equal(details.k2, "billed 2.00h → 2.50h");
  assert.deepEqual(changed.k3, ["note"]);
  assert.deepEqual(changed.k4, ["new"]);
  assert.deepEqual(gone, []);
});

test("a day the old copy never covered is new territory, not a change", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const { changed } = diffAuditRows([], [row({ shiftKey: "early", date: "08/05/26" })], overlap);
  assert.deepEqual(changed, {});
});

test("a note that grew and hours that moved stack on one shift", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const { changed, details } = diffAuditRows(
    [row({ note: { words: 10 }, clockedMin: 200 })],
    [row({ note: { words: 60 }, clockedMin: 240 })],
    overlap,
  );
  assert.deepEqual(changed.k1, ["hours", "note"]);
  assert.match(details.k1, /clocked 3\.33h → 4\.00h/);
  assert.match(details.k1, /changed \(10 → 60 words\)/);
});

test("a note that vanished or shrank is a change now, not silence", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const { changed, details } = diffAuditRows(
    [row(), row({ shiftKey: "k2", note: { words: 80, summary: "s", source: "dsn" } })],
    [row({ note: null }), row({ shiftKey: "k2", note: { words: 30, summary: "s", source: "dsn" } })],
    overlap,
  );
  assert.deepEqual(changed.k1, ["note-gone"]);
  assert.equal(details.k1, "DSN note gone (was 50 words)");
  assert.deepEqual(changed.k2, ["note"]);
  assert.equal(details.k2, "DSN note changed (80 → 30 words)");
});

test("same words but different opening is a reword; schedule notes count both ways", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const { changed, details } = diffAuditRows(
    [row({ note: { words: 50, summary: "walked to the bank", source: "xls" }, scheduleNote: { text: "cancelled" } }),
      row({ shiftKey: "k2", scheduleNote: null })],
    [row({ note: { words: 50, summary: "drove to the office", source: "xls" }, scheduleNote: null }),
      row({ shiftKey: "k2", scheduleNote: { text: "makeup visit" } })],
    overlap,
  );
  assert.deepEqual(changed.k1.sort(), ["note", "note-gone"]);
  assert.match(details.k1, /service note reworded/);
  assert.match(details.k1, /schedule note gone/);
  assert.deepEqual(changed.k2, ["note"]);
  assert.equal(details.k2, "schedule note added");
});

test("a vanished shift keeps its identity for the screen and the re-flag", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const { changed, gone } = diffAuditRows([row()], [], overlap);
  assert.deepEqual(changed, {});
  assert.equal(gone.length, 1);
  assert.equal(gone[0].shiftKey, "k1");
  assert.equal(gone[0].whoLegal, "Brianna Wyatt");
  assert.equal(gone[0].billedMin, 240);
});

// ---- the flips: decided shifts whose facts moved ----

const review = (over = {}) => ({
  shiftKey: "k1", decision: "approved", reason: null, decidedBy: { name: "Brandon Uribe" },
  ...over,
});

test("an approved shift that changed flips to flagged and says what moved", () => {
  const flips = adjustedAfterReviewPlan(
    { changed: { k1: ["hours"] }, details: { k1: "billed 2.25h → 3.00h" }, gone: [] },
    [review()],
  );
  assert.deepEqual(flips, [{
    shiftKey: "k1",
    reason: "Auto: changed after review (billed 2.25h → 3.00h). Was approved by Brandon Uribe.",
  }]);
});

test("a flagged shift keeps the reviewer's words inside the new reason", () => {
  const flips = adjustedAfterReviewPlan(
    { changed: { k1: ["note-gone"] }, details: { k1: "DSN note gone (was 208 words)" }, gone: [] },
    [review({ decision: "flagged", reason: "no clock out" })],
  );
  assert.equal(
    flips[0].reason,
    'Auto: changed after review (DSN note gone (was 208 words)). Earlier flag: "no clock out"',
  );
});

test("an undecided shift that changed is left alone", () => {
  const flips = adjustedAfterReviewPlan(
    { changed: { k9: ["hours"] }, details: { k9: "billed 1.00h → 2.00h" }, gone: [] },
    [review()],
  );
  assert.deepEqual(flips, []);
});

test("a reviewed shift that vanished flips with the verdict carried", () => {
  const flips = adjustedAfterReviewPlan(
    { changed: {}, details: {}, gone: [{ shiftKey: "k1" }, { shiftKey: "k8" }] },
    [review()],
  );
  assert.deepEqual(flips, [{
    shiftKey: "k1",
    reason: "Auto: gone from the latest upload. Was approved by Brandon Uribe.",
  }]);
});

test("a second flip refreshes the change and carries the closing, never nests", () => {
  const first = adjustedAfterReviewPlan(
    { changed: { k1: ["hours"] }, details: { k1: "billed 2.25h → 3.00h" }, gone: [] },
    [review({ decision: "flagged", reason: "looks double booked" })],
  )[0];
  const second = adjustedAfterReviewPlan(
    { changed: { k1: ["hours"] }, details: { k1: "billed 3.00h → 1.50h" }, gone: [] },
    [review({ decision: "flagged", reason: first.reason })],
  )[0];
  assert.equal(
    second.reason,
    'Auto: changed after review (billed 3.00h → 1.50h). Earlier flag: "looks double booked"',
  );
});

// ---- the 09/07 split: notes inform, times flip ----

test("a note merely added or edited does not flip the decision", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const diff = diffAuditRows(
    [row({ note: null }), row({ shiftKey: "k2", note: { words: 10, summary: "s", source: "xls" } })],
    [row({ note: { words: 42, summary: "walked", source: "dsn" } }),
      row({ shiftKey: "k2", note: { words: 30, summary: "s", source: "xls" } })],
    overlap,
  );
  const flips = adjustedAfterReviewPlan(diff, [review(), review({ shiftKey: "k2" })]);
  assert.deepEqual(flips, []);
});

test("the note additions land in the ledger with the shift's identity", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const newRows = [
    row({ employeeKey: "bee wye", note: { words: 42, summary: "walked", source: "dsn" }, scheduleNote: { text: "makeup" } }),
  ];
  const diff = diffAuditRows([row({ note: null, scheduleNote: null })], newRows, overlap);
  const ledger = noteChangesPlan(diff, newRows, [review({ decision: "flagged", reason: "look" })]);
  assert.equal(ledger.length, 2);
  assert.deepEqual(ledger.map((e) => e.kind).sort(), ["schedule", "service"]);
  const service = ledger.find((e) => e.kind === "service");
  assert.equal(service.detail, "DSN note added (42 words)");
  assert.equal(service.who, "Bee Wye");
  assert.equal(service.whoLegal, "Brianna Wyatt");
  assert.equal(service.decision, "flagged");
  assert.equal(service.billedMin, 240);
});

test("an undecided shift's new note stays out of the ledger", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const newRows = [row({ note: { words: 42, summary: "walked", source: "dsn" } })];
  const diff = diffAuditRows([row({ note: null })], newRows, overlap);
  assert.deepEqual(noteChangesPlan(diff, newRows, []), []);
});

test("a vanished note still flips even with a fresh note beside it elsewhere", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const diff = diffAuditRows(
    [row({ scheduleNote: { text: "cancelled" } })],
    [row({ scheduleNote: null, note: { words: 60, summary: "walked", source: "dsn" } })],
    overlap,
  );
  const flips = adjustedAfterReviewPlan(diff, [review()]);
  assert.equal(flips.length, 1);
  assert.match(flips[0].reason, /schedule note gone/);
});

test("billed landing on the reviewer's corrected figure is the report catching up, not a flip", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const diff = diffAuditRows(
    [row({ billedMin: 240 })],
    [row({ billedMin: 180 })],
    overlap,
  );
  const flips = adjustedAfterReviewPlan(diff, [review({ billableMin: 180 })]);
  assert.deepEqual(flips, []);
});

test("billed matching the correction while the clock also moved still flips", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const diff = diffAuditRows(
    [row({ billedMin: 240, clockedMin: 240 })],
    [row({ billedMin: 180, clockedMin: 180 })],
    overlap,
  );
  const flips = adjustedAfterReviewPlan(diff, [review({ billableMin: 180 })]);
  assert.equal(flips.length, 1);
  assert.match(flips[0].reason, /clocked/);
});

test("a reviewed shift that came back wears that instead of a change list", () => {
  const flips = adjustedAfterReviewPlan(
    { changed: { k1: ["new"] }, details: { k1: "appeared on a day the previous copy already covered" }, gone: [] },
    [review({ decision: "flagged", reason: "Auto: gone from the latest upload. Was approved by Brandon Uribe." })],
  );
  assert.equal(flips[0].reason, "Auto: back in the upload. Was approved by Brandon Uribe.");
});

test("the roster landing on the window a clock amendment was signed for is the report catching up, not a flip", () => {
  const overlap = { from: "08/16/26", to: "08/31/26" };
  const amendment = { min: 138, timesChanged: true };
  const oldRows = [row({ billedMin: 150, clockedMin: 138, amendment })];
  const newRows = [row({ billedMin: 138, clockedMin: 138, amendment })];
  const diff = diffAuditRows(oldRows, newRows, overlap);
  assert.deepEqual(diff.changed.k1, ["hours"]);
  assert.equal(diff.figures.k1.amendedMin, 138);
  assert.deepEqual(adjustedAfterReviewPlan(diff, [review()]), []);
  // landing anywhere else is still a move
  const elsewhere = diffAuditRows(oldRows, [row({ billedMin: 120, clockedMin: 138, amendment })], overlap);
  assert.equal(adjustedAfterReviewPlan(elsewhere, [review()]).length, 1);
});

// ---------------------------------------------------- the move a flip recorded

test("a flip's own words read back to the exact minutes, every minute of a day", async () => {
  const { movedFiguresOf } = await import("../audit-changes.js");
  for (let from = 0; from <= 1440; from++) {
    const to = (from * 7) % 1441;
    const plan = adjustedAfterReviewPlan(
      diffAuditRows([row({ billedMin: from })], [row({ billedMin: to })], { from: "08/16/26", to: "08/31/26" }),
      [{ shiftKey: "k1", decision: "approved", decidedBy: { name: "Brianna Wyatt" } }],
    );
    if (from === to) continue;
    const moved = movedFiguresOf(plan[0].reason);
    assert.deepEqual(moved.billed, { from, to }, `minute ${from} -> ${to}`);
    assert.equal(moved.clocked, null);
  }
});

test("the move is read out of the flip's words only, never out of the verdict it carries", async () => {
  const { movedFiguresOf } = await import("../audit-changes.js");
  assert.deepEqual(
    movedFiguresOf("Auto: changed after review (billed 2.00h → 2.57h). Was approved by Brianna Wyatt."),
    { billed: { from: 120, to: 154 }, clocked: null },
  );
  // a clock row arriving, next to a note, both parenthesised
  assert.deepEqual(
    movedFiguresOf("Auto: changed after review (billed 2.50h → 2.83h; clocked none → 2.83h; DSN note added (17 words)). Earlier flag: \"Auto: no clock out.\""),
    { billed: { from: 150, to: 170 }, clocked: { from: null, to: 170 } },
  );
  // an earlier flag quoting figures of its own is not the move
  assert.deepEqual(
    movedFiguresOf("Auto: changed after review (schedule note changed). Earlier flag: \"billed 3.00h → 2.00h per the office\""),
    null,
  );
  assert.equal(movedFiguresOf("Auto: back in the upload. Was approved by Brianna Wyatt."), null);
  assert.equal(movedFiguresOf("billed 2.00h → 2.57h"), null);
  assert.equal(movedFiguresOf(null), null);
});

test("a flipped shift whose time came back to the reviewed figure hands back the copy in between", async () => {
  const { flipReturnOf } = await import("../audit-changes.js");
  const review = (over = {}) => ({
    decision: "flagged",
    reason: "Auto: changed after review (billed 2.00h → 2.57h). Was approved by Brianna Wyatt.",
    wasBilledMin: 154, wasClockedMin: 154,
    ...over,
  });
  const card = (over = {}) => ({ billedMin: 154, clockedMin: 154, review: review(), ...over });
  // approved at 2.57, the copy before read 2.00, the newest is back at 2.57
  assert.deepEqual(flipReturnOf(card()), { billedMin: 120, clockedMin: 154 });
  // the ordinary moved case is the plain side by side's, not this
  assert.equal(flipReturnOf(card({ review: review({ wasBilledMin: 120 }) })), null);
  // a move that no longer ends on today's figure says nothing about today
  assert.equal(flipReturnOf(card({ billedMin: 160, review: review({ wasBilledMin: 160, wasClockedMin: 154 }) })), null);
  // a person's own flag, an approval, no review, no frozen reading
  assert.equal(flipReturnOf(card({ review: review({ reason: "check the times" }) })), null);
  assert.equal(flipReturnOf(card({ review: review({ decision: "approved" }) })), null);
  assert.equal(flipReturnOf(card({ review: null })), null);
  assert.equal(flipReturnOf(card({ review: review({ wasBilledMin: null }) })), null);
  // a clocked-only move keeps the billed figure where it stands
  assert.deepEqual(
    flipReturnOf(card({ billedMin: 60, clockedMin: 60, review: review({ reason: "Auto: changed after review (clocked none → 1.00h; service note added (62 words)). Earlier flag: \"x\"", wasBilledMin: 60, wasClockedMin: 60 }) })),
    { billedMin: 60, clockedMin: null },
  );
});

test("the cards and focused review open the side by side on a came-back flip, with the copy in between", () => {
  const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  const cards = read("src/app/portal/admin/audit/[id]/AuditCards.js");
  assert.match(cards, /const back = !settled && !reviewMoved\(r\) \? flipReturnOf\(r\) : null;/);
  assert.match(cards, /const moved = !settled && \(reviewMoved\(r\) \|\| !!back\);/);
  assert.match(cards, /previous=\{back\}/);
  const study = read("src/app/portal/admin/audit/[id]/StudyMode.js");
  assert.match(study, /const comparing = \(row\) => reviewMoved\(row\) \|\| !!flipReturnOf\(row\);/);
  assert.match(study, /!flagging && comparing\(row\) &&/);
  assert.match(study, /\{!comparing\(row\) && <button/);
  const compare = read("src/app/portal/admin/audit/[id]/TimeCompare.js");
  assert.match(compare, /Previous copy/);
  assert.match(compare, /The newest copy is back to the time that was reviewed\./);
  // one button when both would bill the same figure
  assert.match(compare, /reviewedFigure != null && !sameFigure && \(/);
});
