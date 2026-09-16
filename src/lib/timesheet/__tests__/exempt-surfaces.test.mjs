// A SALARIED EXEMPT PERSON IS NOT A ROW STILL WAITING ON SOMETHING.
//
// Mánu 2026-09-16: "lets grey out their ability to send and for the payout
// report too it would just say exempt if they signed or not". Their sheet asks
// for no signature and `sendTimesheets` already refuses them by its own where
// clause, so the live Send button was a press that could only do nothing and
// then report success, and every payout surface printed "Not signed" against
// three people who have nothing to do.
//
// FOUR SURFACES PRINT THAT STATUS and they must not disagree: the screen, the
// CSV, the PDF and the payroll workbook. Pinned as text because three of them
// are components or byte builders with no seam to call.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// THE SOURCE WITH ITS COMMENTS TAKEN OUT, for the assertions that say something
// must NOT appear. Twice now a pin here has matched prose rather than code: once
// finding "exempt" in a heading above the branch, once finding the wrong
// property name inside the note explaining why it was wrong. A negative
// assertion against a file that documents its own history has to read the code.
const code = (p) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const PAYOUT_TABLE = "src/app/portal/admin/timesheets/[id]/report/PayoutTable.js";
const CSV = "src/app/portal/admin/timesheets/[id]/report/csv/route.js";
const WORKBOOK = "src/lib/timesheet/payroll-workbook.js";
const PDF = "src/lib/timesheet/payout-pdf.js";

test("the row's Send button is disabled and says Exempt", () => {
  const table = read("src/app/portal/admin/timesheets/_components/ReviewTable.js");
  assert.match(table, /const exempt = row\.user\?\.salariedExempt === true;/);
  assert.match(table, /disabled=\{exempt \|\| state === "busy"\}/);
  assert.match(table, /const label = exempt\s*\n\s*\? "Exempt"/);
});

// THE PIN ABOVE PASSED ON NOTHING FIRST TIME ROUND. It asserted
// `row.salariedExempt`, which is what I had written, and the page puts the flag
// on `row.user` - so the button stayed live on every row and the test agreed
// with the mistake. This is the half that makes the other half mean something:
// the path the button reads has to be the path the page writes.
test("the button reads the flag where the page actually puts it", () => {
  const page = read("src/app/portal/admin/timesheets/[id]/page.js");
  const table = read("src/app/portal/admin/timesheets/_components/ReviewTable.js");
  // the page builds it inside the matched account, not on the row
  assert.match(page, /user: t\.user[\s\S]{0,40}\? \{[\s\S]{0,260}?salariedExempt: t\.user\.salariedExempt === true,/);
  // so the row must reach through `user` to find it
  assert.match(table, /row\.user\?\.salariedExempt/);
  assert.doesNotMatch(code("src/app/portal/admin/timesheets/_components/ReviewTable.js"), /row\.salariedExempt/);
});

test("every payout surface says Exempt instead of a signature state", () => {
  assert.match(read(PAYOUT_TABLE), /: r\.salariedExempt\s*\n\s*\? "Exempt"/);
  assert.match(read(CSV), /: ts\.user\?\.salariedExempt === true\s*\n\s*\? "exempt"/);
  assert.match(read(PDF), /r\.salariedExempt \? "Exempt" :/);
  assert.match(read(WORKBOOK), /t\.user\?\.salariedExempt === true \? "Exempt"/);
});

// Pinned on the branch itself rather than on where the word appears: the first
// version of this test searched for "exempt" anywhere and found it in a comment
// above the code, so it passed on nothing.
test("a reported problem still outranks exempt, everywhere", () => {
  assert.match(read(PAYOUT_TABLE), /r\.disputed\s*\n\s*\? "Reported a problem"\s*\n\s*: r\.salariedExempt/);
  assert.match(read(CSV), /\? "reported a problem"\s*\n\s*: ts\.user\?\.salariedExempt === true/);
  assert.match(read(WORKBOOK), /\? "Reported a problem"\s*\n\s*: t\.user\?\.salariedExempt === true \? "Exempt"/);
});

test("every surface that prints the status also selects the flag", () => {
  // left off the select it comes back undefined, reads as not exempt, and the
  // column quietly goes back to asking a question nobody can answer
  for (const p of [
    "src/app/portal/admin/timesheets/[id]/report/page.js",
    CSV,
    "src/app/portal/admin/timesheets/[id]/report/pdf/route.js",
    WORKBOOK,
  ]) {
    assert.match(read(p), /salariedExempt: true/, `${p} must select salariedExempt`);
  }
});

test("the printed signature total drops them from the denominator", () => {
  // or the document argues with itself: a column reading Exempt while the total
  // counts those rows as still owing a signature
  const pdf = read(PDF);
  assert.match(pdf, /const owingSignature = rows\.filter\(\(r\) => !r\.salariedExempt\)\.length;/);
  assert.match(pdf, /`\$\{signedCount\}\/\$\{owingSignature\}`/);
});
