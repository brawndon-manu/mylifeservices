"use client";

// ONE SHIFT AT A TIME, three records side by side.
//
// Mánu 2026-08-26: "we have it per client and per employee option ... has the
// billed hours, has the clock in and clock out and geofence, shows the detailed
// notes ... kinda like quizlet flashcards."
//
// The queue is ordered by how much there is to look at, worst first. A card
// with nothing against it is still shown - "no rule objected" is not the same
// statement as "somebody checked it" - but it sorts to the bottom, and the
// counters at the top say how many of each kind there are.
//
// Approve and flag are NOT here yet: a decision has to outlive a re-upload, and
// that means a record keyed to the shift rather than to the batch it was read
// from. Committing the buttons before that record exists would collect
// decisions the next upload silently throws away.
import { useMemo, useState } from "react";

const clock = (min) => {
  if (min == null) return null;
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
};
const span = (a, b) => (a == null || b == null ? null : `${clock(a)}-${clock(b)}`);
const hrs = (m) => (m == null ? null : `${(m / 60).toFixed(2)}h`);

const GROUPS = [
  { key: "employee", label: "By employee", of: (r) => r.who },
  { key: "client", label: "By client", of: (r) => r.client || "No client on the booking" },
];

export default function AuditCards({ rows, totals }) {
  const [group, setGroup] = useState("employee");
  const [only, setOnly] = useState(null);
  const [q, setQ] = useState("");

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

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (only && !r.reasons.some((x) => x.kind === only)) return false;
      if (needle && !`${r.who} ${r.client || ""} ${r.service || ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, only, q]);

  const grouped = useMemo(() => {
    const of = GROUPS.find((g) => g.key === group).of;
    const m = new Map();
    for (const r of shown) {
      const k = of(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m.entries()].sort((a, b) =>
      b[1].reduce((n, r) => n + r.score, 0) - a[1].reduce((n, r) => n + r.score, 0));
  }, [shown, group]);

  const withReasons = rows.filter((r) => r.reasons.length).length;

  return (
    <>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
        {totals.notes} service notes against {totals.shifts} shifts billed in the pay periods they
        cover. {withReasons} carry something worth reading.
        {totals.orphans > 0 && ` ${totals.orphans} notes matched no billed shift.`}
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-faint">
        Billed is what the roster says, which is what payroll pays. Clocked is the QSClock export.
        Documented is the time on the note itself. A shift ending early is ordinary and can still
        be billable, so nothing here is a finding on its own. Nothing on this page changes an hour,
        a premium or a signed timesheet.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
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
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGroup(g.key)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                group === g.key ? "bg-brand text-white" : "text-muted hover:text-brand"
              }`}
            >
              {g.label}
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
        <span className="text-xs text-faint">
          Showing {shown.length} of {rows.length} shifts.
        </span>
      </div>

      {grouped.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-faint">
          No shift matches that.
        </p>
      ) : (
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
      )}
    </>
  );
}

function Card({ r }) {
  const [open, setOpen] = useState(false);
  const flagged = r.reasons.length > 0;
  return (
    <article
      className={`rounded-xl border p-4 ${
        flagged ? "border-amber-300 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/10" : "border-border bg-surface"
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
        <Figure label="Location" value={gps(r)} />
      </dl>

      {flagged && (
        <ul className="mt-3 space-y-1">
          {r.reasons.map((x, i) => (
            <li key={i} className="text-xs leading-snug text-amber-900 dark:text-amber-200">
              <span className="font-semibold">{x.label}.</span> {x.text}
            </li>
          ))}
        </ul>
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

// three-valued, like everywhere else the clock export is read: a shift nobody
// clocked into never had a location to capture
function gps(r) {
  if (r.gpsIn == null && r.gpsOut == null) return "-";
  const bad = [r.gpsIn === "no" && "in", r.gpsOut === "no" && "out"].filter(Boolean);
  return bad.length ? `none on clock-${bad.join(" or ")}` : "captured";
}
