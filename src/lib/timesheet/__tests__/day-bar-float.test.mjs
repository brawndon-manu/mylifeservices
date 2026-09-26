// THE DAY BAR FLOATS ON EVERY WIDTH, AND THE PAGE MAKES ROOM FOR IT.
//
// the glass bar with Report a problem, Back and Next floated on phones only.
// it floats on a wider screen too now, lined up with its day column, and the
// page ends with room for it so the last thing on the page (what you have told
// us about this timesheet) can scroll clear of it instead of sitting under it.
// the "answer everything" line stays in the day's card; only the controls float.
// All questions keeps every bar inside its own day - fixed there, all of them
// stacked on one spot and the one on top belonged to the last day.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const css = read("src/app/t/[token]/ReviewFlow.module.css");
const flow = read("src/app/t/[token]/ReviewFlow.js");
const days = read("src/app/t/[token]/DayByDay.js");
const rail = read("src/app/t/[token]/DayRail.js");
const card = read("src/app/t/[token]/TimesheetQuestion.js");
const page = read("src/app/t/[token]/page.js");

// the css with the phone-only block taken out, to see what applies everywhere
const phoneAt = css.indexOf("@media (max-width: 639px) {");
let depth = 0, end = phoneAt;
for (let i = css.indexOf("{", phoneAt); i < css.length; i++) {
  if (css[i] === "{") depth++;
  if (css[i] === "}" && --depth === 0) { end = i + 1; break; }
}
const everywhere = css.slice(0, phoneAt) + css.slice(end);
const phoneOnly = css.slice(phoneAt, end);

test("the bar floats outside the phone-only rules", () => {
  assert.match(everywhere, /\.dayBar \{\n\s*position: fixed;/);
  assert.match(everywhere, /background: var\(--glass\);/);
  assert.doesNotMatch(phoneOnly, /\.dayBar \{/, "no floating rule is left phone only");
});

test("wider than a phone it lines up with its day column", () => {
  assert.match(everywhere, /@media \(min-width: 640px\) \{\n\s*\.dayBar \{\n\s*left: calc\(max\(0px, \(100% - 72rem\) \/ 2\) \+ 1\.5rem \+ 13rem \+ 1\.25rem\);\n\s*right: calc\(max\(0px, \(100% - 72rem\) \/ 2\) \+ 1\.5rem \+ 1\.25rem\);/);
  assert.match(everywhere, /@media \(min-width: 1024px\) \{\n\s*\.dayBar \{\n\s*left: calc\(max\(0px, \(100% - 72rem\) \/ 2\) \+ 1\.5rem \+ 16rem \+ 1\.25rem\);/);
});

test("those numbers are the page's own layout classes", () => {
  // 72rem is max-w-6xl and 1.5rem is sm:px-6, on the page's section
  assert.match(page, /<section className=\{`no-focus-zoom mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10/);
  // 13rem is sm:w-52 and 16rem is lg:w-64, the day list beside the day
  assert.match(rail, /sm:w-52 sm:flex-none sm:flex-col sm:overflow-x-visible sm:border-b-0 sm:border-r lg:w-64/);
  // 1.25rem is sm:p-5, the day's own padding in Day by day
  assert.match(days, /: "flex flex-1 flex-col p-4 sm:p-5"\}/);
});

test("the page ends with room for the bar while one floats", () => {
  assert.match(everywhere, /:global\(\[data-timesheet-review\]\):has\(\.dayBar\) \{\n\s*padding-bottom: calc\(90px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(everywhere, /@media \(min-width: 640px\) \{\n\s*:global\(\[data-timesheet-review\]\):has\(\.dayBar\) \{\n\s*padding-bottom: calc\(94px \+ env\(safe-area-inset-bottom\)\);/);
});

test("All questions keeps each bar in its own day", () => {
  assert.match(flow, /export function DayReport\(\{ date, day = null, navigation, note = null, floats = true \}\)/);
  assert.match(flow, /<div data-day-bar className=\{`flex items-center justify-between gap-3 \$\{floats \? styles\.dayBar : "mt-3"\}`\}>/);
  assert.match(days, /floats=\{!stacked\}/);
});

test("the answer-everything line stays in the card, from the button's own rule", () => {
  assert.match(days, /note=\{<DayBlockedNote date=\{day\.date\} plainBlocked=\{plainBlockedOn\(day\.date\)\} \/>\}/);
  // in the card, before the bar
  assert.ok(flow.indexOf("{note}") > 0 && flow.indexOf("{note}") < flow.indexOf("<div data-day-bar"));
  // one rule for both, so the line shows exactly when the button is held
  assert.match(card, /const dayBlocked = \(batch, date, plainBlocked\) =>/);
  assert.match(card, /if \(!dayBlocked\(batch, date, plainBlocked\)\) return null;/);
  assert.match(card, /const blocked = dayBlocked\(batch, date, plainBlocked\);/);
  // and not on the bar as well
  assert.match(card, /\{!flow && \(\n\s+<p className="text-xs text-muted">/);
});
