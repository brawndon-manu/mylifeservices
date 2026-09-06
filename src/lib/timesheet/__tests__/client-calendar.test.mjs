// THE PER-CLIENT DAY CALENDAR, pinned: days total the corrected figures,
// flags mark the day, shifts sort by start, and the renderer survives prose
// no font can encode - the exact crash the detailed report hit in production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { clientDayModel, renderClientCalendars } from "../client-calendar-report.js";

const row = (over = {}) => ({
  who: "Bee Wye", whoLegal: "Brianna Wyatt", client: "Acuna, Jacob",
  date: "08/06/26", schedFrom: 540, schedTo: 660, billedMin: 120,
  reasons: [], review: null, authKey: "acuna-jacob",
  ...over,
});

test("a day sums its shifts and the month sums its days", () => {
  const [c] = clientDayModel([
    row(),
    row({ schedFrom: 780, schedTo: 840, billedMin: 60 }),
    row({ date: "08/13/26", billedMin: 130 }),
  ]);
  assert.equal(c.name, "Acuna, Jacob");
  assert.equal(c.days.get(6).billableMin, 180);
  assert.equal(c.days.get(13).billableMin, 130);
  assert.equal(c.totalMin, 310);
});

test("the reviewer's corrected figure replaces the billed one", () => {
  const [c] = clientDayModel([
    row({ review: { decision: "flagged", billableMin: 45 } }),
    row({ schedFrom: 780, schedTo: 840, billedMin: 60 }),
  ]);
  assert.equal(c.days.get(6).billableMin, 105);
  assert.equal(c.days.get(6).corrected, true);
  assert.equal(c.days.get(6).flagged, true);
});

test("a corrected zero still counts the day, at zero", () => {
  const [c] = clientDayModel([row({ review: { decision: "flagged", billableMin: 0 } })]);
  assert.equal(c.days.get(6).billableMin, 0);
  assert.equal(c.days.get(6).shifts.length, 1);
});

test("an approved shift does not mark the day flagged", () => {
  const [c] = clientDayModel([row({ review: { decision: "approved", billableMin: null } })]);
  assert.equal(c.days.get(6).flagged, false);
});

test("clients sort A to Z and a day's shifts sort by start", () => {
  const clients = clientDayModel([
    row({ client: "Zamora, Val" }),
    row({ schedFrom: 480, schedTo: 500 }),
    row(),
  ]);
  assert.deepEqual(clients.map((c) => c.name), ["Acuna, Jacob", "Zamora, Val"]);
  assert.deepEqual(clients[0].days.get(6).shifts.map((s) => s.from), [480, 540]);
});

test("documents speak legal names and a bare booking still lands somewhere", () => {
  const clients = clientDayModel([row({ client: null })]);
  assert.equal(clients[0].name, "No client on the booking");
  assert.equal(clients[0].days.get(6).shifts[0].who, "Brianna Wyatt");
});

test("the rendered PDF holds a calendar page and a breakdown page per client", async () => {
  const clients = clientDayModel([
    // the zero-width space that crashed the detailed report in production
    row({ whoLegal: "Bri​anna Wyatt", review: { decision: "flagged", billableMin: 90 } }),
    row({ client: "Zamora, Val" }),
  ]);
  const bytes = await renderClientCalendars({
    periodFrom: "08/01/26",
    generatedOn: "9/6/2026",
    clients,
    authorized: { "acuna-jacob": { hours: 30 } },
    authMonthLabel: "August",
  });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 4);
});
