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
  assert.match(page, /clientMonthModel\(\{ rows, authLines: month\?\.lines \|\| \[\] \}\)/);
  assert.match(page, /billableOf/);
});
