// THE MONTH PER CLIENT, pinned. the edges that matter: a day program line
// never joins a client's ils hours, an addendum and a review correction each
// move billed and say which, a client with no shift still owes its hours, one
// client over takes nothing from the others, and the build, the sidebar and
// the page are wired to the same rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { clientMonthModel, countsAgainstAuthorization, serviceLabelOf } from "../client-month.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("only ils and self determination lines count against an authorization", () => {
  assert.equal(countsAgainstAuthorization("ILS POS (520 Monthly)"), true);
  assert.equal(countsAgainstAuthorization("Self Determination Program"), true);
  assert.equal(countsAgainstAuthorization("Day Program"), false);
  assert.equal(countsAgainstAuthorization(""), false);
  assert.equal(countsAgainstAuthorization(null), false);
  assert.equal(serviceLabelOf("ILS POS (520 Monthly)"), "ILS");
  assert.equal(serviceLabelOf("Self Determination Program"), "Self Determination");
});

const shift = (client, authKey, billedMin, over = {}) => ({
  client, authKey, billedMin, service: "ILS Service", who: "Dana Whitfield", date: "09/02/26", shiftKey: `${authKey}|${billedMin}`, ...over,
});
const auth = (clientName, clientKey, serviceType, authorizedHours, caseManagerName = null) => ({
  clientName, clientKey, serviceType, authorizedHours, caseManagerName,
});

const model = () => clientMonthModel({
  authLines: [
    auth("Rivera, Ana", "ana rivera", "ILS POS (520 Monthly)", 15, "Whitfield, Dana"),
    auth("Rivera, Ana", "ana rivera", "Day Program", 130),
    auth("Moss, Theo", "moss theo", "ILS POS (520 Monthly)", 15),
    auth("Lane, Iris", "iris lane", "ILS POS (520 Monthly)", 10),
    auth("Park, June", "june park", "ILS POS (520 Monthly)", 15),
    auth("Vance, Cole", "cole vance", "ILS POS (520 Monthly)", 15),
    auth("Hale, Nora", "hale nora", "Self Determination Program", 20),
  ],
  rows: [
    shift("Rivera, Ana", "ana rivera", 210),
    shift("Rivera, Ana", "ana rivera", 180),
    shift("Rivera, Ana", "ana rivera", 202),
    shift("Moss, Theo", "moss theo", 83, { amendment: { timesChanged: true, min: 138, from: 105, to: 243, at: "2026-09-23T18:00:00.000Z", by: "Brianna Wyatt" } }),
    shift("Lane, Iris", "iris lane", 150, { review: { decision: "flagged", billableMin: 0, lastAt: "2026-09-10T00:00:00.000Z" } }),
    shift("Vance, Cole", "cole vance", 937),
    shift("Hale, Nora", "hale nora", 600, { service: "Self Determination Program" }),
    shift("Quinn, Remy", "quinn remy", 316),
    shift(null, null, 150),
  ],
});

test("a day program line never joins the client's ils hours", () => {
  const b = model().lines.find((l) => l.name === "Rivera, Ana");
  assert.equal(b.authorizedMin, 900);
  assert.equal(b.billableMin, 592);
  assert.equal(b.remainingMin, 308);
  assert.equal(b.usedPct, 66);
  assert.deepEqual(b.services, ["ILS"]);
  assert.equal(b.caseManager, "Whitfield, Dana");
});

test("an addendum and a review correction each move billed, and say which moved it", () => {
  const { lines } = model();
  const p = lines.find((l) => l.name === "Moss, Theo");
  assert.equal(p.billedMin, 83);
  assert.equal(p.billableMin, 138);
  assert.equal(p.addenda, 1);
  assert.equal(p.addendumMin, 55);
  assert.equal(p.reviews, 0);
  const z = lines.find((l) => l.name === "Lane, Iris");
  assert.equal(z.billableMin, 0);
  assert.equal(z.reviews, 1);
  assert.equal(z.reviewMin, -150);
  assert.equal(z.remainingMin, 600);
});

test("unbilled, over and unauthorized clients each keep their own balance", () => {
  const { lines, totals, noClient } = model();
  const a = lines.find((l) => l.name === "Park, June");
  assert.equal(a.rows.length, 0);
  assert.equal(a.remainingMin, 900);
  const v = lines.find((l) => l.name === "Vance, Cole");
  assert.equal(v.remainingMin, -37);
  assert.equal(v.usedPct, 104);
  const g = lines.find((l) => l.name === "Quinn, Remy");
  assert.equal(g.authorizedMin, null);
  assert.equal(g.remainingMin, null);
  assert.equal(g.usedPct, null);
  assert.deepEqual(noClient, { shifts: 1, billableMin: 150 });
  assert.equal(totals.over, 1);
  assert.equal(totals.overMin, 37);
  assert.equal(totals.none, 1);
  assert.equal(totals.noAuth, 1);
  assert.equal(totals.noAuthMin, 316);
  // hours left is the sum of each client's own balance, never netted
  assert.equal(totals.leftMin, 308 + 762 + 600 + 900 + 600);
  // qsp billed + addenda + review corrections = billed, the page's own line
  assert.equal(totals.billedMin + totals.addendumMin + totals.reviewMin, totals.billableMin);
  assert.equal(totals.authorizedMin, 900 * 4 + 600 + 1200);
});

test("the build, the sidebar and the page read the one rule", () => {
  const build = read("src/app/portal/admin/audit/[id]/build.js");
  assert.match(build, /const authRows = reportRows\.filter\(\(a\) => countsAgainstAuthorization\(a\.serviceType\)\);/);
  assert.match(build, /authLines,\s*authLeftOut,\s*authUploadedAt,/);
  const nav = read("src/app/portal/admin/audit/AuditWorkspace.js");
  assert.equal((nav.match(/\["hours", "Client hours", Hourglass\]/g) || []).length, 2, "the item sits in both the current and the frozen sidebar");
  const cards = read("src/app/portal/admin/audit/[id]/AuditCards.js");
  assert.match(cards, /view === "hours" \? \(/);
  assert.match(cards, /<ClientHours rows=\{rows\} month=\{month\} monthLabel=\{authMonthLabel\} \/>/);
  assert.match(cards, /\["orphans", "lost", "reports", "newnotes", "hours"\]\.includes\(view\)/);
  const page = read("src/app/portal/admin/audit/[id]/ClientHours.js");
  assert.match(page, /clientMonthModel\(\{ rows, authLines: month\?\.lines \|\| \[\], planned \}\)/);
  assert.match(page, /billableOf/);
});

// ------------------------------------------------ the calendar after the copy

const plannedModel = () => clientMonthModel({
  authLines: [
    auth("Rivera, Ana", "ana rivera", "ILS POS (520 Monthly)", 15),
    auth("Moss, Theo", "moss theo", "ILS POS (520 Monthly)", 15),
    auth("Vance, Cole", "cole vance", "ILS POS (520 Monthly)", 15),
    auth("Park, June", "june park", "ILS POS (520 Monthly)", 15),
    auth("Lane, Iris", "iris lane", "ILS POS (520 Monthly)", 10),
  ],
  rows: [
    shift("Rivera, Ana", "ana rivera", 592),
    // an addendum takes 83 billed to 138: billed moves, and so does what's left
    shift("Moss, Theo", "moss theo", 83, { amendment: { timesChanged: true, min: 138, at: "2026-09-23T18:00:00.000Z" } }),
    shift("Vance, Cole", "cole vance", 937),
    shift("Quinn, Remy", "quinn remy", 316),
  ],
  planned: {
    shifts: [
      { key: "ana rivera", date: "09/23/26", from: 600, to: 720, min: 120, who: "Dana Whitfield" },
      { key: "moss theo", date: "09/24/26", from: 600, to: 1400, min: 800, who: "Dana Whitfield" },
      { key: "quinn remy", date: "09/25/26", from: 600, to: 900, min: 300, who: "Dana Whitfield" },
      { key: "nobody here", date: "09/26/26", from: 600, to: 660, min: 60, who: "Dana Whitfield" },
    ],
  },
});

test("unscheduled is authorized less billed less scheduled, with the addenda and review corrections already in billed", () => {
  const { lines } = plannedModel();
  const a = lines.find((l) => l.name === "Rivera, Ana");
  assert.equal(a.plannedMin, 120);
  assert.equal(a.unscheduledMin, 900 - 592 - 120);
  const m = lines.find((l) => l.name === "Moss, Theo");
  // the addendum's 138, not the roster's 83, and 800 on the calendar: past it
  assert.equal(m.billableMin, 138);
  assert.equal(m.unscheduledMin, 900 - 138 - 800);
});

test("booked past, over, nothing scheduled and a client with no authorization each read apart", () => {
  const { lines, totals, unmatched } = plannedModel();
  // Moss is not over yet but the calendar takes him 38 past; Vance is over already
  assert.equal(totals.booked, 1);
  assert.equal(totals.over, 1);
  assert.equal(totals.pastMin, 38 + 37);
  // Park has nothing billed and nothing on the calendar; Lane neither
  assert.equal(totals.nothing, 2);
  // Quinn has no authorization, and still carries the shifts scheduled for her
  const q = lines.find((l) => l.name === "Quinn, Remy");
  assert.equal(q.plannedMin, 300);
  assert.equal(q.unscheduledMin, null);
  // every scheduled minute is somewhere: on a line, or counted apart
  assert.equal(totals.plannedMin, 120 + 800 + 300);
  assert.deepEqual(unmatched, { shifts: 1, min: 60 });
  // unscheduled sums each client's own balance, never netting one client's
  // overbooking against another's room
  assert.equal(totals.unscheduledMin, (900 - 592 - 120) + 900 + 600);
});

test("the page reads the schedule only for the audit page, and shows the six figures asked for", () => {
  const build = read("src/app/portal/admin/audit/[id]/build.js");
  assert.match(build, /export async function buildAudit\(id, \{ planned = false \} = \{\}\)/);
  assert.match(build, /const scheduleRead = planned && batch\.scheduleUrl \? readMonthSchedule\(batch\.scheduleUrl\) : null;/);
  assert.match(build, /plannedFromSchedule\(await scheduleRead, \{\s*through: window\.to, rows: inWindow, authLines, whoKey, initialKey: clientKey,\s*\}\)/);
  const route = read("src/app/portal/admin/audit/[id]/page.js");
  assert.match(route, /buildAudit\(id, \{ planned: true \}\)/);
  const page = read("src/app/portal/admin/audit/[id]/ClientHours.js");
  const metrics = [...page.matchAll(/<Metric label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(metrics, ["Authorized", "QSP billed", "Addenda", "Review corrections", "Billed", "Booked past"]);
  assert.match(page, /clientMonthModel\(\{ rows, authLines: month\?\.lines \|\| \[\], planned \}\)/);
  const upload = read("src/app/portal/admin/audit/BudgetManager.js");
  assert.match(upload, /Reports → Budget Capture Report/);
});

test("qsp billed and billed both cover the whole month: qsp's schedule, and that with the addenda and corrections in", () => {
  const { lines, totals } = plannedModel();
  const a = lines.find((l) => l.name === "Rivera, Ana");
  assert.equal(a.qspMonthMin, 592 + 120);
  assert.equal(a.monthMin, 592 + 120);
  const m = lines.find((l) => l.name === "Moss, Theo");
  // qsp's month: its 83 billed and the 800 on the calendar, no addendum
  assert.equal(m.qspMonthMin, 83 + 800);
  // the audit's month: the addendum's 138 and the same 800
  assert.equal(m.monthMin, 138 + 800);
  // unscheduled is the authorization less the audit's month
  assert.equal(m.unscheduledMin, 900 - m.monthMin);
  assert.equal(totals.qspMonthMin + totals.addendumMin + totals.reviewMin, totals.monthMin);
  const page = read("src/app/portal/admin/audit/[id]/ClientHours.js");
  assert.match(page, /<Metric label="QSP billed" value=\{hours\(totals\.qspMonthMin\)\} \/>/);
  assert.match(page, /<Metric label="Billed" value=\{hours\(totals\.monthMin\)\} tone="sum" \/>/);
});
