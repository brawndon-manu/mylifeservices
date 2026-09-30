// THE CLOSING PAYROLL. Two things a last pay period needs: an upload that keeps
// the days still to come at the hours QSP prints for them (the schedule's), so
// everyone can be paid out before the last day is worked, and a payroll email
// that can go without meal and rest premiums - no break penalty file, and no
// premium in the other three's columns or totals.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { futureDates, trimDays, lastSheetDay } from "../partial.js";
import { columnsFor, renderPayoutReport } from "../payout-pdf.js";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const sheets = [
  { employee: "Reyes, Dana", days: [{ date: "09/29/26" }, { date: "09/30/26" }] },
  { employee: "Hale, Morgan", days: [{ date: "09/28/26" }] },
];

test("the last day in the sheets becomes today, so the days still to come stay in", () => {
  assert.equal(lastSheetDay(sheets).toDateString(), new Date(2026, 8, 30).toDateString());
  assert.equal(lastSheetDay([]), null);
  // on 09/29 the 30th is after today: refused by the guard, trimmed by the box
  const on29 = new Date(2026, 8, 29, 12);
  assert.deepEqual([...futureDates(sheets, on29)], ["09/30/26"]);
  assert.deepEqual(trimDays(sheets, { now: on29 }).dropped, ["09/30/26"]);
  // a final payout moves today to the last day in the file: nothing dropped
  const kept = trimDays(sheets, { now: lastSheetDay(sheets) });
  assert.deepEqual(kept.dropped, []);
  assert.equal(kept.through, "09/30/26");
  // and a typed range can still cut the front
  assert.deepEqual(trimDays(sheets, { now: lastSheetDay(sheets), from: new Date(2026, 8, 29) }).sheets.map((s) => s.employee), ["Reyes, Dana"]);
});

test("both uploads take a Final payout box that stands the future refusal down and lets the range reach past today", () => {
  const ils = read("src/app/portal/admin/timesheets/actions.js");
  assert.match(ils, /const finalPayout = !auditOnly && formData\.get\("finalPayout"\) === "on";/);
  assert.match(ils, /if \(future\.size && !wantPartial && !finalPayout\) \{/);
  assert.match(ils, /now: finalPayout \? lastSheetDay\(withHours\) \|\| undefined : undefined,/);
  const ilsForm = read("src/app/portal/admin/timesheets/new/UploadForm.js");
  assert.match(ilsForm, /\{!audit && \(\s*<div[^>]*>\s*<label[^>]*>\s*<input type="checkbox" name="finalPayout"/);
  const dpActions = read("src/app/portal/admin/day-program/actions.js");
  assert.match(dpActions, /const finalPayout = formData\.get\("finalPayout"\) === "on";/);
  assert.match(dpActions, /partial: wantPartial \? \{ from: partialFromInput, to: partialToInput \} : null,\s*finalPayout,/);
  const dp = read("src/lib/day-program/analyze.js");
  assert.match(dp, /finalPayout = false,\s*\}\) \{/);
  assert.match(dp, /if \(future\.size && !partial && !finalPayout\) \{/);
  assert.match(dp, /now: finalPayout \? lastSheetDay\(sheets\) \|\| undefined : undefined,/);
  assert.match(read("src/app/portal/admin/day-program/new/PartialPick.js"), /<input type="checkbox" name="finalPayout"/);
});

test("the payroll email can go without premiums: no penalty file, the other three asked for without them", () => {
  const bundle = read("src/lib/timesheet/payroll-bundle.js");
  assert.match(bundle, /export async function buildPayrollBundle\(id, batch, \{ noPremiums = false \} = \{\}\) \{/);
  assert.match(bundle, /if \(noPremiums && spec\.key === "penalties"\) continue;/);
  assert.match(bundle, /noPremiums \? "http:\/\/internal\/\?premiums=0" : undefined/);
  for (const r of ["report/pdf", "report/csv", "report/xlsx"]) {
    assert.match(read(`src/app/portal/admin/timesheets/[id]/${r}/route.js`), /const noPremiums = new URL\(req\.url\)\.searchParams\.get\("premiums"\) === "0";/, r);
  }
  const send = read("src/app/portal/admin/timesheets/[id]/send-report/actions.js");
  assert.match(send, /export async function sendPayrollBundle\(batchId, \{ anyway = false, noPremiums = false \} = \{\}\) \{/);
  assert.match(send, /buildPayrollBundle\(batch\.id, batch, \{ noPremiums: noPremiums === true \}\)/);
  assert.match(send, /"Meal and rest premium hours are left out of these reports\."/);
  assert.match(read("src/lib/announcement-email.js"), /premiumsLeftOut \? '<div[^']*>Meal and rest premium hours are left out of these reports\.<\/div>' : ""/);
  const ui = read("src/app/portal/admin/timesheets/[id]/send-report/SendReport.js");
  assert.match(ui, /res = await action\(batchId, \{ anyway, noPremiums \}\);/);
  assert.match(ui, /\{!noPremiums && <li>Break penalty hours, as a PDF<\/li>\}/);
  assert.match(ui, /Leave out premium hours\./);
});

test("without premiums, no file counts them in Total payable or prints their column", () => {
  const csv = read("src/app/portal/admin/timesheets/[id]/report/csv/route.js");
  assert.match(csv, /\.\.\.\(noPremiums \? \[\] : \["Premium hours", "Premium hours that come off if assumptions confirmed"\]\),/);
  assert.match(csv, /const charged = noPremiums \? 0 : standing\.byId\[ts\.id\]\?\.charged \?\? 0;/);
  assert.match(csv, /const payable = \(ts\.paidHours \|\| 0\) \+ charged \+ off\.added;/);
  const wb = read("src/lib/timesheet/payroll-workbook.js");
  assert.match(wb, /const charged = noPremiums \? 0 : standing\.byId\[t\.id\]\?\.charged \?\? 0;/);
  assert.match(wb, /\.\.\.\(noPremiums \? \[\] : \[\{ header: "Penalty", key: "premium", width: 9 \}\]\),/);
  assert.match(wb, /if \(!noPremiums\) \{\s*const pen = wb\.addWorksheet\("Penalty hours"/);
  assert.match(wb, /s\.getCell\("B8"\)\.value = noPremiums \? "Payroll hours" : "Payroll hours and penalties";/);
});

test("the payout PDF without premiums keeps its width, drops the column, and renders", async () => {
  const width = (cols) => cols.reduce((n, [, w]) => n + w, 0);
  assert.equal(width(columnsFor(false)), 532);
  assert.equal(width(columnsFor(true)), 532);
  assert.equal(columnsFor(true).some(([l]) => l === "Penalty"), false);
  assert.equal(columnsFor(false).some(([l]) => l === "Penalty"), true);
  const rows = [{ who: "Dana Reyes", matched: true, regularHours: 40, otHours: 2, doubleHours: 0, paidHours: 42, premiumHours: 3, timeOffHours: 4, miles: 10, signedAt: null, approvedAt: null }];
  for (const noPremiums of [false, true]) {
    const out = await renderPayoutReport({ periodFrom: "09/16/26", periodTo: "09/30/26", rows, standing: { people: 1, settled: false, waiting: 1, assumptions: 3 } }, { noPremiums });
    assert.ok(out.bytes.length > 1000, `renders with noPremiums=${noPremiums}`);
  }
  const src = read("src/lib/timesheet/payout-pdf.js");
  assert.match(src, /const premOf = \(r\) => \(noPremiums \? 0 : r\.premiumHours \|\| 0\);/);
  assert.match(src, /const title = noPremiums \? "Payroll Hours Due" : "Payroll Hours and Penalties Due";/);
  assert.match(src, /if \(standing\?\.people && !noPremiums\) \{/);
});
