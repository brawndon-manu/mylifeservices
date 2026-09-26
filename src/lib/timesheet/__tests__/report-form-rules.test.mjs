// THE REPORT FORM KEEPS THE DAY'S RULES AS IT IS TYPED: a
// slot that runs into another is refused on the spot and stops the total, a
// box somebody changes shows the time it had before, and Add to reports is
// the one blue button on the form - it is the press that puts the report on
// the list that gets sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { slotProblems, slotHours } from "../work-slots.js";

const form = fs.readFileSync("src/app/t/[token]/ReportProblem.js", "utf8");

// a day as the form opens it
const SEED = [{ from: "10:02 AM", to: "12:02 PM" }, { from: "12:32 PM", to: "02:02 PM" }, { from: "03:12 PM", to: "06:30 PM" }];
const boxes = (slots, seed = SEED) => [...slotProblems(slots, seed).boxes].sort();

test("the box that made the clash is the one marked: a 1pm on the third slot, and nothing else", () => {
  assert.deepEqual(boxes([SEED[0], SEED[1], { from: "1:00 PM", to: "06:30 PM" }]), ["2:from"]);
  // the other way round: the second slot's end stretched into the third
  assert.deepEqual(boxes([SEED[0], { from: "12:32 PM", to: "03:30 PM" }, SEED[2]]), ["1:to"]);
  // both edges touched: both
  assert.deepEqual(boxes([SEED[0], { from: "12:32 PM", to: "03:30 PM" }, { from: "3:00 PM", to: "06:30 PM" }]), ["1:to", "2:from"]);
  // a new slot has no seed, so its own edge carries the fault
  assert.deepEqual(boxes([...SEED, { from: "5:00 PM", to: "7:00 PM" }]), ["3:from"]);
  // neither touched (the form opened on a clash): both
  const clash = [{ from: "9a", to: "1p" }, { from: "12p", to: "5p" }];
  assert.deepEqual(boxes(clash, clash), ["0:to", "1:from"]);
});

test("an end at or before its start marks that End box, a 7am included", () => {
  assert.deepEqual(boxes([SEED[0], SEED[1], { from: "01:00 PM", to: "07:00 AM" }]), ["2:to"]);
  assert.deepEqual(boxes([{ from: "9a", to: "9a" }], [{ from: "9a", to: "9a" }]), ["0:to"]);
});

test("touching, nesting and unreadable boxes", () => {
  // touching is not overlapping
  assert.deepEqual(boxes([{ from: "9a", to: "1p" }, { from: "1p", to: "5p" }], []), []);
  // one inside another, both new: both crossing edges, nobody's record to lean on
  assert.deepEqual(boxes([{ from: "9a", to: "5p" }, { from: "11a", to: "12p" }], []), ["0:to", "1:from"]);
  // unreadable boxes are not judged here
  assert.deepEqual(boxes([{ from: "9a", to: "5p" }, { from: "", to: "" }], []), []);
  assert.equal(slotProblems(null).ok, true);
  assert.equal(slotProblems(SEED, SEED).ok, true);
});

test("the form paints the box at fault red as it is typed and shows no total", () => {
  assert.match(form, /const problems = takesSlots \? slotProblems\(slots, seed\) : \{ boxes: new Set\(\), ok: true \};/);
  assert.match(form, /const slotTotal = takesSlots && problems\.ok \? slotHours\(slots\) : null;/);
  assert.match(form, /read\[key\] && !problems\.boxes\.has\(`\$\{i\}:\$\{key\}`\)\n\s*\? "border-emerald-400\/80"/);
  // the total the slots would have added up to, were they allowed
  assert.equal(slotHours([{ from: "10:02a", to: "12:02p" }, { from: "12:32p", to: "2:02p" }, { from: "1p", to: "6:30p" }]), 9);
});

test("a changed box shows the time it had before, from the day's own shifts", () => {
  assert.match(form, /const \[seed, setSeed\] = useState\(\[\]\);/);
  // seeded from the record at every place the slots are seeded, never from a draft
  assert.match(form, /setSlots\(item\?\.slots \? item\.slots\.map\(\(slot\) => \(\{ \.\.\.slot \}\)\) : slotsForDay\(nextKind, recorded\)\);\n\s*setSeed\(slotsForDay\(nextKind, recorded\)\);/);
  assert.match(form, /setSlots\(slotsForDay\(kind, first\)\);\n\s*setSeed\(slotsForDay\(kind, first\)\);/);
  assert.match(form, /setSlots\(slotsForDay\(nextKind, nextDay\)\);\n\s*setSeed\(slotsForDay\(nextKind, nextDay\)\);/);
  assert.match(form, /setSlots\(slotsForDay\(k, day\)\);\n\s*setSeed\(slotsForDay\(k, day\)\);/);
  // the four places a day's slots are seeded: the flow's start, the plain
  // open button, a day change and a kind change
  assert.equal((form.match(/setSeed\(slotsForDay\(/g) || []).length, 4);
  assert.match(form, /return displayTime\(before\) === formatTimeDisplay\(read\[key\]\) \? null : displayTime\(before\);/);
  assert.match(form, /\{wasOf\(key\) && <> <s className="text-faint">\{wasOf\(key\)\}<\/s><\/>\}/);
});

test("Add to reports is the form's blue button", () => {
  assert.match(form, /className="rounded-\[9px\] bg-brand px-4 py-2 text-\[13\.5px\] font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"\n\s*>\n\s*\{flow \? "Add to reports" : items\.length \? "Add another" : "Add this"\}/);
});

test("removing a slot takes its seed along, so the rest still compare with their own record", () => {
  assert.match(form, /onClick=\{\(\) => \{ setSlots\(\(p\) => p\.filter\(\(_, j\) => j !== i\)\); setSeed\(\(p\) => p\.filter\(\(_, j\) => j !== i\)\); \}\}/);
  // the first slot removed: the other two, untouched, raise nothing
  const without = (list) => list.filter((_, j) => j !== 0);
  assert.deepEqual(boxes(without(SEED), without(SEED)), []);
  // left misaligned, the second slot's start would read as changed from the first's
  assert.notEqual(SEED[1].from, SEED[0].from);
});
