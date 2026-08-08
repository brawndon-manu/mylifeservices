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

import { restKey } from "./rests.js";

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
//   inside a gap but smaller - do NOT insert. The gap is unpaid time and putting
//                              punches inside it would claim hours nobody worked.
//                              The bounding cells are coloured and the exact
//                              times go in the note.
//
// Returns { punches, unplaced } where each punch carries `mark` = "rest" |
// "meal" | null, and `unplaced` lists what could not be shown on the row.
export function insertRecordedBreaks(punches, entries) {
  let p = (punches || []).map((x) => ({ ...x, mark: null }));
  const unplaced = [];

  for (const e of entries || []) {
    const s = toMin(e.from);
    const en = toMin(e.to);
    const kind = e.kindOf === "meal" ? "meal" : "rest";
    if (s == null || en == null || en <= s) { unplaced.push({ ...e, why: "unreadable times" }); continue; }

    // a worked segment: pairs at (0,1), (2,3), ...
    let placed = false;
    for (let i = 0; i + 1 < p.length; i += 2) {
      if (s < p[i].min || en > p[i + 1].min) continue;
      const head = p.slice(0, i);
      const tail = p.slice(i + 2);
      const open = p[i];
      const close = p[i + 1];
      const mid = [
        { raw: e.from, min: s, mark: kind },
        { raw: e.to, min: en, mark: kind },
      ];
      const before = s > open.min ? [open, { raw: e.from, min: s, mark: null }] : [];
      const after = en < close.min ? [{ raw: e.to, min: en, mark: null }, close] : [];
      p = [...head, ...before, ...mid, ...after, ...tail];
      placed = true;
      break;
    }
    if (placed) continue;

    // an unpaid gap: pairs at (1,2), (3,4), ...
    for (let i = 1; i + 1 < p.length; i += 2) {
      if (s < p[i].min || en > p[i + 1].min) continue;
      p[i].mark = kind;
      p[i + 1].mark = kind;
      // the gap is longer than the break, so the colour is approximate and the
      // real times are worth saying out loud
      if (p[i].min !== s || p[i + 1].min !== en) unplaced.push({ ...e, why: "inside a longer gap" });
      placed = true;
      break;
    }
    if (!placed) unplaced.push({ ...e, why: "matches no punch" });
  }

  return { punches: p, unplaced };
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
      get(date).meals.push({ from: m[1], to: m[2] });
    }
  }

  // rests: matched to this person by the same key the engine matches on
  const key = restKey(sourceName);
  for (const r of restsByDate || []) {
    if (restKey(r.name) !== key) continue;
    if (!r.out || !r.in) continue;
    // A reversed row is out and in typed into each other's boxes, and flipping
    // them IS the repair. Printing it in stored order put "12:10p-12p" on the
    // signed sheet - a break that ends before it starts, in the column that is
    // supposed to be the trustworthy one.
    const [from, to] = r.reversed ? [r.in, r.out] : [r.out, r.in];
    get(r.date).rests.push({
      from: shortTime(from),
      to: shortTime(to),
      minutes: r.minutes,
      // only a break that counted gets coloured as one. the rest are shown
      // uncoloured with a marker, because "QSP holds something unreadable here"
      // is worth telling the person signing rather than hiding.
      counted: !!r.counted,
      kind: r.kind || null,
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
