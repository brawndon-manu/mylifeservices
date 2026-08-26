"use client";

// EVERY SCHEDULED SHIFT, ROSTERED AGAINST CLOCKED.
//
// One row per shift, the two records side by side, and the difference at each
// end. The rows arrive as plain data rather than as rendered children - unlike
// ChecksFilter next door - because a fortnight is around a thousand of them and
// the filters have to cut that down before the DOM sees it.
//
// Nothing here computes an hour. See the page beside it.
import { useMemo, useState } from "react";

// minutes past midnight -> "12:08p"
const clock = (min) => {
  if (min == null) return null;
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const x = h % 12 || 12;
  return `${x}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
};

const span = (from, to) => (from == null || to == null ? null : `${clock(from)}-${clock(to)}`);
const hrs = (min) => (min == null ? null : `${(min / 60).toFixed(2)}h`);

// "+8" / "-7" / null. The sign is the whole point: late at the start and early
// at the end are opposite problems and both read as "off by 8".
const signed = (n) => (n == null ? null : n > 0 ? `+${n}` : String(n));

// how far off the roster counts as worth looking at. Ten minutes because the
// measured spread on 08/16-08/22 is a handful of one and two minute differences
// against clock-outs an hour and more early, and a filter that catches both
// catches nothing.
const OFF_BY = 10;

// WHAT IS PAID AGAINST WHAT WAS CLOCKED, handed in by the page.
//
// Payroll runs off the roster: all 62 sheets of 62 on the 08/16-08/22 batch
// have paid hours exactly equal to their non-meal scheduled total. So a shift
// bills its rostered length whatever the clock says. `paidAboveClock` in
// clock.js owns the rule and is tested there; null means the shift was not
// clocked at both ends, which is not a difference of zero.
const gapOf = (s) => s.gapMin ?? null;

// the same ten minutes the punctuality filter uses. A shift paid nine minutes
// above its clock is inside the noise of when people press the button; the
// bands measured on one week put 44 of the 61 short shifts at ten or more.
const PAID_OVER = 10;

const isOff = (s) =>
  (s.startDelta != null && Math.abs(s.startDelta) >= OFF_BY)
  || (s.endDelta != null && Math.abs(s.endDelta) >= OFF_BY);

const FILTERS = [
  {
    key: "noclock",
    label: "Never clocked",
    hint: "No clock-in or no clock-out on the shift. The time on that end was typed, not clocked, so there is nothing to compare it against.",
    match: (s) => s.noIn || s.noOut,
  },
  {
    key: "off",
    label: `Off the roster by ${OFF_BY} minutes or more`,
    hint: "The clock and the schedule disagree by ten minutes or more at one end of the shift.",
    match: isOff,
  },
  {
    key: "paidover",
    label: `Paid ${PAID_OVER} minutes or more above the clock`,
    hint: "The shift bills its rostered length and the clock ran shorter than that. Ending early can be perfectly proper - the reason column is where that shows.",
    match: (s) => (gapOf(s) ?? 0) >= PAID_OVER,
  },
  {
    key: "gps",
    label: "No location captured",
    hint: "The clock was taken with GPS off. Blank is not counted here - a shift nobody clocked into never had a location to capture.",
    match: (s) => s.gpsIn === "no" || s.gpsOut === "no",
  },
  {
    key: "cap",
    label: "Worked over 3.5 hours",
    hint: "An ILS Service or Self Determination shift that ran past the cap. Only countable on a shift clocked at both ends.",
    match: (s) => s.overCap,
  },
  {
    key: "disagree",
    label: "QSP contradicts its own times",
    hint: "QSP flags the shift late, early or on time, and the times it prints beside that say something else.",
    match: (s) => s.disagrees.length > 0,
  },
  {
    key: "reason",
    label: "A reason was given",
    hint: "Staff typed a reason on the shift.",
    match: (s) => !!s.reason,
  },
];

const TONE = {
  paidover: "border-2 border-orange-400 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/40",
  noclock: "border-2 border-rose-400 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40",
  off: "border-2 border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40",
  gps: "border-2 border-sky-400 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40",
  cap: "border-2 border-fuchsia-400 bg-fuchsia-50 dark:border-fuchsia-700 dark:bg-fuchsia-950/40",
  disagree: "border-2 border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/40",
  reason: "border-2 border-emerald-400 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40",
};
const NUM = {
  paidover: "text-orange-600 dark:text-orange-400",
  noclock: "text-rose-600 dark:text-rose-400",
  off: "text-amber-600 dark:text-amber-400",
  gps: "text-sky-600 dark:text-sky-400",
  cap: "text-fuchsia-600 dark:text-fuchsia-400",
  disagree: "text-violet-600 dark:text-violet-400",
  reason: "text-emerald-600 dark:text-emerald-400",
};

export default function AuditTable({ shifts, files, coverage, capMinutes }) {
  const [on, setOn] = useState({});
  const [who, setWho] = useState("");
  const [byPerson, setByPerson] = useState(false);

  const counts = useMemo(() => {
    const c = {};
    for (const f of FILTERS) c[f.key] = shifts.filter(f.match).length;
    return c;
  }, [shifts]);

  // WHAT CAN BE COMPARED AT ALL, which is the first thing an auditor has to
  // know. A quarter of the shifts have no clock-in, so a screen reporting "56
  // shifts off the roster" without this reads as 56 of 512 when it is 56 of 385.
  const comparable = useMemo(
    () => ({
      start: shifts.filter((s) => s.startDelta != null).length,
      end: shifts.filter((s) => s.endDelta != null).length,
      worked: shifts.filter((s) => s.workedMin != null).length,
    }),
    [shifts],
  );

  // THE BILLABLE READING. Paid across every shift, against clocked on the ones
  // that can answer for themselves - two different denominators, so both are
  // printed rather than one figure that quietly mixes them.
  const money = useMemo(() => {
    let paidAll = 0, paid = 0, clocked = 0, n = 0;
    for (const s of shifts) {
      paidAll += s.scheduledMin ?? 0;
      const g = gapOf(s);
      if (g == null) continue;
      n++;
      paid += s.scheduledMin;
      clocked += s.workedMin;
    }
    return { paidAll, paid, clocked, n, gap: paid - clocked };
  }, [shifts]);

  const active = FILTERS.filter((f) => on[f.key]);

  // the search narrows WHO is on the page; the chips narrow which of their
  // shifts. They are separated because the per-person totals below need the
  // denominator - three missed clock-ins out of four shifts and three out of
  // forty are not the same person to talk to.
  const searched = useMemo(() => {
    const q = who.trim().toLowerCase();
    if (!q) return shifts;
    return shifts.filter((s) =>
      `${s.who} ${s.name} ${s.client || ""}`.toLowerCase().includes(q),
    );
  }, [shifts, who]);

  const shown = useMemo(
    () => (active.length ? searched.filter((s) => active.some((f) => f.match(s))) : searched),
    [searched, active],
  );

  // one line per person, for the question the shift list cannot answer: who
  // does this every week rather than who did it once. Counted over every shift
  // they worked rather than over the filtered ones, so the first column stays a
  // denominator whatever is switched on above.
  const people = useMemo(() => {
    const m = new Map();
    for (const s of searched) {
      let p = m.get(s.who);
      if (!p) {
        p = { who: s.who, shifts: 0, noIn: 0, noOut: 0, gps: 0, cap: 0, off: 0, disagrees: 0,
              paid: 0, clocked: 0, gap: 0 };
        m.set(s.who, p);
      }
      p.shifts++;
      // THE THREE MONEY COLUMNS DESCRIBE ONE POPULATION. Counting paid over
      // every shift while clocked can only count the clocked ones leaves a row
      // whose own arithmetic does not work - Torres reads 16.75 paid, 11.22
      // clocked and a difference of 3.53 - and a reader is right to distrust
      // the whole table over it. The shifts with nothing to compare are
      // reported by the two columns that exist to report them.
      const g = gapOf(s);
      if (g != null) { p.paid += s.scheduledMin; p.clocked += s.workedMin; p.gap += g; }
      if (s.noIn) p.noIn++;
      if (s.noOut) p.noOut++;
      if (s.gpsIn === "no" || s.gpsOut === "no") p.gps++;
      if (s.overCap) p.cap++;
      if (isOff(s)) p.off++;
      if (s.disagrees.length) p.disagrees++;
    }
    return [...m.values()].sort((a, b) => b.gap - a.gap || a.who.localeCompare(b.who));
  }, [searched]);

  return (
    <>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
        Every shift the roster booked, with what the clock recorded against it.{" "}
        {coverage?.from && (
          <>
            {coverage.from} to {coverage.to}, {coverage.days} days, from{" "}
            {files.length === 1 ? "one export" : `${files.length} exports`}.
          </>
        )}
      </p>

      {/* WHAT IS PAID, AGAINST WHAT WAS CLOCKED. The first figure a reviewer
          wants and the reason the screen exists, so it leads - and it names its
          own denominator, because the shifts that can answer are a subset and a
          single number would hide that. */}
      <div className="mt-5 flex flex-wrap gap-x-10 gap-y-4 rounded-xl border border-border bg-surface-2 p-5">
        <Figure n={hrs(money.paidAll)} label="Paid" sub={`${shifts.length} shifts, at their rostered length`} />
        <Figure n={hrs(money.clocked)} label="Clocked" sub={`${money.n} shifts clocked at both ends`} />
        <Figure
          n={`${money.gap >= 0 ? "+" : ""}${hrs(money.gap)}`}
          label="Paid above the clock"
          sub={`on those ${money.n}, against ${hrs(money.paid)} paid`}
          tone={money.gap > 0 ? "text-orange-600 dark:text-orange-400" : "text-foreground"}
        />
      </div>

      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-faint">
        {shifts.length} shifts. {comparable.start} can be compared at the clock-in and{" "}
        {comparable.end} at the clock-out; the rest were never clocked at that end.{" "}
        {comparable.worked} ran long enough to measure against the{" "}
        {(capMinutes / 60).toFixed(1)} hour cap. Payroll pays the rostered hours, so a shift that
        ran short was still paid in full. Nothing on this page changes an hour, a premium or a
        signed timesheet.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FILTERS.map((f) => {
          const isOn = !!on[f.key];
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={isOn}
              onClick={() => setOn((s) => ({ ...s, [f.key]: !s[f.key] }))}
              className={`rounded-xl p-4 text-left transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                isOn ? `${TONE[f.key]} p-[calc(1rem-1px)]` : "border border-border bg-surface opacity-60"
              }`}
            >
              <span
                className={`block text-3xl font-bold tabular-nums leading-none ${
                  isOn ? NUM[f.key] : "text-faint"
                }`}
              >
                {counts[f.key]}
              </span>
              <span className="mt-1 block text-sm font-bold text-foreground">{f.label}</span>
              <span className="mt-1 block text-xs leading-snug text-muted">{f.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder="Filter by person or client"
          className="w-64 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setByPerson((v) => !v)}
          className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
        >
          {byPerson ? "Show every shift" : "Total up by person"}
        </button>
        <span className="text-xs text-faint">
          {active.length === 0
            ? `Showing all ${shown.length} shifts.`
            : `Showing ${shown.length} of ${shifts.length} shifts.`}
        </span>
      </div>

      {byPerson ? (
        <>
        <p className="mt-4 text-xs text-faint">
          Every shift each person worked in the period, not only the ones the boxes above are
          showing. Paid, clocked and the difference cover the shifts clocked at both ends; the
          two columns beside them count the shifts that left nothing to compare.
        </p>
        <div className="mt-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="px-3 py-2 font-semibold">Person</th>
                <th className="px-3 py-2 text-right font-semibold">Shifts</th>
                <th className="px-3 py-2 text-right font-semibold">Paid</th>
                <th className="px-3 py-2 text-right font-semibold">Clocked</th>
                <th className="px-3 py-2 text-right font-semibold">Above the clock</th>
                <th className="px-3 py-2 text-right font-semibold">No clock-in</th>
                <th className="px-3 py-2 text-right font-semibold">No clock-out</th>
                <th className="px-3 py-2 text-right font-semibold">Off by {OFF_BY}+</th>
                <th className="px-3 py-2 text-right font-semibold">No location</th>
                <th className="px-3 py-2 text-right font-semibold">Over the cap</th>
                <th className="px-3 py-2 text-right font-semibold">QSP contradicts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {people.map((p) => (
                <tr key={p.who} className="hover:bg-surface-2">
                  <td className="px-3 py-2 font-medium text-foreground">{p.who}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{p.shifts}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{hrs(p.paid)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{hrs(p.clocked)}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      p.gap >= PAID_OVER
                        ? "font-semibold text-orange-600 dark:text-orange-400"
                        : "text-faint"
                    }`}
                  >
                    {p.gap > 0 ? `+${hrs(p.gap)}` : p.gap < 0 ? hrs(p.gap) : "-"}
                  </td>
                  <Cell n={p.noIn} tone="text-rose-600 dark:text-rose-400" />
                  <Cell n={p.noOut} tone="text-rose-600 dark:text-rose-400" />
                  <Cell n={p.off} tone="text-amber-600 dark:text-amber-400" />
                  <Cell n={p.gps} tone="text-sky-600 dark:text-sky-400" />
                  <Cell n={p.cap} tone="text-fuchsia-600 dark:text-fuchsia-400" />
                  <Cell n={p.disagrees} tone="text-violet-600 dark:text-violet-400" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[64rem] text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-faint">
              <tr>
                {/* the audit reads left to right and the name is what every row
                    is about, so it stays put while the times scroll */}
                <th className="sticky left-0 z-10 bg-surface-2 px-3 py-2 font-semibold">Person</th>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Client</th>
                <th className="px-3 py-2 font-semibold">Service</th>
                <th className="px-3 py-2 font-semibold">Rostered</th>
                <th className="px-3 py-2 font-semibold">Clocked</th>
                <th className="px-3 py-2 text-right font-semibold">In</th>
                <th className="px-3 py-2 text-right font-semibold">Out</th>
                <th className="px-3 py-2 text-right font-semibold">Paid</th>
                <th className="px-3 py-2 text-right font-semibold">Clocked</th>
                <th className="px-3 py-2 font-semibold">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((s) => (
                <Row key={s.i} s={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shown.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-faint">
          No shift matches that.
        </p>
      )}
    </>
  );
}

// one headline number with its unit under it
function Figure({ n, label, sub, tone = "text-foreground" }) {
  return (
    <span className="block">
      <span className={`block text-3xl font-bold tabular-nums leading-none ${tone}`}>{n}</span>
      <span className="mt-1 block text-sm font-bold text-foreground">{label}</span>
      <span className="mt-0.5 block text-xs text-muted">{sub}</span>
    </span>
  );
}

function Cell({ n, tone }) {
  return (
    <td className={`px-3 py-2 text-right tabular-nums ${n ? `font-semibold ${tone}` : "text-faint"}`}>
      {n || "-"}
    </td>
  );
}

// a difference of zero is drawn as a dash rather than "0", so the eye lands on
// the shifts that moved
function Delta({ n }) {
  if (n == null) return <span className="text-faint">-</span>;
  if (n === 0) return <span className="text-faint">on time</span>;
  const late = n > 0;
  return (
    <span
      className={`font-semibold tabular-nums ${
        Math.abs(n) >= OFF_BY
          ? late
            ? "text-rose-600 dark:text-rose-400"
            : "text-amber-600 dark:text-amber-400"
          : "text-muted"
      }`}
    >
      {signed(n)}
    </span>
  );
}

function Row({ s }) {
  const rostered = span(s.schedFrom, s.schedTo);
  const clocked = span(s.actualFrom, s.actualTo);
  const gap = gapOf(s);
  return (
    <tr className="align-top hover:bg-surface-2">
      <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium text-foreground">{s.who}</td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted">{s.date}</td>
      <td className="px-3 py-2 text-muted">{s.client || <span className="text-faint">-</span>}</td>
      <td className="px-3 py-2 text-muted">{s.service || <span className="text-faint">-</span>}</td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted">
        {rostered || <span className="text-faint">-</span>}
      </td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
        {clocked ? (
          <span className="text-foreground">{clocked}</span>
        ) : (
          <span className="font-semibold text-rose-600 dark:text-rose-400">
            {s.noIn && s.noOut ? "never clocked" : s.noIn ? "no clock-in" : "no clock-out"}
          </span>
        )}
        {s.disagrees.map((d, i) => (
          <span key={i} className="mt-0.5 block text-[11px] font-normal text-violet-600 dark:text-violet-400">
            QSP says {d.says} clock-{d.end}, the times say {d.show}
          </span>
        ))}
        {/* ONE NOTE MUST NOT SET THE WIDTH OF THE TABLE. Staff type these
            free-hand and the longest on 08/16-08/22 runs to fifty words, which
            pushed every column right and left the person off the screen. Two
            lines here, the whole thing on hover. */}
        {s.reason && (
          <span
            title={s.reason}
            className="mt-0.5 line-clamp-2 w-56 text-[11px] font-normal leading-snug text-faint"
          >
            {s.reason}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <Delta n={s.startDelta} />
      </td>
      <td className="px-3 py-2 text-right">
        <Delta n={s.endDelta} />
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted">
        {s.scheduledMin == null ? <span className="text-faint">-</span> : hrs(s.scheduledMin)}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
        {s.workedMin == null ? (
          <span className="text-faint">-</span>
        ) : (
          <>
            <span className={s.overCap ? "font-semibold text-fuchsia-600 dark:text-fuchsia-400" : "text-muted"}>
              {hrs(s.workedMin)}
            </span>
            {/* the shift bills its rostered length whatever the clock says, so
                the difference is the whole point of the column beside it */}
            {gap != null && gap >= PAID_OVER && (
              <span className="block text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                +{hrs(gap)} paid
              </span>
            )}
          </>
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <Gps v={s.gpsIn} end="in" />
        <Gps v={s.gpsOut} end="out" />
      </td>
    </tr>
  );
}

// three-valued on purpose: yes, no, and nothing to say. A shift nobody clocked
// into never had a location to capture, and drawing that as a failure would
// count one missed clock-in twice.
function Gps({ v, end }) {
  if (v == null) return null;
  return (
    <span
      className={`mr-2 text-[11px] ${
        v === "no" ? "font-semibold text-sky-600 dark:text-sky-400" : "text-faint"
      }`}
    >
      {end} {v === "no" ? "none" : "ok"}
    </span>
  );
}
