// THE PENALTY REPORT'S REST COUNT IS THE CREDITED ONE. The day-by-day table
// printed `restCount`, the rests visible in the clock punches, while the
// sheet, the screen and the violation itself read `restTaken`, the count the
// day is judged on (Rest Periods Report, short meals, misc breaks, the
// employee's own answer). On 09/01-09/15 the two disagreed on 232 of 606 days
// and the report understated 188 of them, printing "0 / 2 ... Compliant" on
// attested days and "0 / 2" on Mánu's 09/10 while the calendar showed the
// 12:00 rest. Same bug the sheet had once, lower on 66 days and higher on 22.
import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFArray, decodePDFRawStream } from "pdf-lib";
import { renderComplianceReport } from "../report.js";

function contentText(page) {
  const contents = page.node.Contents();
  const streams = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) streams.push(page.node.context.lookup(contents.get(i)));
  } else if (contents) streams.push(page.node.context.lookup(contents));
  let text = "";
  for (const s of streams) {
    if (!s) continue;
    try { text += Buffer.from(decodePDFRawStream(s).decode()).toString("latin1") + "\n"; }
    catch { text += Buffer.from(s.contents || []).toString("latin1") + "\n"; }
  }
  return text;
}
const hex = (s) => `<${Buffer.from(s, "latin1").toString("hex").toUpperCase()}>`;
const day = (over) => ({
  date: "09/10/26", paidHours: 8, regularHours: 8, otHours: 0, doubleHours: 0,
  mealCount: 1, mealStartedAfterMin: 240, mealViolation: false,
  restCount: 0, restTaken: 1, restRecorded: 1, restRequired: 2, restViolation: true,
  punches: [{ min: 540, raw: "9a" }, { min: 780, raw: "1p" }, { min: 810, raw: "1:30p" }, { min: 1050, raw: "5:30p" }],
  breaks: [{ kind: "meal", min: 30, start: { min: 780, raw: "1p" }, end: { min: 810, raw: "1:30p" } }],
  ...over,
});
async function pages(sheet) {
  const out = await renderComplianceReport(sheet);
  const bytes = out?.bytes || out;
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map(contentText).join("\n");
}
const sheet = (d, restDays = ["09/10/26"]) => ({
  employee: "Uribe, Brandon", payPeriod: { from: "09/01/26", to: "09/15/26" }, from: "09/01/26", to: "09/15/26",
  days: [d], premiums: { mealDays: [], restDays, mealHours: 0, restHours: restDays.length, totalHours: restDays.length },
});

test("the day-by-day count is the credited count, the one the violation is judged on", async () => {
  const text = await pages(sheet(day()));
  assert.ok(text.includes(hex("1 / 2")), "the row prints 1 / 2, not the punch count");
  assert.ok(text.includes(hex("Rest 1 of 2")), "the violation says 1 of 2");
  assert.ok(!text.includes(hex("0 / 2")) && !text.includes(hex("Rest 0 of 2")), "nothing left reading off the punches");
});

test("a punch gap the engine did not credit is not counted either", async () => {
  const text = await pages(sheet(day({ restCount: 1, restTaken: 0, restRecorded: 0, restViolation: false }), []));
  assert.ok(text.includes(hex("0 / 2")), "the row prints 0 / 2");
  assert.ok(!text.includes(hex("1 / 2")));
});
