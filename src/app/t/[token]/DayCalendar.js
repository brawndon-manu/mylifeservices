"use client";

import { shiftsOf } from "@/lib/timesheet/questions";
import { useStagedOn } from "./StagedTimes";

// ONE DAY DRAWN ON A TIME AXIS - the shape Mánu asked for on 2026-08-11, after
// sketching it against his own calendar: "I feel like this may be too
// complicated. Maybe we can add a simple view option as well, for something
// they're more familiar with."
//
// The reason a calendar earns its place here rather than being decoration: every
// rule these questions turn on is SPATIAL. A ten belongs in the first four hours
// or the last four (`restWindow`), a meal has to start before the fifth hour, a
// break logged at a shift edge is time added rather than time taken. Written as
// sentences those have to be parsed. Drawn on an axis, a break in the wrong
// place is simply in the wrong place.
//
// Presentational only. Every answer still goes through TimesheetQuestion, which
// owns the choices, the per-slot times, the locking and the change warning.

// THE COLOURS THE SIGNED DOCUMENT USES, taken from render.js rather than picked
// again here - REST rgb(1, .949, .6) and MEAL rgb(.71, .85, .98). The whole
// argument for this view is that it looks like the paperwork they already read,
// so a second colour vocabulary would defeat it. Mánu's own sketch drew a rest
// in blue, which is the colour the report already spends on a meal.
const REST = "#fff299";
const MEAL = "#b5d9fa";
// A REST SITTING WHERE IT BELONGS GOES GREEN, and Mánu 2026-08-12 derived the
// colour from the picture itself: "because blue and yellow make green, if it's
// within the correct time, it'll be green if it's inside of another shift. and
// then leave it as yellow how it is now if it's outside of a shift."
//
// The bar is yellow and the shift under it is blue, so a rest laid correctly on
// top of worked time mixes to green and one hanging off the end stays yellow. It
// means the same thing the question beside it means - a rest is PAID and on the
// clock, so it can only have happened inside a shift - said without a sentence.
const REST_OK = "#c3e6a4";

// ONE FAMILY, SEVERAL SHADES. Mánu 2026-08-12: "Make Misc just a different shade
// of the current blue. make admin a bit darker blue? make self determination a
// tallish blue. make travel time a shade of blue as well. just use multiple
// blues."
//
// The rainbow before this was wrong because it spent the whole palette on the
// BACKGROUND, where it fought the two colours that carry meaning - the yellow of
// a rest and the blue of a meal. Shades of one hue keep the services legible as
// a group while still telling them apart, and nothing in the background can be
// mistaken for a break.
//
// MATCHED ON A PATTERN, NOT AN EXACT STRING, so "ILS Misc" and a future
// "Misc Time" both land on the same shade, and anything unrecognised falls back
// to the base blue rather than rendering unstyled.
const WORK_SHADES = [
  [/self\s*determ/i,  "#0e7490"],   // cyan-700, the teal-ish end of the family
  [/travel/i,         "#38bdf8"],   // sky-400, the lightest
  [/admin/i,          "#1e40af"],   // blue-800, darker as asked
  [/training/i,       "#6366f1"],   // indigo-500
  [/misc/i,           "#2563eb"],   // blue-600, a shade off the base
];
const WORK_EDGE = "#3b82f6";        // blue-500, ILS Service and anything new
const edgeFor = (service) =>
  (WORK_SHADES.find(([re]) => re.test(service || ""))?.[1]) || WORK_EDGE;

// MISC GETS A HEAVIER WASH RATHER THAN A LOUDER HUE. On his 07/30 it is a ten
// minute block, and at that size a shade of blue is not what makes it findable -
// weight is. Everything else stays at a tenth so the background stays background.
const isMisc = (service) => /misc/i.test(service || "");

// WHAT THE BLOCK CALLS IT. The roster's own words everywhere except Misc, which
// Mánu asked to read as just "Misc" - the "ILS" on it is carried by every other
// service too, so on the one entry that means "none of the above" it is three
// characters of nothing. Everything else stays verbatim, because the whole point
// of printing the service is that it matches the document they can open.
const serviceLabel = (service) => (isMisc(service) ? "Misc" : service);
const washFor = (service) => `${edgeFor(service)}${isMisc(service) ? "30" : "1a"}`;

// TWO THINGS AT THE SAME MINUTE HAVE TO SIT BESIDE EACH OTHER, NOT ON TOP.
//
// Mánu 2026-08-12: "We need a better way to show overlapping." Every break was
// drawn at nearly the full width of the column, so a rest laid on the shift it
// happened in hid that shift's label, his 07/30 rest covered the ILS Misc block
// it exactly matches, and his 07/31 rest and meal - which really do overlap,
// because the rest was taken inside the lunch - printed one on top of the other.
//
// So the column is two layers. WORK AND THE GAPS BETWEEN IT tile the full width
// underneath, and their labels live at the left edge. BREAKS are laid out in the
// right-hand part of the column, in lanes: one lane while nothing collides, and
// split evenly for as long as something does. That is how every calendar draws
// concurrent events, and it is the only arrangement where both labels survive.
const BREAK_LEFT_PCT = 44;
// and stopping where the blocks underneath stop, rather than a few pixels past
const BREAK_RIGHT_PCT = 97;
// WHERE THE TETHER LIVES when a rest is filed against a shift it does not fall
// inside. It needs a column of its own down the right-hand edge - drawn over
// the breaks it would collide with them, and drawn inside their lanes it would
// squeeze the labels the width was just widened to save. The break layer gives
// up these few percent only on the days that actually have one.
const TETHER_PCT = 7;

// Classic interval lane packing, but counted PER CLUSTER rather than per day.
//
// Walk them in start order, break the list wherever a block starts after
// everything before it has ended, and lane each of those runs on its own. Each
// block then carries the number of lanes ITS OWN cluster needed.
//
// Counting per day was the first version and it is visibly wrong: Dinley 08/07
// has one clash at 1p, and a single global count squeezed her 9:30a-12:30p
// service - which overlaps nothing - into half the column to make room for a
// collision three hours later. Only the blocks that actually collide should pay
// for the collision.
function laneOut(items) {
  const sorted = [...items].sort((a, b) => a.from - b.from || a.to - b.to);
  const placed = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const lastEnd = [];
    for (const it of cluster) {
      let lane = lastEnd.findIndex((end) => end <= it.from);
      if (lane === -1) { lastEnd.push(it.to); lane = lastEnd.length - 1; }
      else lastEnd[lane] = it.to;
      it.lane = lane;
    }
    const n = Math.max(1, lastEnd.length);
    for (const it of cluster) it.lanes = n;
    placed.push(...cluster);
    cluster = [];
  };

  for (const it of sorted) {
    if (cluster.length && it.from >= clusterEnd) flush();
    cluster.push({ ...it });
    clusterEnd = cluster.length === 1 ? it.to : Math.max(clusterEnd, it.to);
  }
  flush();
  return { placed, lanes: placed.reduce((n, p) => Math.max(n, p.lanes), 1) };
}

// whether a rest of this length fits inside a stretch that was actually worked.
// The same rule `restTimeFits` enforces on the server, minus the which-half-of-
// the-shift part: this is about the colour of a block, not about accepting an
// answer, and a ten in the wrong half of the right shift is still a ten that
// happened on the clock.
function insideAShift(shifts, from, minutes) {
  return (shifts || []).some((s) => from >= s.from && from + minutes <= s.to);
}

// TWO KINDS OF BLOCK, AND ONLY ONE OF THEM MAY BE FLOORED.
//
// Work and the gaps between it TILE the day: each one ends exactly where the
// next begins, and that adjacency is information. Floor those and a 15 minute
// gap drawn 4px too tall runs into the shift below it - Mánu 2026-08-12: "The
// not scheduled part to a schedule part should be flush with each other. Right
// now, the not scheduled is overlapping into the scheduled." A picture whose
// whole argument is that position means time cannot round position up.
//
// NOTHING IS FLOORED, including the overlays. A rest sits ON worked time, so a
// floor there looked harmless - but his 07/30 rest exactly covers a ten minute
// ILS Misc block, and floored to 15px it ran 5px into the unscheduled time
// underneath. Same lie, smaller. One rule is also simply easier to keep: every
// block on this axis is drawn at its true length, and legibility is bought with
// SCALE rather than with rounding.
//
// RAISED TWICE to pay for that, and the second time for legibility rather than
// geometry. Mánu 2026-08-12: "I think the fonts are a bit too small. It's a bit
// harder read, especially for older employees."
//
// The two numbers are locked together: the label went from 10px to 12px, so the
// shortest block has to be tall enough to hold a 12px line, and a ten minute
// block is 15px at 90px/hour. Raising the type without raising this would just
// have clipped every short break. The cost is a taller column - a seven hour day
// is 630px - which is the right thing to spend height on in the one view whose
// entire job is showing where things sit relative to each other.
const PX_PER_HOUR = 90;

// A TEN MINUTE BREAK IS DRAWN AS FIFTEEN. Mánu 2026-08-12: "Get that you're
// making the sizes of the time accurate to the block of times. But for things
// like 10 minute rest periods, make it one point five times bigger for
// visibility."
//
// This is the floor that was ripped out earlier for lying about adjacency - a
// gap drawn 4px too tall ran into the shift below it - and it is safe here for
// one reason: it applies ONLY to the break layer. Breaks sit in their own lanes
// beside the day rather than tiling it, so nothing is edge-to-edge with them and
// growing one says nothing false about what it touches. Work and the gaps
// between it are still exact to the minute, which is where the complaint was.
//
// A FLOOR RATHER THAN A MULTIPLIER, so the ordering survives: a ten becomes
// fifteen (1.5x, as asked), a fifteen stays fifteen, and a twenty is twenty and
// therefore still visibly longer than both. Scaling everything short by 1.5x
// would draw a fifteen taller than a real twenty, which trades one lie for
// another.
const MIN_BREAK_MIN = 15;

// AND THE SAME FOR A SHORT SERVICE, which is harder, because a service TILES.
// Mánu 2026-08-12: "Anything that's ten minutes that is a service rest gets one
// point five times bigger. Not scheduled. Ten minute gaps should be left alone
// as is."
//
// A break can simply grow - it sits in its own lane and touches nothing. A
// service block has a gap directly beneath it, and growing one without giving
// back the space is exactly the overlap he rejected earlier. So the extra height
// is BORROWED from the adjacent gap: his 07/30 Misc draws as fifteen minutes and
// the unscheduled stretch under it starts five minutes lower, ending where it
// always did. The column stays edge to edge and no other boundary moves.
//
// Gaps never grow, only lend - that is the "left alone as is" part - and a gap
// is only asked when it is at least twice the size of what is being borrowed, so
// a short block can never swallow the thing next to it.
const MIN_WORK_MIN = 15;

const hhmm = (m) => {
  const h = (Math.floor(m / 60) % 12) || 12;
  const mm = m % 60;
  return `${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${m % 1440 < 720 ? "a" : "p"}`;
};

// ONE SCALE, BUT EACH DAY CROPPED TO ITS OWN HOURS.
//
// The constant is PX_PER_HOUR, not the window: a ten hour day draws twice as
// tall as a five hour one, so the picture still cannot tell you a short day and
// a long day are the same size. What is NOT shared is the start and end, and
// that matters more than it sounds. Held to one 7a-7p window across the sheet -
// which is what this did first - Uribe's 07/16 works 11a to 5:30p and spends
// about two fifths of its column on empty hours, on a phone, once per day, for
// thirteen days. Cropping costs nothing true and gives back the screen.
// THE AXIS HAS TO CONTAIN EVERYTHING DRAWN ON IT.
//
// This took the shifts, the punch breaks and the typed times, and left out the
// two lists the caller actually draws blocks from: the recorded RESTS and the
// PROPOSED ones. A rest outside the punch window then landed past the bottom of
// the axis and rendered outside the card - Espinoza 08/05 punches 10a-3:45p, so
// the axis ended at 4p and his 4:30p-4:40p rest was painted in the gap between
// his card and the next day's. The one block the card exists to ask about was
// the one block outside it.
//
// The scheduled blocks go in too. Nothing in this batch rosters outside the
// punches, but the rule is the same: if it is drawn, the axis holds it.
function dayWindow(day, shifts, extras = [], scheduled = []) {
  let lo = shifts[0].from;
  let hi = shifts[shifts.length - 1].to;
  for (const b of day.breaks || []) {
    if (Number.isFinite(b.start?.min)) lo = Math.min(lo, b.start.min);
    if (Number.isFinite(b.end?.min)) hi = Math.max(hi, b.end.min);
  }
  // a time they typed OUTSIDE the hours they worked still has to be visible -
  // that is exactly the answer somebody needs to see is wrong - and so does a
  // break the report recorded out there, for the same reason.
  for (const t of extras) {
    if (!Number.isFinite(t?.min)) continue;
    lo = Math.min(lo, t.min);
    hi = Math.max(hi, t.min + (t.minutes || 10));
  }
  for (const b of scheduled || []) {
    if (Number.isFinite(b?.from)) lo = Math.min(lo, b.from);
    if (Number.isFinite(b?.to)) hi = Math.max(hi, b.to);
  }
  // out to whole hours so the gridline labels are hours, not 7:23
  return { from: Math.floor(lo / 60) * 60, to: Math.ceil(hi / 60) * 60 };
}

// WHICH BOOKING A WORKED STRETCH BELONGS TO. Matched on overlap and not on equal
// edges: the roster books 10a-12p and the punches read 10:02a-11:58a on the same
// stretch all over this batch. The longest overlap wins, so a shift spanning two
// bookings is named after the one it mostly was.
//
// MEAL BLOCKS ARE SKIPPED. They live in the same list and they are not a service
// - a shift that runs across a rostered lunch would otherwise come back labelled
// "Meal Break", which is both wrong and the opposite of what it is.
function serviceFor(scheduled, shift) {
  let best = null;
  let bestOverlap = 0;
  for (const b of scheduled || []) {
    if (b.meal) continue;
    const overlap = Math.min(b.to, shift.to) - Math.max(b.from, shift.from);
    if (overlap > bestOverlap) { bestOverlap = overlap; best = b; }
  }
  return bestOverlap > 0 ? best.service : null;
}

// A PUNCH GAP IS NOT A REST PERIOD, and this drew it as one.
//
// Mánu 2026-08-11, looking at his own 07/16: "Why is it showing rest one PM and
// rest three fifteen? I've already said this before. If there's nothing on the
// schedule for a time slot in between shifts, those are unworked hours.
// Therefore, we cannot assume that the rest is right there."
//
// He is right and the engine already agreed with him - 07/16 carries
// `restRecorded: 0` and `restTaken: 0`, and not one rest row in the report is
// under his name that day. `parse.js` files any 10-15 minute gap between punch
// pairs as `kind: "rest"` for its own arithmetic, and drawing that in the
// document's yellow put "you took two rests" directly beside a question asking
// whether he took any.
//
// AND A GAP IS NOT A MEAL EITHER - not even a gap the engine calls
// "rostered-meal". That flag means the gap OVERLAPS a rostered lunch, not that
// it IS one, and reading it as identity got 07/31 wrong: the roster books
// 12:20p-12:50p and the punches are out from 12p to 1p, so the calendar drew
// "Meal 12p-1p" - an hour long, starting twenty minutes early. Mánu 2026-08-12:
// "meal time wrong for seven thirty one."
//
// So the SCHEDULE decides where a meal is and how long it runs, and the gap is
// cut around it. 07/31 becomes: not scheduled 12p-12:20p, meal 12:20p-12:50p,
// not scheduled 12:50p-1p. Where a rostered meal fills a gap exactly - his 07/27
// - the gap is entirely meal and no "not scheduled" is drawn at all, which is
// the other half of the same fix: that stretch IS scheduled.
function gapsOf(day, shifts, scheduled = []) {
  const meals = (scheduled || [])
    .filter((b) => b.meal && b.to > b.from)
    .sort((a, b) => a.from - b.from);
  const out = [];
  for (let i = 1; i < shifts.length; i++) {
    const from = shifts[i - 1].to;
    const to = shifts[i].from;
    if (to <= from) continue;
    // walk the gap, handing each stretch to the rostered meal that covers it
    let at = from;
    for (const m of meals) {
      const lo = Math.max(m.from, from);
      const hi = Math.min(m.to, to);
      if (hi <= lo) continue;
      if (lo > at) out.push({ from: at, to: lo, meal: false });
      out.push({ from: lo, to: hi, meal: true });
      at = hi;
    }
    if (at < to) out.push({ from: at, to, meal: false });
  }
  return out;
}

// what the day says out loud. The blocks are aria-hidden - absolutely positioned
// colour is nothing at all to a screen reader, and this page is read by people
// who use one.
function spoken(day, shifts, rests, staged, scheduled) {
  const bits = shifts.map((s) => {
    const booked = serviceFor(scheduled, s);
    return `worked ${hhmm(s.from)} to ${hhmm(s.to)}${booked ? `, ${serviceLabel(booked)}` : ""}`;
  });
  for (const g of gapsOf(day, shifts, scheduled)) {
    bits.push(
      `${g.kind === "meal" ? "meal break" : "not scheduled"} ${hhmm(g.from)} to ${hhmm(g.to)}`,
    );
  }
  for (const r of rests) {
    const ok = insideAShift(shifts, r.min, r.minutes || 10);
    // WHAT THE BLOCK SAYS, SAID OUT LOUD. This called everything in the list a
    // "rest period on record", which stopped being true once meal-length rows
    // started being drawn here - a sixty minute entry read as the lunch is not
    // a rest, and the one reading this sentence is the one person who cannot
    // see that it is blue and dashed.
    const what = r.kind === "meal"
      ? (r.label === "Meal?"
          ? "a break we think was the lunch, not confirmed,"
          : "a second meal on record")
      : r.label === "Rest (fixed)"
        ? "rest period on record, corrected to"
        : "rest period on record";
    bits.push(
      `${what} ${hhmm(r.min)} to ${hhmm(r.min + (r.minutes || 10))}, `
      + `${ok ? "inside a shift you worked" : "outside any shift you worked"}`
      // the tether is two borders and says nothing at all to a screen reader,
      // so the fact it draws is spoken here instead
      + (r.filed
        ? `, filed against the ${hhmm(r.filed.from)} to ${hhmm(r.filed.to)} shift, which it does not fall inside`
        : ""),
    );
  }
  for (const t of staged) {
    bits.push(`${t.kind === "meal" ? "meal" : "rest"} you are entering at ${hhmm(t.min)}, not saved yet`);
  }
  return bits.length ? `${bits.join(", ")}.` : "Nothing recorded for this day.";
}

export default function DayCalendar({ day, rests = [], scheduled = [], proposed = [] }) {
  // before the early return: a hook cannot be called conditionally
  const staged = useStagedOn(day.date);
  const shifts = shiftsOf(day);
  if (!shifts.length) return null;

  const axis = dayWindow(day, shifts, [...staged, ...rests, ...proposed], scheduled);
  const span = axis.to - axis.from;
  const height = (span / 60) * PX_PER_HOUR;
  const top = (m) => ((m - axis.from) / span) * 100;
  const exact = (from, to) => ((to - from) / span) * 100;
  // WHETHER A BLOCK CAN HOLD ITS OWN LABEL. Mánu 2026-08-12: "if it's too small
  // to be displayed within the boxes, just don't show it and leave the hazard.
  // because the hazard lines in gray are for not scheduled hours."
  //
  // A four minute gap is six pixels and the text is fifteen, so it printed
  // straight through the blocks above and below it. The hatch already says what
  // the space is; the words were only ever the detail on top of it, and detail
  // that does not fit is worse than no detail at all.
  const fitsLabel = (from, to) => (to - from) * (PX_PER_HOUR / 60) >= 15;
  // WHICH WAY A SHORT BREAK GROWS. Mánu 2026-08-12: "you need to make the rest
  // periods flush to their times."
  //
  // The floor grew every break downward from its start, so his 4:50p-5p ten -
  // the last thing in the day - was drawn to 5:05p and hung off the bottom of
  // the shift it happened in. A break has two edges and only one of them is
  // usually the interesting one: a ten at the END of a shift is about where it
  // finished, and one in the middle is about where it began.
  //
  // So it grows AWAY from the edge that matters. Sitting against the end of the
  // shift it belongs to, or the end of the day, it is pinned at the bottom and
  // grows upward; anywhere else it is pinned at the top and grows down. Either
  // way one edge is exactly where it really was, and the label always says both.
  const drawnBreak = (b) => {
    const want = Math.max(b.to - b.from, MIN_BREAK_MIN);
    const host = shifts.find((x) => b.from >= x.from && b.to <= x.to);
    const atEnd = b.to >= (host ? host.to : axis.to);
    if (atEnd || b.from + want > axis.to) {
      const from = Math.max(axis.from, b.to - want);
      return { from, to: b.to };
    }
    return { from: b.from, to: b.from + want };
  };

  const hours = [];
  for (let m = axis.from; m <= axis.to; m += 60) hours.push(m);

  // A REST FILED AGAINST A SHIFT IT DOES NOT SIT IN, and the line joining the
  // two. `filed` is the service window off the report row - see `drawnRest` -
  // and it is only ever set where the break falls outside it.
  //
  // Clamped to the drawn axis: a row can name a service hours outside the day
  // (Romero-Alba's phantom pair ran to 10:20 PM), and a bracket running off the
  // bottom of the column is worse than none. Dropped entirely when the service
  // does not overlap the visible window at all, because a tether to nothing
  // visible is just a mark nobody can read.
  const tethers = [];
  for (const r of rests) {
    if (!r?.filed || !Number.isFinite(r.min)) continue;
    const lo = Math.max(axis.from, Math.min(r.filed.from, r.filed.to));
    const hi = Math.min(axis.to, Math.max(r.filed.from, r.filed.to));
    if (hi <= lo) continue;
    tethers.push({
      from: lo, to: hi,
      at: Math.min(axis.to, Math.max(axis.from, r.min + (r.minutes || 10) / 2)),
    });
  }
  // the break lanes give up the right-hand strip only on a day that needs one
  const breakRight = tethers.length ? BREAK_RIGHT_PCT - TETHER_PCT : BREAK_RIGHT_PCT;

  // ONE ORDERED TIMELINE covering the day, so a block that needs a few more
  // pixels can be given them by the block beside it. `from`/`to` stay the TRUE
  // times and are what every label and the caption read; `drawFrom`/`drawTo` are
  // only ever geometry.
  const tiles = [
    ...shifts.map((x) => ({ from: x.from, to: x.to, kind: "work" })),
    ...gapsOf(day, shifts, scheduled).map((g) => ({
      // `gapsOf` returns `.meal`; the tile it becomes carries `.kind`
      from: g.from, to: g.to, kind: g.meal ? "meal" : "gap",
    })),
  ].sort((a, b) => a.from - b.from);
  for (const t of tiles) { t.drawFrom = t.from; t.drawTo = t.to; }
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (t.kind !== "work") continue;
    const short = MIN_WORK_MIN - (t.to - t.from);
    if (short <= 0) continue;
    const next = tiles[i + 1];
    const prev = tiles[i - 1];
    if (next?.kind === "gap" && next.drawTo - next.drawFrom > short * 2) {
      t.drawTo += short;
      next.drawFrom += short;
    } else if (prev?.kind === "gap" && prev.drawTo - prev.drawFrom > short * 2) {
      t.drawFrom -= short;
      prev.drawTo -= short;
    }
  }
  // TWO BOOKINGS AT ONCE GET A COLUMN EACH. Mánu 2026-08-12: "we need a better
  // way to display clashing times."
  //
  // QSP bills concurrent bookings in full and writes them as one run of punches,
  // so a day really can hold two stretches of work over the same minutes - his
  // Dinley 08/07 is 1p-4p ILS Service with a 1p-1:30p ILS Travel inside it, and
  // five days in this batch are like it. Drawn full width they landed on top of
  // each other and printed one label through the other.
  //
  // The break layer has done this since it was written; work simply never
  // needed it until the overlap cases turned up. Same `laneOut`, so the rule is
  // one rule: a day with no clash comes back as a single lane at full width and
  // draws exactly as it always did.
  const workLanes = laneOut(tiles.filter((t) => t.kind === "work"));
  const worked = workLanes.placed;
  const between = tiles.filter((t) => t.kind !== "work");

  // recorded and half-typed breaks share one lane layout, so a time being
  // entered is placed against what is already there rather than over it
  const breakLanes = laneOut([
    // A RECORDED BREAK IS NOT ALWAYS A REST, AND NOT ALWAYS CONFIRMED. `kind`
    // and `label` come from `drawnRest`, which is what decides that from the
    // report row - a meal-length entry is drawn blue and provisional because
    // that is what the signed sheet does with it, and a repaired one says it was
    // moved. Defaulted, so a caller passing bare {min, minutes} still gets the
    // plain confirmed rest this only ever drew.
    ...rests.map((r) => ({
      from: r.min, to: r.min + (r.minutes || 10),
      kind: r.kind || "rest",
      label: r.label || null,
      filed: r.filed || null,
      corrected: r.corrected, staged: !!r.provisional,
    })),
    ...staged.map((t) => ({
      from: t.min, to: t.min + (t.minutes || 10), kind: t.kind, staged: true,
    })),
    // our reading of a mis-entered row - provisional, so it is drawn the same
    // way a half-typed answer is, and labelled as a guess rather than a record
    ...proposed.map((t) => ({
      from: t.min, to: t.min + (t.minutes || 10), kind: t.kind,
      staged: true, guess: true,
    })),
  ]);

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{spoken(day, shifts, rests, staged, scheduled)}</figcaption>
      <div
        aria-hidden="true"
        className="relative ml-11 border-l border-border"
        style={{ height: `${height}px` }}
      >
        {hours.map((m) => (
          <div
            key={m}
            className="absolute inset-x-0 border-t border-border/70"
            style={{ top: `${top(m)}%` }}
          >
            <span className="absolute -left-11 -top-2 w-10 text-right font-mono text-[11px] leading-4 text-faint">
              {hhmm(m)}
            </span>
          </div>
        ))}

        {/* WORKED TIME, NAMED BY WHAT THE ROSTER BOOKED IT AS. The punches know
            only that time was worked; the schedule is the only document saying
            what it was worked on, and it is matched by overlap rather than by
            exact edges because the two records rarely agree to the minute.

            The CLIENT is not on it - Mánu 2026-08-12: "Just don't include the
            client's name." A day with no schedule keeps the times alone, which
            is what this always showed. */}
        {worked.map((s) => {
          const booked = serviceFor(scheduled, s);
          // room for the two stacked lines a laned block wants, at 15px each
          const twoLines = (s.drawTo - s.drawFrom) * (PX_PER_HOUR / 60) >= 30;
          // A SHORT BLOCK IN A CLASH SPENDS ITS ONE LINE ON THE SERVICE. Stacked
          // labels need 30px and a half-hour booking is 45px, so most fit - but a
          // ten minute one does not, and clipping the second line would hide the
          // exact thing the stacking exists to show. The time is still in the
          // caption and in the sentence beside the picture; the service name is
          // only ever here.
          const serviceOnly = s.lanes > 1 && !twoLines && !!booked;

          return (
            <div
              /* start alone is not unique once two bookings can share a
                 minute - Dinley 08/07 has two blocks beginning at 1p, and React
                 warned that one of them could be dropped */
              key={`w-${s.from}-${s.to}-${s.lane}`}
              /* THE TEN MINUTE BLOCK WAS CUTTING ITS OWN LABEL IN HALF. Mánu
                 2026-08-12: "the MISC is still looking pretty shitty."

                 It was never the colour. The box carried `py-0.5` around a 15px
                 line in a 15px block, so on his 07/30 Misc there was four pixels
                 more content than space and the text lost its top and bottom.
                 Dropping the padding fixes it on its own - a 15px line fits a
                 15px block exactly - so the label goes back to the TOP where it
                 was, which is where it belongs on a four hour block. Mánu
                 2026-08-12: "Go back to putting the time and name at the top."
                 `items-start` with no vertical padding gives both: top-aligned
                 on a tall block, and still uncut on a ten minute one.

                 `gap-x-1.5` replaces the margin that used to sit on the service
                 name, so the two halves keep their space when the second one is
                 absent. */
              /* A LANED BLOCK PUTS ITS SERVICE ON ITS OWN LINE. Mánu
                 2026-08-12: "for the overlaps, I can't see what kind of service
                 it is. I know it's by the color, so I know, but I want someone
                 else to look at this and see what it is."

                 Two bookings at once halve the column, and the time and the
                 service were sharing that half on one line - so "ILS Service"
                 truncated to "ILS Se..." on every overlap, which is exactly the
                 case somebody opens this picture to understand. Wrapping gives
                 the name the whole lane width instead of what the time left it.
                 Only when laned: a full-width block has room for both and
                 stacking there would waste a line. */
              className={`absolute flex overflow-hidden rounded-r-sm border-l-[3px] px-1.5 ${
                s.lanes > 1 ? "flex-col items-start" : "items-start gap-x-1.5"
              }`}
              style={{
                // drawn extent, which for a ten minute service is fifteen
                top: `${top(s.drawFrom)}%`,
                height: `${exact(s.drawFrom, s.drawTo)}%`,
                // one lane on an ordinary day, so this is `left: 0` and the full
                // width - the clash case is the only one that splits
                left: `${(s.lane * 99) / s.lanes}%`,
                width: `${99 / s.lanes}%`,
                borderLeftColor: edgeFor(booked),
                background: washFor(booked),
              }}
            >
              {/* a service that could not borrow its extra height from a gap is
                  still its true size, and would print through its neighbours the
                  same way. Same rule, same reason. */}
              {fitsLabel(s.drawFrom, s.drawTo) && (
                <>
                  {!serviceOnly && (
                    <span className="whitespace-nowrap font-mono text-[12px] leading-[15px] text-muted">
                      {hhmm(s.from)}&ndash;{hhmm(s.to)}
                    </span>
                  )}
                  {booked && (
                    <span className="max-w-full truncate text-[12px] leading-[15px] text-muted">
                      {serviceLabel(booked)}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* THE GAPS BETWEEN SHIFTS. Unscheduled time unless it is meal length,
            in which case the punch-out IS the meal. Never a rest period - see
            the note above. */}
        {between.map((g) => (
          <div
            key={`g-${g.from}-${g.to}`}
            /* TIME NOBODY WAS BOOKED FOR, SAID PROPERLY. Mánu 2026-08-12: "The
               missed time needs to be displayed better. Look at seven thirty."
               His 07/30 has a 110 minute hole in the middle of it, and it drew
               as an empty dashed rectangle with one faint grey line floating at
               the very top - which reads as a rendering fault rather than as a
               fact about the day.

               Hatched, so the emptiness is visibly deliberate; text at `muted`
               instead of `faint`, because this is content and not a watermark;
               and the label CENTRED, so on a two hour hole it sits in the middle
               of what it is describing rather than at one end of it. */
            className={`absolute left-1.5 right-2 flex items-center overflow-hidden rounded-sm px-1.5 ${
              g.kind === "meal"
                ? "text-[#12243a]"
                : "justify-center border border-dashed border-border-strong text-muted"
            }`}
            style={{
              top: `${top(g.drawFrom)}%`,
              height: `${exact(g.drawFrom, g.drawTo)}%`,
              background: g.kind === "meal"
                ? MEAL
                : "repeating-linear-gradient(45deg, transparent, transparent 5px, rgb(148 163 184 / 0.14) 5px, rgb(148 163 184 / 0.14) 10px)",
            }}
          >
            {/* nothing at all when it will not fit - the hatch is the message */}
            {fitsLabel(g.drawFrom, g.drawTo) && (
              <span className="truncate text-[12px] font-semibold leading-[15px]">
                {g.kind === "meal" ? "Meal" : "Not scheduled"}{" "}
                <span className="font-mono font-normal opacity-80">
                  {hhmm(g.from)}&ndash;{hhmm(g.to)}
                </span>
              </span>
            )}
          </div>
        ))}

        {/* THE BREAK LAYER, laid out in lanes down the right of the column.

            A REST IS DRAWN ONLY WHERE ONE IS ACTUALLY ON RECORD for this person
            - the times the engine matched to their own name, plus anything they
            corrected. A day the report holds nothing for draws no rest at all,
            which is the honest picture beside a question asking whether they
            took one.

            A STAGED one is the answer they are still typing. Same lane
            machinery, so a new time slots in beside a recorded rest instead of
            landing on top of it, and it leaves again when the box is cleared. */}
        {breakLanes.placed.map((b) => {
          const ok = b.kind !== "meal" && insideAShift(shifts, b.from, b.to - b.from);
          const hue = b.kind === "meal" ? MEAL : ok ? REST_OK : REST;
          const width = (breakRight - BREAK_LEFT_PCT) / b.lanes;
          return (
            <div
              key={`${b.staged ? "s" : "r"}-${b.kind}-${b.from}-${b.to}-${b.lane}`}
              className={`absolute flex items-center overflow-hidden rounded-sm px-1.5 ${
                b.staged ? "border border-dashed text-foreground" : "text-[#2b2410]"
              }`}
              style={{
                top: `${top(drawnBreak(b).from)}%`,
                height: `${exact(drawnBreak(b).from, drawnBreak(b).to)}%`,
                left: `${BREAK_LEFT_PCT + b.lane * width}%`,
                width: `${width}%`,
                background: b.staged ? `${hue}33` : hue,
                borderColor: b.staged ? hue : undefined,
              }}
            >
              <span className="truncate text-[12px] font-semibold leading-[15px]">
                {b.label || (b.guess ? "We think" : b.kind === "meal" ? (b.staged ? "Lunch" : "Meal") : "Rest")}{" "}
                {/* the range while it has the column to itself; the start time
                    alone once it is sharing, where a range cannot fit and a
                    truncated one reads as a wrong time rather than a short one.
                    The caption always says both. */}
                <span className="font-mono font-normal opacity-80">
                  {b.lanes > 1
                    ? hhmm(b.from)
                    : `${hhmm(b.from)}\u2013${hhmm(b.to)}`}
                </span>
                {b.corrected ? " (you corrected this)" : ""}
              </span>
            </div>
          );
        })}

        {/* THE TETHER. A bracket down the right edge spanning the shift the
            report filed the rest under, and an arm reaching back in to the
            break itself - so "filed against the wrong shift" is one picture
            instead of two times in a sentence.

            Drawn from borders rather than an SVG because it is three straight
            lines and the column is already a percentage-positioned box: an SVG
            would need its own coordinate space kept in step with `top()`.

            The bracket is the SERVICE and the arm is the BREAK, which is the
            direction the fact runs - this is where it says it belongs. */}
        {tethers.map((t, i) => (
          <div key={`t-${t.from}-${t.to}-${i}`}>
            <div
              className="absolute rounded-r-sm border-y-2 border-r-2 border-border-strong"
              style={{
                top: `${top(t.from)}%`,
                height: `${exact(t.from, t.to)}%`,
                left: `${breakRight + 1}%`,
                width: `${TETHER_PCT - 2}%`,
              }}
            />
            {/* the arm, at the middle of the break, running from the bracket
                back to the edge of the break lane it belongs to */}
            <div
              className="absolute border-t-2 border-border-strong"
              style={{
                top: `${top(t.at)}%`,
                left: `${breakRight - 1}%`,
                width: `${TETHER_PCT}%`,
              }}
            />
          </div>
        ))}
      </div>
    </figure>
  );
}
