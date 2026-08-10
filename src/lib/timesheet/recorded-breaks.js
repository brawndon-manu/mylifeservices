// What the two source documents actually RECORDED, per day, for one person.
//
// This exists because of a rule: the signed sheet colours only official rest
// periods and meal breaks, from the Rest Periods Report and the month schedule.
// A gap between punches is not evidence of a break - it is just as likely to be
// travel between two clients, and on this period 102 of them were exactly that.
//
// The reason a count was never enough: a properly taken rest break is PAID and
// stays ON the clock, so it leaves no punch gap at all. 204 of the 226 days
// carrying a logged rest have nothing in the punch record to point at. The
// times have to come from the report itself.

import { restKey, isMealLengthRest } from "./rests.js";

const RANGE = /^\s*(\d{1,2}(?::\d{2})?[ap])\s*-\s*(\d{1,2}(?::\d{2})?[ap])/i;

// "3:50 PM" -> "3:50p", so a rest-report time prints like every other time on
// the sheet. QSP writes them in two different styles across its own exports.
export function shortTime(s) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP])M?$/i.exec(String(s ?? "").trim());
  if (!m) return String(s ?? "").trim();
  const mins = m[2] === "00" ? "" : `:${m[2]}`;
  return `${Number(m[1])}${mins}${m[3].toLowerCase()}`;
}

const toMin = (t) => {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])$/i.exec(String(t || "").trim());
  if (!m) return null;
  const h = Number(m[1]) % 12;
  return (/^p$/i.test(m[3]) ? h + 12 : h) * 60 + Number(m[2] || 0);
};

// minutes -> the sheet's own short form, the inverse of toMin above
const hhmmShort = (min) => {
  const h24 = Math.floor(min / 60), mm = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h24 < 12 ? "a" : "p"}`;
};

// Put a recorded break back into the punch row.
//
// A break has to be shown WHERE IT HAPPENED, and punches come in in/out pairs,
// so there are only three shapes:
//
//   inside a worked segment  - split it into three contiguous segments. The day
//                              loses no time: 10a-12p becomes 10a-12p, 12p-12:10p,
//                              12:10p-2p, which still totals four hours. This is
//                              the common case (336 of 512), because a properly
//                              taken rest is paid and never left the clock.
//                              Uribe 07/30 already reads this way in the raw
//                              export, where QSP logged the rest as ILS Misc.
//   equals an existing gap   - nothing to insert; colour the two punches that
//                              bound it. This is what an unpaid meal looks like.
//   inside a gap but smaller - inserted as its own in and out, whichever break
//                              it is. Mánu 2026-08-09: "if there are start and
//                              end times for 10 minute rest period and 30 minute
//                              unpaid meal breaks then there always has to be 2
//                              of them." A rest is hazard-striped because those
//                              minutes were ADDED; a meal is blue because it is
//                              unpaid. The colour is what stops the meal's pair
//                              reading as worked time, and the daily total is
//                              summed from the stored day, never from these
//                              cells. The remainder of the clock-out is left
//                              plain - ordinary rostered unpaid time, not ours
//                              to comment on.
//   outside every punch      - a REST only: inserted in clock order and striped.
//                              April's 7:00-7:10 against an 8:00 start.
//
// Returns { punches, unplaced } where each punch carries `mark` = "rest" |
// "meal" | "added" | null. THE COLOUR IS THE LANGUAGE - Mánu 2026-08-09, giving
// the layout cell by cell: yellow for a rest, hazard-striped yellow for a rest
// whose minutes we added, blue for a meal. Cell markers were tried and dropped;
// the colour already says which cell and the key already says what it means.
//
// `unplaced` is only for what could NOT be drawn on the row - a rest the engine
// refused, a reversed row worth admitting to, times QSP wrote unreadably.
export function insertRecordedBreaks(punches, entries) {
  let p = (punches || []).map((x) => ({ ...x, mark: null }));
  const unplaced = [];

  for (const e of entries || []) {
    let placedUnknown = false;
    const s = toMin(e.from);
    const en = toMin(e.to);
    // "meal-adjusted" is a meal everywhere the logic branches on kind - it is
    // unpaid, it never inserts into a clock-out, it never repaints a marked
    // cell. It differs only in how it is DRAWN: blue with hazard stripes, so it
    // reads as a meal nobody has confirmed yet.
    const kind = e.kindOf === "meal" ? (e.adjusted ? "meal-adjusted" : "meal") : "rest";

    // A REST WITH NO TIMES ON IT. The report says a break happened on this shift
    // and holds neither end of it. Mánu 2026-08-09: draw it as a gap inside the
    // shift it was filed against, with the times as ???, and charge nothing -
    // they took it and forgot to enter the times.
    //
    // Placed by the SHIFT the report itself names, not by guessing at a punch
    // gap, which is the thing this column exists not to do.
    if (e.unknown) {
      const a = toMin(e.shiftFrom), b = toMin(e.shiftTo);
      for (let i = 0; i + 1 < p.length; i += 2) {
        if (a == null || b == null) break;
        if (p[i].min < a || p[i + 1].min > b) continue;
        const mid = Math.round((p[i].min + p[i + 1].min) / 2);
        p = [
          ...p.slice(0, i + 1),
          { raw: "???", min: mid, mark: "unknown-rest" },
          { raw: "???", min: mid, mark: "unknown-rest" },
          ...p.slice(i + 1),
        ];
        placedUnknown = true;
        break;
      }
      if (!placedUnknown) unplaced.push({ ...e, why: "recorded with no times" });
      continue;
    }
    if (s == null || en == null || en <= s) { unplaced.push({ ...e, why: "unreadable times" }); continue; }

    // A REST THE ENGINE REFUSED IS NOT AN ADDED REST. `counted:false` means no
    // minutes went into the day, so striping it tells the person we added time
    // we did not add - and the stripe is the one mark on the row that means
    // money. All six on this batch are `too-long`.
    //
    // The two 730-minute ones fit no worked segment and no unpaid gap, so they
    // fell through to the outside-every-punch branch and were APPENDED after
    // the last punch. Romero-Alba's 30th printed 4p, then 10:10a, then 10:20p:
    // a row that runs backwards and ends on a punch she never made, on a
    // document she signs. It swallowed her real meal too - 12:30p-1p then fitted
    // inside the phantom pair and split THAT instead of the 12p-1p clock-out.
    //
    // Explicitly `=== false`, not falsy: only `recordedBreaksFor` sets this, and
    // a caller that never mentions `counted` still gets drawn.
    if (kind === "rest" && e.counted === false) {
      unplaced.push({ ...e, why: "not counted as a rest" });
      continue;
    }

    // a worked segment: pairs at (0,1), (2,3), ...
    //
    // A BREAK IS A CLOCK-OUT AND A CLOCK-BACK-IN, so it is drawn as the GAP
    // between two punches, not as a pair of its own. Mánu 2026-08-09: "it has
    // to be time out and then time in... it would be ten AM clock in, twelve PM
    // clock out, twelve ten PM clock in, two PM clock out."
    //
    // This used to split the segment into THREE pairs and colour the middle one,
    // which printed 10a-12p, 12p-12:10p, 12:10p-2p and read as though somebody
    // clocked in at noon to take a break. Now it splits into two and colours the
    // out and the in that bound it, which is what the row means.
    //
    // The ten minutes are still PAID and still in the daily total - the colour
    // key says so - they are simply no longer between a punch pair. That also
    // costs two fewer cells per break, which is why fewer days overflow the row.
    let placed = false;
    for (let i = 0; i + 1 < p.length; i += 2) {
      if (s < p[i].min || en > p[i + 1].min) continue;
      const open = p[i];
      const close = p[i + 1];
      // a break flush against either end of the segment has no gap to sit in -
      // there is no punch to be the "out" - so mark the bounding punch instead
      // of manufacturing a zero-length pair.
      // ALWAYS SPLIT, even when the break is flush against an end and the pair
      // either side comes out zero-length. Mánu's own layout for his 30th, where
      // QSP logged the rest as its own misc entry 12p-12:10p:
      //
      //     10a | 12p | 12p | 12p | 12:10p | 12:10p | 2p | 4p
      //                       ^^^^^^^^^^^^ the break, coloured
      //
      // A zero-length pair looks odd in isolation and is the honest shape: those
      // punches are what QSP holds, and the break is the gap between them. The
      // alternative was colouring one bounding punch, which put the colour on a
      // cell that is not the break.
      p = [
        ...p.slice(0, i),
        open,
        { raw: e.from, min: s, mark: kind },
        { raw: e.to, min: en, mark: kind },
        close,
        ...p.slice(i + 2),
      ];
      if (e.reversed) unplaced.push({ ...e, why: "reversed in the report" });
      placed = true;
      break;
    }
    if (placed) continue;

    // an unpaid gap: pairs at (1,2), (3,4), ...
    for (let i = 1; i + 1 < p.length; i += 2) {
      if (s < p[i].min || en > p[i + 1].min) continue;
      const exact = p[i].min === s && p[i + 1].min === en;
      if (kind === "rest") {
        // A REST HERE IS TIME WE ADDED, so it is drawn as its own in and out
        // rather than by tinting whatever the person happened to be clocked out
        // for. Mánu 2026-08-09: "it would be appropriate to put clock in and
        // clock out because it's additional hours that we're adding in."
        //
        // The old behaviour coloured the WHOLE clock-out, so a ten taken inside
        // a fifteen minute gap printed as a fifteen minute rest and a footnote
        // underneath corrected it. And the rest of that gap is ordinary unpaid
        // time somebody rostered - "if there are gaps in the schedule, we just
        // don't acknowledge it" - so it is now left alone entirely.
        // still worth a footnote: the stripes say "added" but not why, and the
        // sentence is what an employee reads when the daily total is above what
        // they punched. Mánu 2026-08-09: "explaining the footnote is good".
        if (exact) {
          p[i].mark = "added";
          p[i + 1].mark = "added";
        } else {
          p = [
            ...p.slice(0, i + 1),
            { raw: e.from, min: s, mark: "added" },
            { raw: e.to, min: en, mark: "added" },
            ...p.slice(i + 1),
          ];
        }
      } else if (exact) {
        // THE MEAL IS THE GAP, so the two punches already on the row ARE its
        // start and end. Mánu 2026-08-09: "if there are recorded meal breaks
        // that are against another shift then you dont need to repeat it" - a
        // 10a-2p shift, lunch 2p-2:30p, next shift at 2:30p is six cells, not
        // eight. 90 of the 166 recorded meals on this batch are this case.
        //
        // NEVER OVERWRITE A MARK ALREADY ON THE CELL. On Uribe's 31st the 12:10p
        // cell is both the end of an added rest and the start of the gap the
        // meal sits in; the meal was repainting it blue and the added rest lost
        // its colour, which is the one colour on the row that means money.
        // Breaks are processed in clock order, so first claim wins.
        if (!p[i].mark) p[i].mark = kind;
        if (!p[i + 1].mark) p[i + 1].mark = kind;
      } else {
        // A BREAK WITH A START AND AN END GETS TWO CELLS OF ITS OWN. Mánu
        // 2026-08-09: "if there are start and end times for 10 minute rest
        // period and 30 minute unpaid meal breaks then there always has to be 2
        // of them", giving his 31st as 8a | 9:30a | 10a | 12p | 12p | 12:10p |
        // 12:20p | 12:50p | 1p | 4p - the meal drawn at its real times rather
        // than by tinting the punches that happen to bound the gap.
        //
        // This used to tint the bounding punches and footnote the real times
        // underneath, on the grounds that a meal is unpaid so inserting punches
        // would claim hours nobody worked. The colour is what answers that: the
        // pair is BLUE and the key calls it a 30-minute UNPAID meal break. The
        // daily total is summed from the stored day, never from these cells, so
        // nothing on the page is counting them as worked.
        p = [
          ...p.slice(0, i + 1),
          { raw: e.from, min: s, mark: kind },
          { raw: e.to, min: en, mark: kind },
          ...p.slice(i + 1),
        ];
      }
      placed = true;
      break;
    }
    if (placed) continue;

    // OUTSIDE EVERY PUNCH - before the first clock-in or after the last
    // clock-out. April's 7:00-7:10 against an 8:00 start, eleven days running.
    // Those minutes are added too, so the pair is inserted in clock order and
    // striped. Nothing here pretends she punched at 7: the stripes are what say
    // this is time added rather than time QSP recorded.
    if (kind === "rest" && p.length) {
      // A REST ROSTERED OUTSIDE THE WHOLE SCHEDULED DAY IS ITS OWN THING.
      // Mánu 2026-08-09: a ten taken before the first shift starts, or after the
      // last one ends, is drawn BLUE WITH RED STRIPES rather than as an ordinary
      // added rest, because it is not a break in the working day at all - it is
      // ten minutes recorded against no shift.
      //
      // AS OF 2026-08-09 (evening) THE MINUTES ARE NO LONGER PAID: Mánu ruled
      // the entry a misclick, so `analyzeDay` withholds them from paid hours.
      // The cells are still drawn where the record puts them, because the
      // employee is asked to confirm that reading and cannot confirm what the
      // sheet does not show. The red stripes now mean "we did not count this
      // time", not "we added it".
      //
      // A ten at the very END of a shift she was on (3p-5p with a break at
      // 4:50p) is NOT this - it is inside the day and only worth a note.
      const mark = e.outsideShift ? "added-outside" : "added";
      const at = p.findIndex((x, i) => i % 2 === 0 && x.min >= en);
      const pair = [
        { raw: e.from, min: s, mark },
        { raw: e.to, min: en, mark },
      ];
      p = at === -1 ? [...p, ...pair] : [...p.slice(0, at), ...pair, ...p.slice(at)];
      continue;
    }
    unplaced.push({ ...e, why: "matches no punch" });
  }

  return { punches: p, unplaced };
}

// Fold a rest the EMPLOYEE told us about into that date's entries.
//
// They are answering a repair we proposed, and our proposal is a mechanical
// guess: proposeRepair takes the first single-field fix that lands between ten
// and fifteen minutes, so on a day a break really happened it can still name the
// wrong ten minutes. This is the answer "yes, but not then".
//
// It counts, so it is drawn like any other rest: yellow inside a worked segment,
// hazard-striped and PAID if it falls in a clock-out, per the off-clock rule of
// 2026-08-09. Where it came from is said in a footnote rather than in a colour.
export function withStatedRest(order, stated) {
  if (!stated?.from || !stated?.to) return order || [];
  const entry = { ...stated, kindOf: "rest", counted: true, stated: true };
  // clock order, so it meets the same first-claim-wins marking as the rest of
  // them rather than always painting last
  return [...(order || []), entry].sort((a, b) => (toMin(a.from) ?? 0) - (toMin(b.from) ?? 0));
}

// The working day as the SCHEDULE draws it: first rostered start to last
// rostered end, ignoring the meal blocks themselves. Used to tell a break inside
// somebody's day from ten minutes recorded against no shift at all.
export function scheduledDay(scheduleByDate, date) {
  const shifts = [];
  for (const s of scheduleByDate?.[date]?.shifts || []) {
    if (s.meal) continue;
    const m = RANGE.exec(String(s.text || ""));
    if (!m) continue;
    const a = toMin(m[1]), b = toMin(m[2]);
    if (a == null || b == null) continue;
    shifts.push({ s: a, e: b });
  }
  if (!shifts.length) return null;
  return {
    first: Math.min(...shifts.map((x) => x.s)),
    last: Math.max(...shifts.map((x) => x.e)),
    shifts,
  };
}

// -> Map(date -> { meals: [{from,to}], rests: [{from,to,minutes,counted,kind}] })
export function recordedBreaksFor(sourceName, restsByDate, scheduleByDate) {
  const out = new Map();
  const get = (date) => {
    if (!out.has(date)) out.set(date, { meals: [], rests: [] });
    return out.get(date);
  };

  // meals: the schedule is the only thing that can say a meal period happened,
  // and it prints the times inside the block text.
  for (const [date, v] of Object.entries(scheduleByDate || {})) {
    for (const s of v?.shifts || []) {
      if (!s.meal) continue;
      const m = RANGE.exec(String(s.text || ""));
      if (!m) continue;
      // A MEAL ROSTERED AT AN HOUR NOBODY WORKS IS AN AM/PM SLIP. Bucio 07/25
      // has "12a-12:10a -Meal Break(0:10)" against shifts of 9a-12:30p and
      // 12:45p-4:45p. Mánu 2026-08-09: "no one works those hours" - so it is
      // read twelve hours over, drawn there, and the employee is asked.
      //
      // Only the whole block moves, and only when BOTH ends land back inside an
      // ordinary working day. A half-corrected time is worse than the original.
      const a = toMin(m[1]), b = toMin(m[2]);
      const odd = a != null && (a < 300 || a >= 1320);
      const flipped = odd && a + 720 <= 1439 && b != null && b + 720 <= 1439;
      if (flipped) {
        get(date).meals.push({
          from: hhmmShort(a + 720), to: hhmmShort(b + 720),
          ampmFixed: true, wasFrom: m[1], wasTo: m[2],
        });
        continue;
      }
      get(date).meals.push({ from: m[1], to: m[2] });
    }
  }

  // rests: matched to this person by the same key the engine matches on
  const key = restKey(sourceName);
  for (const r of restsByDate || []) {
    if (restKey(r.name) !== key) continue;
    // A ROW WITH NEITHER TIME ON IT used to be dropped here, so the sheet said
    // nothing at all and the day simply owed a premium. The report is asserting
    // a break happened on a named shift; the honest drawing is to show it on
    // that shift with the times unknown. Mánu 2026-08-09.
    if (!r.out || !r.in) {
      const sh = /^\s*(.+?)\s+to\s+(.+?)\s*$/i.exec(String(r.shift || ""));
      if (sh) {
        get(r.date).rests.push({
          from: "???", to: "???", minutes: null, counted: false,
          kind: r.kind || "no-times", reversed: false, outsideShift: false,
          unknown: true, shiftFrom: shortTime(sh[1]), shiftTo: shortTime(sh[2]),
        });
      }
      continue;
    }
    // A reversed row is out and in typed into each other's boxes, and flipping
    // them IS the repair. Printing it in stored order put "12:10p-12p" on the
    // signed sheet - a break that ends before it starts, in the column that is
    // supposed to be the trustworthy one.
    const [from, to] = r.reversed ? [r.in, r.out] : [r.out, r.in];
    // AN ENTRY THAT IS THE LENGTH OF A MEAL IS DRAWN AS ONE. It sits in the rest
    // report, but thirty minutes is not a rest break, and the two on this batch
    // are on days with no meal rostered at all. Shown blue and striped so it
    // reads as "a meal we are not sure about" rather than as a rest that
    // happened. Nothing about the premium moves: that needs a person.
    if (isMealLengthRest(r)) {
      get(r.date).meals.push({
        from: shortTime(from),
        to: shortTime(to),
        minutes: r.minutes,
        adjusted: true,
      });
      continue;
    }
    // is this ten minutes inside the working day at all? Only meaningful when
    // the schedule holds that day - with no roster there is nothing to be
    // outside OF, and guessing from punches is what this column exists not to do.
    const day = scheduledDay(scheduleByDate, r.date);
    const s0 = toMin(shortTime(from)), e0 = toMin(shortTime(to));
    const outsideShift = !!day && s0 != null && e0 != null
      && !day.shifts.some((x) => s0 >= x.s && e0 <= x.e)
      && (e0 <= day.first || s0 >= day.last);

    get(r.date).rests.push({
      from: shortTime(from),
      to: shortTime(to),
      minutes: r.minutes,
      outsideShift,
      // only a break that counted gets coloured as one. the rest are shown
      // uncoloured with a marker, because "QSP holds something unreadable here"
      // is worth telling the person signing rather than hiding.
      counted: !!r.counted,
      kind: r.kind || null,
      // so the sheet can say we flipped it rather than just showing the fixed
      // version and hoping nobody wonders.
      reversed: !!r.reversed,
    });
  }

  // sorted by CLOCK TIME, not by kind. Mánu's 07/27 listed the 2p meal above
  // the 12p rest because meals were collected first, which reads as though the
  // day happened in that order.
  const asMin = (t) => {
    const m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])$/i.exec(String(t || "").trim());
    if (!m) return 0;
    const h = Number(m[1]) % 12;
    return (/^p$/i.test(m[3]) ? h + 12 : h) * 60 + Number(m[2] || 0);
  };
  for (const v of out.values()) {
    v.meals.sort((a, b) => asMin(a.from) - asMin(b.from));
    v.rests.sort((a, b) => asMin(a.from) - asMin(b.from));
    v.order = [
      ...v.meals.map((m) => ({ ...m, kindOf: "meal" })),
      ...v.rests.map((r) => ({ ...r, kindOf: "rest" })),
    ].sort((a, b) => asMin(a.from) - asMin(b.from));
  }
  return out;
}
