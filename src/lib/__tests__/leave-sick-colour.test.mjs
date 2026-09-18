// SICK PAY HAS ITS OWN COLOUR, AND IT IS NOT THE SUCCESS GREEN.
//
// For a long time the employee card drew sick pay in --status-positive, which
// on six other screens means settled, accepted, complete or final. And the day
// grid drew sick and PTO in the identical sky, so a fortnight of leave read as
// one thing with only the word to tell them apart.
//
// Mánu picked the warm stone off a mock. These pins exist because a colour is
// the easiest thing in the codebase to "tidy" back to a palette class without
// noticing what the old one meant.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const css = read("src/app/globals.css");
const card = read("src/app/portal/admin/timesheets/_components/EmployeeCard.module.css");
const cell = strip(read("src/app/portal/admin/timesheets/[id]/calendar/PtoCell.js"));
const dayByDay = strip(read("src/app/t/[token]/DayByDay.js"));
const dayCal = strip(read("src/app/t/[token]/DayCalendar.js"));

test("the token is defined in both themes and registered as a utility", () => {
  // light and dark each carry their own pair. Night inherits the dark one - it
  // overrides only backgrounds and borders - so two pairs cover three themes.
  const decls = css.match(/--leave-sick:\s*#[0-9a-f]{6}/gi) || [];
  assert.equal(decls.length, 2, "one --leave-sick per theme, light and dark");
  const inks = css.match(/--leave-sick-ink:\s*#[0-9a-f]{6}/gi) || [];
  assert.equal(inks.length, 2, "and one ink per theme");

  // without these the class names compile to nothing at all and the cells
  // silently render unstyled, which is the failure this pins
  assert.match(css, /--color-leave-sick:\s*var\(--leave-sick\)/);
  assert.match(css, /--color-leave-sick-ink:\s*var\(--leave-sick-ink\)/);
});

test("the light ink is darker than the light colour, because text needs it", () => {
  // #857d76 is 3.2:1 as text on its own wash - below the 4.5:1 small-text bar -
  // so light mode prints a darker cut of the same stone. This asserts the
  // relationship rather than the hex, so a future retune cannot quietly flatten
  // the two back together.
  // the :root block itself, not "everything before the first mention of .dark" -
  // the file talks about .dark in its comments long before it declares it
  const lightBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] || "";
  const colour = /--leave-sick:\s*#([0-9a-f]{6})/i.exec(lightBlock)?.[1];
  const ink = /--leave-sick-ink:\s*#([0-9a-f]{6})/i.exec(lightBlock)?.[1];
  assert.ok(colour && ink, "light theme carries both");
  const lum = (hex) => {
    const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  assert.ok(lum(ink) < lum(colour), "the ink is the darker of the two in light");
  // and it actually clears the bar against white
  assert.ok((1.05) / (lum(ink) + 0.05) >= 4.5, "light ink is at least 4.5:1 on white");
});

test("the employee card stops borrowing the success green", () => {
  assert.match(card, /\.sick \{ background: var\(--leave-sick\); \}/);
  assert.ok(
    !/\.sick \{ background: var\(--status-positive\)/.test(card),
    "sick pay is not a success state",
  );
  // PTO is untouched - only sick was asked for
  assert.match(card, /\.pto \{ background: var\(--leave-pto\); \}/);
});

test("the day-by-day grid splits sick from PTO, and leaves reported alone", () => {
  assert.match(cell, /ptoKind === "sick"/);
  assert.match(cell, /border-leave-sick\/85 bg-leave-sick\/20 text-leave-sick-ink/);
  // PTO keeps the sky it has always had
  assert.match(cell, /border-sky-400\/70 bg-sky-500\/10 text-sky-800 dark:text-sky-300/);
  // and an unaccepted claim stays amber whichever kind it is, because that
  // colour is about a press nobody has made, not about sick or PTO
  assert.match(cell, /reported\s*\n?\s*\? "border-amber-400\/70/);
});

test("the employee's own two surfaces carry the same stone", () => {
  // the chip on the day list
  assert.match(dayByDay, /day\.miscKind === "sick"\s*\n?\s*\? "border-leave-sick\/70 bg-leave-sick\/15 text-leave-sick-ink"/);

  // and the block on the calendar, which is keyed on the DAY - the roster
  // string says "ILS Misc" whether it turned out to be sick or not
  assert.match(dayCal, /const isSickDay = \(day\) => day\?\.miscKind === "sick"/);
  assert.match(dayCal, /const SICK_EDGE = "var\(--leave-sick\)"/);
  assert.match(dayCal, /const edgeFor = \(service, day = null\) =>/);
  assert.match(dayCal, /const washFor = \(service, day = null\) =>/);
  // the call site has to pass the day or the whole rule is dead code
  assert.match(dayCal, /edgeFor\(booked, day\)/);
  assert.match(dayCal, /washFor\(booked, day\)/);
});
