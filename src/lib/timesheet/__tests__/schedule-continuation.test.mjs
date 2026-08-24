// THE PAGE BREAK THAT INVENTED 2.75 HOURS.
//
// Mariel Zuchniak's August 2026: her calendar ran onto a second page carrying
// only the day numbers 30 and 31 plus the spill-over tail of the cut week. The
// parser rebuilt its column grid from those two day numbers, the seven columns
// collapsed to two, Tuesday's spill blocks snapped onto Monday the 24th - the
// checks screen said "8.00 worked, 10.75 scheduled" against a schedule that
// says 8.00 - and Wednesday's block fell off the grid entirely.
//
// A continuation page must use the grid of the page it continues. These pages
// are built to the real export's geometry: columns centred at 80.2 + 123k,
// entries left-aligned about 53pt left of centre, day numbers near the centre.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSchedulePages } from "../schedule.js";

const COL0 = 80.2;
const COLW = 123;
const centre = (c) => COL0 + COLW * c;
const entryX = (c) => centre(c) - 53;

const item = (str, x, y, w = 60) => ({ str, transform: [1, 0, 0, 1, x, y], width: w });

// a full first page: header, a real grid (four rows of seven day numbers, 1-28),
// and the cut week's visible entries in the bottom row (day 23 = Sunday col 0,
// day 24 = Monday col 1, ...).
function pageOne() {
  const items = [
    item("Employee: Mariel Zuchniak", 200, 770, 160),
    item("August 2026", 300, 750, 80),
  ];
  // August 2026 starts on a Saturday: day 1 sits in column 6, and the cut week
  // is 23-29 with Monday the 24th in column 1 - the real month's shape.
  items.push(item("1", centre(6) - 4, 700, 8));
  let day = 2;
  const rowY = [600, 500, 450, 400];
  for (const y of rowY) {
    for (let c = 0; c < 7 && day <= 29; c++, day++) {
      items.push(item(String(day), centre(c) - 4, y, 8));
    }
  }
  // Monday the 24th's cell, cut by the page: everything except the last block
  const y0 = 395;
  items.push(item("9a-10:37a Handley, S-ILS Service(1:37)", entryX(1), y0, 100));
  items.push(item("10:37a-11a -ILS Travel(0:23)", entryX(1), y0 - 10, 100));
  items.push(item("11a-1:30p Elder. Morton, S-ILS Service(2:30)", entryX(1), y0 - 20, 100));
  items.push(item("1:30p-2p -Meal Break(0:30)", entryX(1), y0 - 30, 100));
  items.push(item("2p-2:30p -ILS Travel(0:30)", entryX(1), y0 - 40, 100));
  // Tuesday the 25th's cell, also cut
  items.push(item("8:30a-10:30a Handley, S-ILS Service(2:00)", entryX(2), y0, 100));
  return items;
}

// the continuation: only "30" and "31" as day numbers, with the cut week's
// tails above them - one block per column, exactly the real export's shape.
function pageTwo() {
  const spillY = 760;
  return [
    // Monday the 24th's last block, split over two text lines
    item("2:30p-5:30p Tran, N-ILS Service", entryX(1), spillY, 95),
    item("(3:00)", entryX(1), spillY - 10, 20),
    // Tuesday the 25th's last block
    item("3:15p-6p Gomez, Z-ILS Service", entryX(2), spillY, 95),
    item("(2:45)", entryX(2), spillY - 10, 20),
    // Wednesday the 26th's last block - the one the collapsed grid dropped
    item("2p-5p Luu, D-ILS Service(3:00)", entryX(3), spillY, 100),
    // the month's last two days
    item("30", centre(0) - 4, 700, 8),
    item("31", centre(1) - 4, 700, 8),
    item("9a-11a Handley, S-ILS Service(2:00)", entryX(1), 690, 100),
  ];
}

test("spill-over lands on its own column's day, not the nearest surviving one", () => {
  const [person] = readSchedulePages([pageOne(), pageTwo()]);
  assert.equal(person.employee, "Mariel Zuchniak");

  const byDate = new Map(person.days.map((d) => [d.date, d]));
  const mon = byDate.get("08/24/26");
  // the day the page cut in half: its own five blocks plus its spilled tail,
  // 8.00 paid - never Tuesday's 2:45 on top
  assert.equal(mon.workHours, 8);
  assert.equal(mon.mealHours, 0.5);
  assert.ok(mon.entries.some((e) => /2:30p-5:30p Tran/.test(e.text) && e.minutes === 180));
  assert.ok(!mon.entries.some((e) => /Gomez/.test(e.text)), "Tuesday's block bled onto Monday");
  assert.deepEqual(mon.pages, [1, 2]);

  // Tuesday keeps its own tail
  const tue = byDate.get("08/25/26");
  assert.ok(tue.entries.some((e) => /Gomez/.test(e.text) && e.minutes === 165));

  // Wednesday's tail is not dropped off the grid
  const wed = byDate.get("08/26/26");
  assert.ok(wed, "Wednesday's spilled block vanished entirely");
  assert.ok(wed.entries.some((e) => /Luu/.test(e.text) && e.minutes === 180));

  // and the continuation's own whole days still read
  const day31 = byDate.get("08/31/26");
  assert.equal(day31.workHours, 2);
});
