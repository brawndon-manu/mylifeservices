"use client";

// THE AUDIT, THREE WAYS TO COME AT IT.
//
// Mánu 2026-08-26: "we need a view of the approved and the flagged. we also
// need a way to view by employee and by client."
//
// So the screen carries two independent cuts and a view:
//
//   the DECISION   not decided / approved / flagged. What state the review is
//                  in. The flagged pile has to be readable on its own, because
//                  flagging is what routes something to a person.
//   the REASON     why a shift surfaced at all, which is a different question
//                  and stacks on top of the first.
//   the VIEW       every shift as a card, or totalled per employee or per
//                  client, where a row is a way IN rather than an answer.
//
// "Go through these one by one" hands whatever is on screen to StudyMode. A
// decision is keyed to the SHIFT rather than to this upload, so re-uploading a
// period does not throw away reviewing that has already been done.
//
// Nothing here computes an hour. See the page beside it.
import { Fragment, useMemo, useState } from "react";
import StudyMode from "./StudyMode";
import { reviewShift, resetAllReviews, auditResetImpact, autoFlagImpact, autoFlagShifts } from "../actions";
import BillableAdjust from "./BillableAdjust";
import { AUTO_FLAG_RULES } from "@/lib/timesheet/auto-flag";
import { span, hrs, clockedFigure, punchEnd, ampmLabel } from "./figures";

const DECISIONS = [
  { key: "all", label: "All", match: () => true },
  { key: "open", label: "Not decided", match: (r) => !r.review },
  { key: "approved", label: "Approved", match: (r) => r.review?.decision === "approved" },
  { key: "flagged", label: "Flagged", match: (r) => r.review?.decision === "flagged" },
];

const VIEWS = [
  { key: "shifts", label: "Every shift" },
  { key: "orphans", label: "Notes with no shift" },
  { key: "employee", label: "By employee", of: (r) => r.who },
  { key: "client", label: "By client", of: (r) => r.client || "No client on the booking" },
];

// full literal strings - tailwind cannot see a class it has to assemble
const TONE = {
  all: "border-2 border-brand bg-brand/10 text-brand",
  open: "border-2 border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  approved: "border-2 border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  flagged: "border-2 border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
};

export default function AuditCards({ rows: rowsProp, totals, orphans = [], periods = [], authorized = null, authMonthLabel = null, batchId = null, titles = null }) {
  // THE PAY PERIOD LEADS, because approving is a billing judgement and billing
  // runs per period - a reviewer works one fortnight at a time. One notes upload
  // spans several of them; 8/1 to 8/26 is three.
  const [period, setPeriod] = useState(periods.length === 1 ? periods[0] : "all");
  const [decision, setDecision] = useState("open");
  const [view, setView] = useState("shifts");
  // the findings chips stack like Order by - press to add, press again to
  // drop - and kinds that cannot both be true of one shift undo each other
  // (a shift billed above its clock cannot also be below it, unclocked, or
  // absent from the export). Mánu 2026-09-05: "same for the ones up top."
  const KIND_CONFLICTS = [
    ["billed-over-clocked", "billed-under-clocked", "never-clocked", "not-in-clock"],
  ];
  const [onlyKinds, setOnlyKinds] = useState([]);
  const toggleKind = (k) =>
    setOnlyKinds((prev) => {
      if (prev.includes(k)) return prev.filter((x) => x !== k);
      const rivals = KIND_CONFLICTS.find((g) => g.includes(k)) || [];
      return [...prev.filter((x) => !rivals.includes(x)), k];
    });
  const kindOn = (r, k) => (k === "changed" ? !!r.changed : r.reasons.some((x) => x.kind === k));
  // the Order by stack, shared by every view
  const [sortKeys, setSortKeys] = useState([]);
  const toggleSort = (k) =>
    setSortKeys((prev) => {
      if (prev.includes(k)) return prev.filter((x) => x !== k);
      const rivals = SORT_CONFLICTS.find((g) => g.includes(k)) || [];
      return [...prev.filter((x) => !rivals.includes(x)), k];
    });
  const [q, setQ] = useState("");
  const [studying, setStudying] = useState(false);
  // DECIDING FROM THE CARDS, 2026-09-03. Mánu: "i should be able to add the
  // correct hours in the main menu not just in the one by one view." A card's
  // decision lands here so the counts and the piles move without re-running
  // the whole audit build; the server row is the durable record.
  const [localReviews, setLocalReviews] = useState({});
  const rows = useMemo(
    () => rowsProp.map((r) => {
      const l = localReviews[r.shiftKey];
      return l === undefined ? r : { ...r, review: l };
    }),
    [rowsProp, localReviews],
  );
  const noteReview = (shiftKey, review) =>
    setLocalReviews((v) => ({ ...v, [shiftKey]: review }));

  const inPeriod = useMemo(
    () => (period === "all" ? rows : rows.filter((r) => r.period === period)),
    [rows, period],
  );

  const kinds = useMemo(() => {
    const c = {};
    for (const r of inPeriod) for (const reason of r.reasons) c[reason.kind] = (c[reason.kind] || 0) + 1;
    // the delta against the previous copy rides the same chip row - "changed"
    // is not a finding, so it lives beside the reasons rather than inside them
    const changed = inPeriod.filter((r) => r.changed).length;
    if (changed) c.changed = changed;
    return c;
  }, [inPeriod]);

  const labelOf = useMemo(() => {
    const m = { changed: "Changed since the previous copy" };
    for (const r of rows) for (const reason of r.reasons) m[reason.kind] = reason.label;
    return m;
  }, [rows]);

  const periodCounts = useMemo(() => {
    const c = { all: rows.length };
    for (const p of periods) c[p] = rows.filter((r) => r.period === p).length;
    return c;
  }, [rows, periods]);

  // counted within the period showing, so the decision tabs answer "of the
  // fortnight I am working on" rather than of everything ever uploaded
  const decisionCounts = useMemo(() => {
    const c = {};
    for (const d of DECISIONS) c[d.key] = inPeriod.filter(d.match).length;
    return c;
  }, [inPeriod]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const byDecision = DECISIONS.find((d) => d.key === decision).match;
    return inPeriod.filter((r) => {
      if (!byDecision(r)) return false;
      if (onlyKinds.length && !onlyKinds.every((k) => kindOn(r, k))) return false;
      if (needle && !`${r.who} ${r.client || ""} ${r.service || ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [inPeriod, decision, onlyKinds, q]);

  // ONE LINE PER PERSON OR PER CLIENT, over whatever is showing.
  //
  // The hours are summed only where there is something to sum: a shift nobody
  // clocked contributes to billed and to nothing else, so the three columns
  // describe different populations and the caption says so. Summing a missing
  // clock as zero would report a payroll perfectly evidenced by a clock nobody
  // punched, which is the same trap `paidAboveClock` documents.
  const roll = useMemo(() => {
    const of = VIEWS.find((v) => v.key === view)?.of;
    if (!of) return [];
    const m = new Map();
    for (const r of shown) {
      const name = of(r);
      let g = m.get(name);
      if (!g) {
        g = {
          name, shifts: 0, billedMin: 0, billableMin: 0, adjusted: 0,
          clockedMin: 0, noted: 0,
          overMin: 0, approved: 0, flagged: 0, open: 0, authKey: null,
          minDay: Infinity,
        };
        m.set(name, g);
      }
      g.shifts++;
      g.minDay = Math.min(g.minDay, rollDayKey(r.date));
      g.billedMin += r.billedMin ?? 0;
      // WHAT THE REVIEWER SAYS IS ACTUALLY BILLABLE: the adjusted figure where
      // one was recorded, the billed figure everywhere else
      g.billableMin += r.review?.billableMin ?? r.billedMin ?? 0;
      if (r.review?.billableMin != null) g.adjusted++;
      if (!g.authKey && r.authKey) g.authKey = r.authKey;
      // MEASURED AGAINST THE CLOCK. It used to total billed-above-DOCUMENTED,
      // and the note's time is a copy of the billed time - 494 of 494 - so the
      // column was structurally zero and said a period was clean when nobody had
      // compared it to anything.
      if (r.clockedMin != null) {
        g.clockedMin += r.clockedMin;
        if (r.billedMin != null) g.overMin += Math.max(0, r.billedMin - r.clockedMin);
      }
      if (r.note) g.noted++;
      if (r.review?.decision === "approved") g.approved++;
      else if (r.review?.decision === "flagged") g.flagged++;
      else g.open++;
    }
    return [...m.values()].sort((a, b) => b.overMin - a.overMin || b.shifts - a.shifts);
  }, [shown, view]);

  const grouped = useMemo(() => {
    if (view !== "shifts") return [];
    const m = new Map();
    for (const r of shown) {
      if (!m.has(r.who)) m.set(r.who, []);
      m.get(r.who).push(r);
    }
    let sections = [...m.entries()];
    if (sortKeys.length) {
      const agg = ([name, list]) => ({
        name,
        minDay: Math.min(...list.map((r) => rollDayKey(r.date))),
        flagged: list.filter((r) => r.review?.decision === "flagged").length,
        shifts: list.length,
        open: list.filter((r) => !r.review?.decision).length,
        billedMin: list.reduce((n, r) => n + (r.billedMin ?? 0), 0),
        overMin: list.reduce(
          (n, r) => n + (r.billedMin != null && r.clockedMin != null ? Math.max(0, r.billedMin - r.clockedMin) : 0),
          0,
        ),
      });
      sections = sections
        .map((e) => [e, agg(e)])
        .sort(([, a], [, b]) => {
          for (const k of sortKeys) {
            const d = ROLL_SORTS[k].cmp(a, b);
            if (d) return d;
          }
          return 0;
        })
        .map(([e]) => e);
      if (sortKeys.includes("date")) {
        sections = sections.map(([name, list]) => [
          name,
          [...list].sort((a, b) => rollDayKey(a.date) - rollDayKey(b.date)),
        ]);
      }
      return sections;
    }
    return sections.sort((a, b) =>
      b[1].reduce((n, r) => n + r.score, 0) - a[1].reduce((n, r) => n + r.score, 0));
  }, [shown, view, sortKeys]);

  const queue = useMemo(
    () => [...shown].sort((a, b) => (a.review ? 1 : 0) - (b.review ? 1 : 0)),
    [shown],
  );

  if (studying) return <StudyMode rows={queue} onExit={() => setStudying(false)} titles={titles} />;

  // a row in the roll-up is a way into that person or client, not a dead end
  const drillInto = (name) => {
    setQ(name === "No client on the booking" ? "" : name);
    setView("shifts");
  };

  return (
    <>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
        {totals.notes} service notes against {totals.shifts} service shifts billed in this pay
        period.
        {totals.orphans > 0 && ` ${totals.orphans} notes matched no billed shift.`}
      </p>
      {/* WHICH OF THE TWO REPORTS ARRIVED, and why both are needed.
          Mánu 2026-08-27: "field supervisors dont do daily service notes. they
          input their notes in the service notes and schdule notes."
          So these are not one complete report and one broken one - they are the
          two places a note gets written, and which one a person uses follows
          their job. A period holding only one of them reports shifts as
          undocumented that are documented in the other, and the screen says so
          rather than let the count be read as a finding. */}
      {(!totals.fromPdf || !totals.fromXls) && (
        <p className="mt-3 max-w-3xl rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-200">
          {!totals.fromPdf && !totals.fromXls
            ? "No service notes export was uploaded with this period, so every billed shift reads as having no note."
            : !totals.fromXls
              ? "The Employee Service Notes export was not uploaded with this period. Field Supervisors write their notes there rather than as DSNs, so their shifts read as having no note."
              : "The DSN export (Detailed Daily Service Notes) was not uploaded with this period. Independent Living Instructors write their notes there, so their shifts read as having no note."}
        </p>
      )}
      {/* SHORT. Every figure is defined on the card itself, so repeating all
          three here left a paragraph nobody read - Mánu called it what it was.
          What is left is the part the cards cannot say: that a gap is not by
          itself a finding, and that none of this moves money. */}
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-faint">
        A session ending early is ordinary, so nothing here is a finding on its own. The note is
        read for what it says: QSP fills its times in from the booking. Approving says the shift
        looks right to bill, and nothing on this page changes pay.
      </p>

      {periods.length > 1 && (
        <div className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Pay period</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {["all", ...periods].map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  period === p
                    ? "border-2 border-brand bg-brand/10 text-brand"
                    : "border border-border-strong text-muted hover:border-brand hover:text-brand"
                }`}
              >
                {p === "all" ? "Every period" : p}{" "}
                <span className="tabular-nums">{periodCounts[p] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* THE DECISION SECOND. "What is still open" and "what did we flag" are
          the two questions somebody opens this screen already holding. */}
      <div className="mt-6 flex flex-wrap gap-2">
        {DECISIONS.map((d) => (
          <button
            key={d.key}
            type="button"
            aria-pressed={decision === d.key}
            onClick={() => setDecision(d.key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              decision === d.key
                ? TONE[d.key]
                : "border border-border-strong text-muted hover:border-brand hover:text-brand"
            }`}
          >
            {d.label} <span className="tabular-nums">{decisionCounts[d.key]}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([kind, n]) => (
          <button
            key={kind}
            type="button"
            aria-pressed={onlyKinds.includes(kind)}
            onClick={() => toggleKind(kind)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              onlyKinds.includes(kind)
                ? "bg-brand text-white"
                : "border border-border-strong text-muted hover:border-brand hover:text-brand"
            }`}
          >
            {labelOf[kind]} <span className="tabular-nums">{n}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-border-strong p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                view === v.key ? "bg-brand text-white" : "text-muted hover:text-brand"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by employee, client or service"
          className="w-72 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="text-xs font-medium text-muted underline underline-offset-4 hover:text-brand"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          disabled={shown.length === 0}
          onClick={() => setStudying(true)}
          className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand disabled:opacity-50"
        >
          Go through these one by one
        </button>
        <span className="text-xs text-faint">
          {shown.length} of {inPeriod.length} shifts
          {period === "all" ? "" : ` in ${period}`}.
        </span>
        {batchId && (
          <AutoFlag
            batchId={batchId}
            onFlagged={(applied) =>
              setLocalReviews((v) => ({
                ...v,
                ...Object.fromEntries(
                  applied.map((a) => [
                    a.shiftKey,
                    { decision: "flagged", reason: a.reason, billableMin: null, by: null, at: null },
                  ]),
                ),
              }))
            }
          />
        )}
        {batchId && (
          <ResetAll
            batchId={batchId}
            onReset={() =>
              setLocalReviews(Object.fromEntries(rowsProp.map((r) => [r.shiftKey, null])))
            }
          />
        )}
      </div>

      {/* ORDER BY, ON EVERY VIEW - Mánu 2026-09-05. Press to stack, press
          again to drop; nothing pressed keeps each view's own default order. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Order by</span>
        {Object.entries(ROLL_SORTS)
          .filter(([k]) => view !== "orphans" || ["date", "first", "last"].includes(k))
          .map(([k, v]) => (
            <button
              key={k}
              type="button"
              aria-pressed={sortKeys.includes(k)}
              onClick={() => toggleSort(k)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                sortKeys.includes(k)
                  ? "bg-brand text-white"
                  : "border border-border-strong text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {v.label}
            </button>
          ))}
      </div>

      {view === "orphans" ? (
        <Orphans rows={sortOrphans(period === "all" ? orphans : orphans.filter((n) => n.period === period), sortKeys)} />
      ) : shown.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-faint">
          {decision === "flagged"
            ? "Nothing has been flagged."
            : decision === "approved"
              ? "Nothing has been approved yet."
              : "No shift matches that."}
        </p>
      ) : view === "shifts" ? (
        <div className="mt-6 space-y-8">
          {grouped.map(([name, list]) => (
            <div key={name}>
              <h2 className="flex items-baseline gap-2 text-sm font-bold uppercase tracking-wide text-faint">
                {name}
                <span className="text-[11px] font-semibold normal-case tracking-normal tabular-nums">
                  {list.length} {list.length === 1 ? "shift" : "shifts"}
                </span>
              </h2>
              <div className="mt-2 space-y-3">
                {list.map((r) => <Card key={r.key} r={r} onReview={noteReview} title={titles?.[r.employeeKey]} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <RollUp
          rows={roll}
          what={view === "employee" ? "Employee" : "Client"}
          onOpen={drillInto}
          rowsFor={(name) => {
            const of = VIEWS.find((v) => v.key === view)?.of;
            return of ? shown.filter((r) => of(r) === name) : [];
          }}
          onReview={noteReview}
          titles={titles}
          sortKeys={sortKeys}
          authorized={view === "client" ? authorized : null}
          authLabel={authMonthLabel}
        />
      )}
    </>
  );
}

// NOTES THAT MATCHED NO BILLED SHIFT.
//
// Either the service was documented and nothing in the uploaded periods bills
// for it, or it is a SECOND note for a client whose booking already has one -
// a visit written up twice. Both are worth a look and neither belongs on
// somebody else's shift, which is where they used to end up.
function Orphans({ rows }) {
  if (!rows.length) {
    return (
      <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-faint">
        Every note matched a billed shift.
      </p>
    );
  }
  return (
    <>
      <p className="mt-4 text-xs text-faint">
        {rows.length} notes were written that no billed shift claims. A second note for a client
        whose booking already has one lands here too.
      </p>
      <ul className="mt-2 space-y-3">
        {rows.map((n, i) => (
          <li key={i} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-base font-semibold text-foreground">{n.who}</span>
              <span className="text-sm tabular-nums text-muted">{n.date}</span>
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {n.client || "no client on the note"} · {n.start}-{n.end}
              {n.minutes != null ? ` · ${(n.minutes / 60).toFixed(2)}h documented` : ""}
              {" · "}{n.words} words
            </p>
            {n.summary && (
              <p className="mt-2 text-sm leading-relaxed text-faint">{n.summary}…</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

const rollDayKey = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || "");
  return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
};

// "Last, First" (clients) and "First Last" (employees) both answer for the
// name sorts
const nameParts = (name) => {
  const n = String(name || "").trim();
  if (n.includes(",")) {
    const [last, first] = n.split(",").map((x) => x.trim());
    return { first: first || "", last: last || "" };
  }
  const bits = n.split(/\s+/);
  return { first: bits[0] || "", last: bits[bits.length - 1] || "" };
};

// orphans sort on the same pressed keys where they apply
function sortOrphans(list, sortKeys) {
  const keys = sortKeys.filter((k) => ["date", "first", "last"].includes(k));
  if (!keys.length) return list;
  const cmpOf = {
    date: (a, b) => rollDayKey(a.date) - rollDayKey(b.date),
    first: (a, b) => nameParts(a.who).first.localeCompare(nameParts(b.who).first),
    last: (a, b) => nameParts(a.who).last.localeCompare(nameParts(b.who).last),
  };
  return [...list].sort((a, b) => {
    for (const k of keys) {
      const d = cmpOf[k](a, b);
      if (d) return d;
    }
    return 0;
  });
}

// the stackable orderings - Mánu 2026-09-05: "toggle any of these filters
// overlapping each other by pressing and pressing again to toggle off."
// Pressed keys compose in press order; none pressed keeps the audit's own
// order, billed-above-the-clock first.
const ROLL_SORTS = {
  date: { label: "Date", cmp: (a, b) => a.minDay - b.minDay },
  first: { label: "First name", cmp: (a, b) => nameParts(a.name).first.localeCompare(nameParts(b.name).first) },
  last: { label: "Last name", cmp: (a, b) => nameParts(a.name).last.localeCompare(nameParts(b.name).last) },
  flags: { label: "Flags", cmp: (a, b) => b.flagged - a.flagged },
  shifts: { label: "Shifts", cmp: (a, b) => b.shifts - a.shifts },
  open: { label: "Not decided", cmp: (a, b) => (b.open ?? 0) - (a.open ?? 0) },
  billed: { label: "Billed", cmp: (a, b) => (b.billedMin ?? 0) - (a.billedMin ?? 0) },
  over: { label: "Above the clock", cmp: (a, b) => (b.overMin ?? 0) - (a.overMin ?? 0) },
};

// keys that answer the same question cancel each other - Mánu 2026-09-05:
// "you shouldnt be able to click first name and last name at the same time.
// it should undo the ones that contradict each other."
const SORT_CONFLICTS = [["first", "last"]];

function RollUp({ rows, what, onOpen, authorized = null, authLabel = null, rowsFor = null, onReview = null, titles = null, sortKeys = [] }) {
  const ordered = useMemo(() => {
    if (!sortKeys.length) return rows;
    return [...rows].sort((a, b) => {
      for (const k of sortKeys) {
        const d = ROLL_SORTS[k].cmp(a, b);
        if (d) return d;
      }
      return 0;
    });
  }, [rows, sortKeys]);
  // WHICH GROUPS ARE UNFOLDED - Mánu 2026-09-05: "an option for a toggle
  // under by the employee and [client] for every shift." The chevron opens the
  // group's shifts as ordinary cards right under its row; the row itself
  // still drills through to the filtered list, as it always has.
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const toggle = (name) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  // authorized hours only exist per client, and only once a Budget Capture
  // Report for the period's month has been uploaded on the Audit page
  const withAuth = !!authorized;
  return (
    <>
      <p className="mt-4 text-xs text-faint">
        Totalled over the shifts showing above. Billed covers every shift; billable is the same
        total with each reviewer&apos;s corrected figure in place of the billed one; clocked covers only
        the shifts a clock export holds, so billed above clocked is measured on those alone.
        {withAuth &&
          ` Authorized is the client's monthly allowance from the ${authLabel} Budget Capture Report, against the billable hours showing.`}{" "}
        A row opens that {what.toLowerCase()}.
      </p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-border">
        <table className={`w-full ${withAuth ? "min-w-[68rem]" : "min-w-[56rem]"} text-sm`}>
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="px-3 py-2 font-semibold">{what}</th>
              <th className="px-3 py-2 text-right font-semibold">Shifts</th>
              <th className="px-3 py-2 text-right font-semibold">Billed</th>
              <th className="px-3 py-2 text-right font-semibold">Billable</th>
              {withAuth && (
                <th className="px-3 py-2 text-right font-semibold">Authorized / month</th>
              )}
              {withAuth && <th className="px-3 py-2 text-right font-semibold">% of authorized</th>}
              <th className="px-3 py-2 text-right font-semibold">Clocked</th>
              <th className="px-3 py-2 text-right font-semibold">Billed above clocked</th>
              <th className="px-3 py-2 text-right font-semibold">With a note</th>
              <th className="px-3 py-2 text-right font-semibold">Not decided</th>
              <th className="px-3 py-2 text-right font-semibold">Approved</th>
              <th className="px-3 py-2 text-right font-semibold">Flagged</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ordered.map((g) => {
              const auth = withAuth && g.authKey ? authorized[g.authKey] : null;
              const pct = auth?.hours ? (g.billableMin / 60 / auth.hours) * 100 : null;
              return (
                <Fragment key={g.name}>
                <tr
                  onClick={() => onOpen(g.name)}
                  className="cursor-pointer hover:bg-surface-2"
                >
                  <td className="px-3 py-2 font-medium text-foreground">
                    {rowsFor && (
                      <button
                        type="button"
                        aria-label={openGroups.has(g.name) ? "Hide the shifts" : "Show every shift"}
                        title={openGroups.has(g.name) ? "Hide the shifts" : "Show every shift"}
                        onClick={(e) => { e.stopPropagation(); toggle(g.name); }}
                        className="mr-2 inline-block w-4 text-muted transition hover:text-brand"
                      >
                        {openGroups.has(g.name) ? "\u25be" : "\u25b8"}
                      </button>
                    )}
                    {g.name}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{g.shifts}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{hrs(g.billedMin)}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      g.billableMin !== g.billedMin
                        ? "font-semibold text-foreground"
                        : "text-muted"
                    }`}
                    title={
                      g.adjusted
                        ? `${g.adjusted} of ${g.shifts} shifts carry an adjusted billable figure`
                        : undefined
                    }
                  >
                    {hrs(g.billableMin)}
                    {g.adjusted > 0 && <span className="text-xs text-faint"> ·{g.adjusted} adj</span>}
                  </td>
                  {withAuth && (
                    <td className="px-3 py-2 text-right tabular-nums text-muted">
                      {auth ? `${auth.hours}h` : "-"}
                    </td>
                  )}
                  {withAuth && (
                    <td className="px-3 py-2 text-right tabular-nums text-muted">
                      {pct != null ? `${Math.round(pct)}%` : "-"}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{hrs(g.clockedMin)}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      g.overMin > 0 ? "font-semibold text-orange-600 dark:text-orange-400" : "text-faint"
                    }`}
                  >
                    {g.overMin > 0 ? `+${hrs(g.overMin)}` : "-"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">
                    {g.noted}/{g.shifts}
                  </td>
                  <Count n={g.open} tone="text-sky-600 dark:text-sky-400" />
                  <Count n={g.approved} tone="text-emerald-600 dark:text-emerald-400" />
                  <Count n={g.flagged} tone="text-amber-600 dark:text-amber-400" />
                </tr>
                {openGroups.has(g.name) && rowsFor && (
                  <tr>
                    <td colSpan={withAuth ? 12 : 10} className="bg-surface-2/50 px-3 py-3">
                      <div className="space-y-3">
                        {rowsFor(g.name).map((r) => (
                          <Card key={r.key} r={r} onReview={onReview} title={titles?.[r.employeeKey]} />
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Count({ n, tone }) {
  return (
    <td className={`px-3 py-2 text-right tabular-nums ${n ? `font-semibold ${tone}` : "text-faint"}`}>
      {n || "-"}
    </td>
  );
}

function Card({ r, onReview, title }) {
  const [open, setOpen] = useState(false);
  const [openSched, setOpenSched] = useState(false);
  const surfaced = r.reasons.length > 0;
  return (
    <article
      className={`rounded-xl border p-4 ${
        r.review?.decision === "approved"
          ? "border-emerald-300 bg-emerald-50/30 dark:border-emerald-900/60 dark:bg-emerald-950/10"
          : r.review?.decision === "flagged"
            ? "border-amber-400 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20"
            : surfaced
              ? "border-amber-300 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/10"
              : "border-border bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-base font-semibold text-foreground">
          {r.who}
          {title && <span className="ml-2 text-xs font-medium text-muted">{title}</span>}
        </span>
        <span className="text-sm tabular-nums text-muted">{r.date}</span>
      </div>
      <p className="mt-0.5 text-sm text-muted">
        {r.service || "no service named"}
        {r.client ? ` · ${r.client}` : ""}
      </p>

      {/* one line where the clock export is missing, rather than four ways of
          saying the same upload never happened. See StudyMode. */}
      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        {/* three shapes, three facts - see the same block in StudyMode. The
            export is missing, it is here and has no row for this shift, or it
            has one. Scheduled and Clocked both come out of that row. */}
        {r.clockAvailable && r.inClockExport === false ? (
          <>
            {/* the calendar still says when it was booked - Mánu 2026-09-05:
                "everyone should be on the schedule" */}
            <Figure
              label="Scheduled"
              value={r.schedFrom != null && r.schedTo != null ? hrs(r.schedTo - r.schedFrom) : "-"}
              sub={r.schedFrom != null && r.schedTo != null ? `${span(r.schedFrom, r.schedTo)} · from the calendar` : null}
              tone="text-muted"
            />
            <Figure label="Billed" value={hrs(r.billedMin)} sub={span(r.schedFrom, r.schedTo)} />
            <Figure label="Clock" value="no row for this shift" tone="text-faint" />
          </>
        ) : r.clockAvailable ? (
          <>
            <Figure
              label="Scheduled"
              value={
                r.originalFrom != null
                  ? hrs(r.originalTo - r.originalFrom)
                  : r.schedFrom != null && r.schedTo != null
                    ? hrs(r.schedTo - r.schedFrom)
                    : "-"
              }
              sub={
                r.originalFrom != null
                  ? span(r.originalFrom, r.originalTo)
                  : r.schedFrom != null && r.schedTo != null
                    ? `${span(r.schedFrom, r.schedTo)} · from the calendar`
                    : null
              }
              tone="text-muted"
            />
            <Figure label="Billed" value={hrs(r.billedMin)} sub={span(r.schedFrom, r.schedTo)} />
            <Figure
              label="Clocked"
              value={clockedFigure(r).value}
              sub={clockedFigure(r).sub}
              tone={
                clockedFigure(r).tone === "bad"
                  ? "text-rose-600 dark:text-rose-400"
                  : clockedFigure(r).tone === "faint" ? "text-faint" : undefined
              }
            />
            <Punches row={r} />
          </>
        ) : (
          <>
            <Figure label="Billed" value={hrs(r.billedMin)} sub={span(r.schedFrom, r.schedTo)} />
            <Figure label="Clock" value="no export for this period" tone="text-faint" />
          </>
        )}
        <Figure
          label="Note"
          value={r.note ? `${r.note.words} words` : "none"}
          tone={r.note ? undefined : "text-rose-600 dark:text-rose-400"}
        />
      </dl>
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        {r.clockAvailable && r.inClockExport !== false ? (
          <>
            <b>Scheduled</b> what QSP booked · <b>Billed</b> what the timesheet pays ·{" "}
            <b>Clocked</b> the punch in and out
          </>
        ) : (
          <>
            <b>Billed</b> what the timesheet pays
          </>
        )}
      </p>

      {surfaced && (
        <ul className="mt-3 space-y-1">
          {r.reasons.map((x, i) => (
            <li key={i} className="text-xs leading-snug text-amber-900 dark:text-amber-200">
              <span className="font-semibold">{x.label}.</span> {x.text}
            </li>
          ))}
        </ul>
      )}


      {/* WHAT STAFF SAID, BESIDE THE FINDING RATHER THAN BEHIND A CLICK.
          
          Mánu 2026-08-27 asked whether these words reach the explanations. They
          do now, as a quote and never as a verdict: 43 of the 442 schedule notes
          say the session ended early and 34 say somebody forgot to clock, which
          is the answer to a great many of these findings.
          
          NO RULE READS THEM. "Client ended session early" explains why the CLOCK
          is short; it does not explain why the booking still bills the full
          time, and that gap is the thing this screen exists to find. A rule that
          treated the note as an excuse would dismiss exactly the cases it was
          built for. So the words are shown and the reader decides. */}
      {r.reasons.length > 0 && r.scheduleNote && (
        <p className="mt-2 border-l-2 border-border-strong pl-3 text-xs leading-snug text-muted">
          Staff wrote: “{r.scheduleNote.text}”
        </p>
      )}

      {r.review && (
        <p
          className={`mt-3 text-xs font-semibold ${
            r.review.decision === "approved"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {r.review.decision === "approved" ? "Approved" : "Flagged"}
          {r.review.by ? ` by ${r.review.by}` : ""}
          {r.review.reason ? ` - ${r.review.reason.replace(/\.$/, "")}` : ""}
          {r.review.billableMin != null && (
            <span className="text-foreground"> · billable set to {hrs(r.review.billableMin)}</span>
          )}
        </p>
      )}

      {r.changed && (
        <p className="mt-2 text-xs font-semibold text-sky-700 dark:text-sky-300">
          Changed since the previous copy:{" "}
          {r.changed.map((k) => ({ new: "new shift", hours: "hours moved", note: "note added" })[k] || k).join(", ")}.
        </p>
      )}

      <DecideBar r={r} onReview={onReview} />

      {/* both notes, each behind its own toggle - the schedule note is the
          reason typed on the shift, the service note the account of what was
          delivered. See StudyMode. */}
      {(r.scheduleNote || r.note) && (
        <div className="mt-3 space-y-1.5">
          {r.scheduleNote && (
            <div>
              <button
                type="button"
                onClick={() => setOpenSched((v) => !v)}
                className="text-xs font-semibold text-brand underline underline-offset-4"
              >
                {openSched ? "Hide the schedule note" : "Read the schedule note"}
              </button>
              {openSched && (
                <div className="mt-1.5 rounded-lg border border-border bg-surface-2 p-3">
                  {r.scheduleNote.from && (
                    <p className="text-[11px] tabular-nums text-faint">
                      {r.scheduleNote.from}-{r.scheduleNote.to}
                    </p>
                  )}
                  <p className="mt-0.5 text-sm leading-relaxed text-foreground">
                    {r.scheduleNote.text}
                  </p>
                </div>
              )}
            </div>
          )}

          {r.note && (
            <div>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="text-xs font-semibold text-brand underline underline-offset-4"
              >
                {open
                  ? `Hide the ${r.note.source === "dsn" ? "DSN" : "service note"}`
                  : `Read the ${r.note.source === "dsn" ? "DSN" : "service note"} (${r.note.words} words)`}
              </button>
              {open && (
                <div className="mt-1.5 rounded-lg border border-border bg-surface-2 p-3">
                  <p className="text-sm leading-relaxed text-foreground">{r.note.summary}</p>
                  {r.note.categories.length > 0 && (
                    <p className="mt-2 text-xs text-faint">{r.note.categories.join(" · ")}</p>
                  )}
                  {r.note.comments.map((c, i) => (
                    <p key={i} className="mt-2 text-sm leading-relaxed text-muted">{c}</p>
                  ))}
                  <p className="mt-3 text-xs text-faint">
                    Signed {r.note.signedDate} {r.note.signedAt}
                    {r.note.miles ? " · miles claimed" : ""}
                    {r.note.page ? ` · page ${r.note.page} of the export` : ""}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Figure({ label, value, sub, tone }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums ${tone || "text-foreground"}`}>
        {value || "-"}
      </dd>
      {/* the span under the figure, not beside it - Mánu 2026-09-05 */}
      {sub && <dd className="text-xs tabular-nums text-muted">{sub}</dd>}
    </div>
  );
}

// THE TWO ENDS OF THE CLOCK, laid out like QSP's own attendance table: the
// punch and its location, each a tick or a cross, on a line of its own.
//
// A single "Location: captured" line said nothing about WHICH end and nothing
// about the punch itself. Mánu 2026-08-27 sent QSP's table as the shape to copy.
function Punches({ row }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">Clock</dt>
      <PunchLine row={row} end="in" />
      <PunchLine row={row} end="out" />
      {row.sharedSession && (
        <dd className="mt-0.5 text-[11px] leading-snug text-muted">
          one session {ampmLabel(row.sharedSession.from)} - {ampmLabel(row.sharedSession.to)} across{" "}
          {row.sharedSession.parts} bookings
        </dd>
      )}
    </div>
  );
}

function PunchLine({ row, end }) {
  const p = punchEnd(row, end);
  // two reasons there is nothing to draw, and they are not the same fact: the
  // export was never uploaded, or it was and this shift is not in it
  if (p.why) return <dd className="text-xs text-faint">{end}: {p.why}</dd>;
  // FIXED COLUMNS - a wide time must not push the marks (Mánu 2026-09-04)
  return (
    <dd className="grid grid-cols-[1.5rem_1.25rem_5rem_1.75rem_1.25rem] items-center text-xs">
      <span className="text-faint">{end}</span>
      <Mark v={p.mark} />
      <span className="tabular-nums text-muted">{p.time || "-"}</span>
      <span className="text-faint">GPS</span>
      <Mark v={p.gps} />
    </dd>
  );
}

// a tick, a cross, or nothing to say
function Mark({ v }) {
  if (v === "yes") return <span className="font-bold text-emerald-600 dark:text-emerald-400">&#10003;</span>;
  if (v === "no") return <span className="font-bold text-rose-600 dark:text-rose-400">&#10007;</span>;
  return <span className="text-faint">-</span>;
}


// DECIDING WITHOUT LEAVING THE LIST - Mánu 2026-09-03: "i should be able to
// add the correct hours in the main menu not just in the one by one view".
// The same action, the same optional note, the same three chips as the deck's
// flag panel; deciding again replaces the decision, exactly as it does there.
function DecideBar({ r, onReview }) {
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState("");
  const [billable, setBillable] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (decision) => {
    if (busy) return;
    setBusy(true);
    const body = new FormData();
    body.set("decision", decision);
    body.set("shiftKey", r.shiftKey);
    body.set("employeeKey", r.employeeKey || "");
    body.set("date", r.date || "");
    body.set("startMin", r.startMin ?? "");
    body.set("client", r.client || "");
    body.set("service", r.service || "");
    body.set("billedMin", r.billedMin ?? "");
    body.set("clockedMin", r.clockedMin ?? "");
    body.set("documentedMin", r.documentedMin ?? "");
    const bm =
      decision === "flagged" && billable !== "" && Number.isFinite(Number(billable))
        ? Number(billable)
        : null;
    if (bm != null) body.set("billableMin", bm);
    const why = decision === "flagged" ? reason.trim() : "";
    if (why) body.set("reason", why);
    const res = await reviewShift(body);
    setBusy(false);
    if (!res?.ok) return;
    onReview?.(r.shiftKey, {
      decision,
      by: "you",
      reason: why || null,
      billableMin: bm,
    });
    setFlagging(false);
    setReason("");
    setBillable("");
  };

  return (
    <div className="mt-3">
      {flagging ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
          <label className="block text-xs font-semibold text-foreground">
            What should be looked at?{" "}
            <span className="font-normal text-muted">Optional.</span>
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
          />
          {/* the corrected time lives behind its own button so an untouched
              flag looks untouched - see BillableAdjust */}
          <BillableAdjust
            billedMin={r.billedMin}
            clockedMin={r.clockedMin}
            documentedMin={r.documentedMin}
            value={billable}
            onChange={setBillable}
          />
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => send("flagged")}
              className="rounded-md bg-amber-500 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
            >
              Flag it
            </button>
            <button
              type="button"
              onClick={() => { setFlagging(false); setReason(""); setBillable(""); }}
              className="rounded-md border border-border-strong px-3.5 py-1.5 text-sm font-medium text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => send("approved")}
            className="rounded-md border-2 border-emerald-400 px-3.5 py-1.5 text-sm font-bold text-emerald-500 transition hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-950/30"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setFlagging(true)}
            className="rounded-md border-2 border-amber-400 px-3.5 py-1.5 text-sm font-bold text-amber-500 transition hover:bg-amber-50 disabled:opacity-50 dark:hover:bg-amber-950/30"
          >
            Flag
          </button>
        </div>
      )}
    </div>
  );
}

// THE ENGINE'S PASS OVER THE UNDECIDED PILE - Mánu 2026-09-04: "itll auto
// flag them and we can review them." The dialog names what each rule would
// hit before anything writes; decided shifts are never touched, and the
// flags land as ordinary flags whose reason starts "Auto:".
function AutoFlag({ batchId, onFlagged }) {
  const [impact, setImpact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await autoFlagImpact(batchId);
          setBusy(false);
          if (res?.ok) setImpact(res);
        }}
        className="rounded-md border border-amber-400 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/30"
      >
        Auto flag
      </button>
      {done != null && (
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
          {done} shifts flagged.
        </span>
      )}
      {impact != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <p className="text-base font-semibold text-foreground">
              Auto flag the undecided shifts?
            </p>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {AUTO_FLAG_RULES.map((r) => (
                <li key={r.key} className="flex justify-between gap-4">
                  <span>{r.label}</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {impact.counts?.[r.key] ?? 0}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {impact.total} shifts get a flag. Several rules on one shift make
              one flag. Shifts already decided are not touched.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImpact(null)}
                className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || impact.total === 0}
                onClick={async () => {
                  setBusy(true);
                  const res = await autoFlagShifts(batchId);
                  setBusy(false);
                  setImpact(null);
                  if (res?.ok) {
                    setDone(res.flagged);
                    onFlagged?.(res.applied || []);
                  }
                }}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                Auto flag {impact.total} shifts
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// EVERY DECISION ON THE PERIOD, WIPED BEHIND AN ARE-YOU-SURE - Mánu
// 2026-09-03. The count is read when the dialog opens, so the sentence names
// what the click destroys, and nothing happens without the second press.
function ResetAll({ batchId, onReset }) {
  const [impact, setImpact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await auditResetImpact(batchId);
          setBusy(false);
          if (res?.ok) setImpact(res.count);
        }}
        className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/30"
      >
        Reset all decisions
      </button>
      {done != null && (
        <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {done} decisions removed.
        </span>
      )}
      {impact != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <p className="text-base font-semibold text-foreground">
              Reset every decision on this pay period?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              This removes all {impact} of them - approvals, flags, notes and
              corrected billable times together. There is no undo.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImpact(null)}
                className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await resetAllReviews(batchId);
                  setBusy(false);
                  setImpact(null);
                  if (res?.ok) {
                    setDone(res.deleted);
                    onReset?.();
                  }
                }}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                Reset all decisions
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
