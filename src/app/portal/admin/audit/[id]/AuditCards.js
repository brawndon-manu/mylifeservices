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
import { useMemo, useState } from "react";
import StudyMode from "./StudyMode";

const clock = (min) => {
  if (min == null) return null;
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
};
const span = (a, b) => (a == null || b == null ? null : `${clock(a)}-${clock(b)}`);
const hrs = (m) => (m == null ? null : `${(m / 60).toFixed(2)}h`);

const DECISIONS = [
  { key: "all", label: "All", match: () => true },
  { key: "open", label: "Not decided", match: (r) => !r.review },
  { key: "approved", label: "Approved", match: (r) => r.review?.decision === "approved" },
  { key: "flagged", label: "Flagged", match: (r) => r.review?.decision === "flagged" },
];

const VIEWS = [
  { key: "shifts", label: "Every shift" },
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

export default function AuditCards({ rows, totals }) {
  const [decision, setDecision] = useState("open");
  const [view, setView] = useState("shifts");
  const [only, setOnly] = useState(null);
  const [q, setQ] = useState("");
  const [studying, setStudying] = useState(false);

  const kinds = useMemo(() => {
    const c = {};
    for (const r of rows) for (const reason of r.reasons) c[reason.kind] = (c[reason.kind] || 0) + 1;
    return c;
  }, [rows]);

  const labelOf = useMemo(() => {
    const m = {};
    for (const r of rows) for (const reason of r.reasons) m[reason.kind] = reason.label;
    return m;
  }, [rows]);

  const decisionCounts = useMemo(() => {
    const c = {};
    for (const d of DECISIONS) c[d.key] = rows.filter(d.match).length;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const byDecision = DECISIONS.find((d) => d.key === decision).match;
    return rows.filter((r) => {
      if (!byDecision(r)) return false;
      if (only && !r.reasons.some((x) => x.kind === only)) return false;
      if (needle && !`${r.who} ${r.client || ""} ${r.service || ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, decision, only, q]);

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
          name, shifts: 0, billedMin: 0, clockedMin: 0, documentedMin: 0,
          overMin: 0, approved: 0, flagged: 0, open: 0,
        };
        m.set(name, g);
      }
      g.shifts++;
      g.billedMin += r.billedMin ?? 0;
      if (r.clockedMin != null) g.clockedMin += r.clockedMin;
      if (r.documentedMin != null) {
        g.documentedMin += r.documentedMin;
        if (r.billedMin != null) g.overMin += Math.max(0, r.billedMin - r.documentedMin);
      }
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
    return [...m.entries()].sort((a, b) =>
      b[1].reduce((n, r) => n + r.score, 0) - a[1].reduce((n, r) => n + r.score, 0));
  }, [shown, view]);

  const queue = useMemo(
    () => [...shown].sort((a, b) => (a.review ? 1 : 0) - (b.review ? 1 : 0)),
    [shown],
  );

  if (studying) return <StudyMode rows={queue} onExit={() => setStudying(false)} />;

  // a row in the roll-up is a way into that person or client, not a dead end
  const drillInto = (name) => {
    setQ(name === "No client on the booking" ? "" : name);
    setView("shifts");
  };

  return (
    <>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
        {totals.notes} service notes against {totals.shifts} service shifts billed in the pay
        periods they cover.
        {totals.orphans > 0 && ` ${totals.orphans} notes matched no billed shift.`}
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-faint">
        Billed is what the roster says, which is what payroll pays. Clocked is the QSClock export.
        Documented is the time on the note itself. A shift ending early is ordinary and can still
        be billable, so nothing here is a finding on its own. Approving a shift says it looks right
        to bill. Nothing on this page changes an hour, a premium or a signed timesheet.
      </p>

      {/* THE DECISION FIRST. "What is still open" and "what did we flag" are the
          two questions somebody opens this screen already holding. */}
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
            aria-pressed={only === kind}
            onClick={() => setOnly(only === kind ? null : kind)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              only === kind
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
          {shown.length} of {rows.length} shifts.
        </span>
      </div>

      {shown.length === 0 ? (
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
                {list.map((r) => <Card key={r.key} r={r} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <RollUp rows={roll} what={view === "employee" ? "Employee" : "Client"} onOpen={drillInto} />
      )}
    </>
  );
}

function RollUp({ rows, what, onOpen }) {
  return (
    <>
      <p className="mt-4 text-xs text-faint">
        Totalled over the shifts showing above. Billed covers every shift; clocked and documented
        cover only the shifts holding those records. A row opens that {what.toLowerCase()}.
      </p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="px-3 py-2 font-semibold">{what}</th>
              <th className="px-3 py-2 text-right font-semibold">Shifts</th>
              <th className="px-3 py-2 text-right font-semibold">Billed</th>
              <th className="px-3 py-2 text-right font-semibold">Clocked</th>
              <th className="px-3 py-2 text-right font-semibold">Documented</th>
              <th className="px-3 py-2 text-right font-semibold">Billed above documented</th>
              <th className="px-3 py-2 text-right font-semibold">Not decided</th>
              <th className="px-3 py-2 text-right font-semibold">Approved</th>
              <th className="px-3 py-2 text-right font-semibold">Flagged</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((g) => (
              <tr
                key={g.name}
                onClick={() => onOpen(g.name)}
                className="cursor-pointer hover:bg-surface-2"
              >
                <td className="px-3 py-2 font-medium text-foreground">{g.name}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{g.shifts}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{hrs(g.billedMin)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{hrs(g.clockedMin)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{hrs(g.documentedMin)}</td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    g.overMin > 0 ? "font-semibold text-orange-600 dark:text-orange-400" : "text-faint"
                  }`}
                >
                  {g.overMin > 0 ? `+${hrs(g.overMin)}` : "-"}
                </td>
                <Count n={g.open} tone="text-sky-600 dark:text-sky-400" />
                <Count n={g.approved} tone="text-emerald-600 dark:text-emerald-400" />
                <Count n={g.flagged} tone="text-amber-600 dark:text-amber-400" />
              </tr>
            ))}
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

function Card({ r }) {
  const [open, setOpen] = useState(false);
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
        <span className="text-base font-semibold text-foreground">{r.who}</span>
        <span className="text-sm tabular-nums text-muted">{r.date}</span>
      </div>
      <p className="mt-0.5 text-sm text-muted">
        {r.service || "no service named"}
        {r.client ? ` · ${r.client}` : ""}
      </p>

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <Figure label="Billed" value={hrs(r.billedMin)} sub={span(r.schedFrom, r.schedTo)} />
        <Figure
          label="Clocked"
          value={hrs(r.clockedMin) || "not clocked"}
          sub={span(r.actualFrom, r.actualTo)}
          tone={r.clockedMin == null ? "text-rose-600 dark:text-rose-400" : undefined}
        />
        <Figure
          label="Documented"
          value={hrs(r.documentedMin) || "no note"}
          sub={r.note ? `${r.note.start}-${r.note.end}` : null}
          tone={r.note ? undefined : "text-rose-600 dark:text-rose-400"}
        />
        <GpsPair row={r} />
      </dl>

      {surfaced && (
        <ul className="mt-3 space-y-1">
          {r.reasons.map((x, i) => (
            <li key={i} className="text-xs leading-snug text-amber-900 dark:text-amber-200">
              <span className="font-semibold">{x.label}.</span> {x.text}
            </li>
          ))}
        </ul>
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
          {r.review.reason ? ` - ${r.review.reason}` : ""}
        </p>
      )}

      {r.note && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-semibold text-brand underline underline-offset-4"
          >
            {open ? "Hide the note" : `Read the note (${r.note.words} words)`}
          </button>
          {open && (
            <div className="mt-2 rounded-lg border border-border bg-surface-2 p-3">
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
    </article>
  );
}

function Figure({ label, value, sub, tone }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums ${tone || "text-foreground"}`}>
        {value || "-"}
        {sub && <span className="ml-1.5 font-normal text-muted">{sub}</span>}
      </dd>
    </div>
  );
}

// BOTH ENDS, SEPARATELY. Mánu 2026-08-26: "location geofence should have both
// indicators for in and out shown." Clocking in without a location and clocking
// out without one are two device failures on one shift, and a single summary hid
// which end it was.
//
// Three-valued: a shift nobody clocked into never had a location to capture, so
// it has nothing to say rather than a failure to report.
function GpsPair({ row }) {
  const one = (v, end) => (
    <dd
      className={`text-xs font-semibold ${
        v === "yes"
          ? "text-emerald-600 dark:text-emerald-400"
          : v === "no" ? "text-sky-600 dark:text-sky-400" : "text-faint"
      }`}
    >
      clock-{end}: {v === "yes" ? "captured" : v === "no" ? "none" : "nothing to capture"}
    </dd>
  );
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">Location</dt>
      {one(row.gpsIn, "in")}
      {one(row.gpsOut, "out")}
    </div>
  );
}
