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
import { Fragment, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import StudyMode from "./StudyMode";
import { reviewShift, resetAllReviews, auditResetImpact, autoFlagImpact, autoFlagShifts, markNoteChangeSeen, toggleShiftStar } from "../actions";
import BillableAdjust from "./BillableAdjust";
import { AUTO_FLAG_RULES } from "@/lib/timesheet/auto-flag";
import { hrs, clientFirstLast } from "./figures";
import { Flag, CircleAlert, ListFilter, ArrowDownWideNarrow, ChevronDown, ChevronRight, Star } from "lucide-react";
import AuditWorkspace from "../AuditWorkspace";
import AuditDownloads from "../AuditDownloads";
import AuditMenu from "../AuditMenu";
import ShiftEvidence from "./ShiftEvidence";
import NoteBody from "./NoteBody";
import OverlapDay from "./OverlapDay";
import TimeCompare, { reviewMoved, reviewSettled, reviewedFigureOf, reviewedWinOf } from "./TimeCompare";
import styles from "../audit.module.css";

const DECISIONS = [
  { key: "all", label: "All", match: () => true },
  { key: "open", label: "Not decided", match: (r) => !r.review },
  { key: "approved", label: "Approved", match: (r) => r.review?.decision === "approved" },
  { key: "flagged", label: "Flagged", match: (r) => r.review?.decision === "flagged" },
];

const VIEWS = [
  { key: "shifts", label: "Every shift" },
  { key: "orphans", label: "Notes with no shift" },
  { key: "lost", label: "Gone from the upload" },
  { key: "employee", label: "By employee", of: (r) => r.who },
  { key: "client", label: "By client", of: (r) => r.client || "No client on the booking" },
];

export default function AuditCards({ rows: rowsProp, totals, orphans = [], lost = [], periods = [], authorized = null, authMonthLabel = null, batchId = null, titles = null, periodLabel = "", canUpload = true, frozen = null, noteChanges = [] }) {
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
  // staff names flip to "Last, First" only while the Last name sort is
  // pressed; grouping, search and drill-through keep the plain name
  const staffName = sortKeys.includes("last") ? lastFirst : (n) => n;
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

  // A SUPERSEDED COPY OPENS FROZEN - Mánu 2026-09-07: "all the superceded
  // ones are frozen in time." Nothing decides from here; shifts take stars
  // instead (the only place stars exist), and a Starred filter finds them.
  const frozenMode = !!frozen;
  const [stars, setStars] = useState(() => new Set(frozen?.stars || []));
  const [starsOnly, setStarsOnly] = useState(false);
  const onStar = async (shiftKey) => {
    const had = stars.has(shiftKey);
    setStars((prev) => {
      const next = new Set(prev);
      if (had) next.delete(shiftKey);
      else next.add(shiftKey);
      return next;
    });
    const body = new FormData();
    body.set("batchId", batchId || "");
    body.set("shiftKey", shiftKey);
    let res;
    try { res = await toggleShiftStar(body); } catch { res = null; }
    if (!res?.ok) {
      setStars((prev) => {
        const next = new Set(prev);
        if (had) next.add(shiftKey);
        else next.delete(shiftKey);
        return next;
      });
    }
  };

  // the New notes ledger, drained locally as Seen lands - the server row
  // keeps the durable seenAt
  const [seenIds, setSeenIds] = useState(() => new Set());
  const openNotes = useMemo(
    () => noteChanges.filter((n) => !seenIds.has(n.id)),
    [noteChanges, seenIds],
  );

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
    const byDecision = frozenMode ? () => true : DECISIONS.find((d) => d.key === decision).match;
    return inPeriod.filter((r) => {
      if (!byDecision(r)) return false;
      if (frozenMode && starsOnly && !stars.has(r.shiftKey)) return false;
      if (onlyKinds.length && !onlyKinds.every((k) => kindOn(r, k))) return false;
      if (needle && !`${r.who} ${r.client || ""} ${r.service || ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [inPeriod, decision, onlyKinds, q, frozenMode, starsOnly, stars]);

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

  // the New notes view reads the live note text off the current rows
  const rowsByKey = useMemo(() => new Map(rows.map((r) => [r.shiftKey, r])), [rows]);



  // a row in the roll-up is a way into that person or client, not a dead end
  const drillInto = (name) => {
    setQ(name === "No client on the booking" ? "" : name);
    setView("shifts");
  };

  const changeView = (next) => {
    setStudying(next === "focus");
    if (next !== "focus") setView(next);
  };
  // "Open the shift" from a New notes entry: the shift is decided, so the
  // Not-decided tab would hide exactly the card being opened
  const openShiftOf = (who) => {
    setDecision("all");
    setQ(who);
    setView("shifts");
  };
  const title = studying ? "Focused review" : ({ shifts: "Shifts", employee: "Employees", client: "Clients", orphans: "Unmatched notes", newnotes: "New notes", lost: "Disappeared shifts", reports: "Reports" })[view];
  const recordView = !["orphans", "lost", "reports", "newnotes"].includes(view);
  // the sidebar names the period the way a person says it - "AUG 16-31,
  // 2026" off his mock - and falls back to the raw label if it ever fails
  // to parse
  const navPeriod = (() => {
    const m = /^(\d{2})\/(\d{2})\/(\d{2}) to (\d{2})\/(\d{2})\/(\d{2})$/.exec(periodLabel || "");
    if (!m) return periodLabel || null;
    const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const mon = (n) => MON[Number(n) - 1] || "";
    return m[1] === m[4] && m[3] === m[6]
      ? `${mon(m[1])} ${Number(m[2])}–${Number(m[5])}, 20${m[3]}`
      : `${mon(m[1])} ${Number(m[2])} – ${mon(m[4])} ${Number(m[5])}, 20${m[6]}`;
  })();

  const uploadedMdy = (() => {
    if (!frozen?.uploadedAt) return null;
    const d = new Date(frozen.uploadedAt);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  })();

  return (
    <AuditWorkspace page="batch" view={studying ? "focus" : view} onView={changeView} hasLost={lost.length > 0} canUpload={canUpload} periodLabel={navPeriod} frozen={frozenMode}>
      <header className={styles.heading}>
        <div><p className={styles.eyebrow}>{periodLabel}</p><h1>{title}</h1><p className={styles.subtitle}>{totals.shifts} billed shifts · {totals.notes} service notes</p></div>
        {!frozenMode && <div className={styles.actions}>
          <AuditDownloads batchId={batchId} periodLabel={periodLabel} />
          {!studying && recordView && <button type="button" className={styles.primary} disabled={!shown.length} onClick={() => setStudying(true)}>Start focused review</button>}
        </div>}
      </header>
      {frozenMode && (
        <div className={styles.frozenBar}>
          <strong>Superseded copy</strong>
          <span>{uploadedMdy ? `Uploaded ${uploadedMdy} · ` : ""}replaced by a newer copy · frozen as it read then</span>
          {frozen.currentId && <Link href={`/portal/admin/audit/${frozen.currentId}`}>Open the current copy</Link>}
        </div>
      )}
      {studying ? <StudyMode rows={queue} onExit={() => setStudying(false)} titles={titles} onReview={noteReview} batchId={batchId} /> : view === "reports" ? <>
        <p className={styles.notice}>Reports include the entire uploaded period and current saved decisions. Filters used while reviewing do not limit these downloads.</p>
        <AuditDownloads batchId={batchId} periodLabel={periodLabel} reportsPage />
      </> : <>
      {(!totals.fromPdf || !totals.fromXls) && <p className={styles.notice}>
        {!totals.fromPdf && !totals.fromXls
          ? "No service notes export was uploaded. Missing-note counts reflect the missing files."
          : !totals.fromXls
            ? "Employee Service Notes was not uploaded. Field Supervisors’ notes may be missing from this view."
            : "The DSN export was not uploaded. Independent Living Instructors’ notes may be missing from this view."}
      </p>}
      {periods.length > 1 && <label className={styles.eyebrow}>Pay period <select className={styles.secondary} value={period} onChange={(e) => setPeriod(e.target.value)}>
        {["all", ...periods].map((p) => <option key={p} value={p}>{p === "all" ? "Every period" : p} ({periodCounts[p] ?? 0})</option>)}
      </select></label>}
      {recordView && !frozenMode && <div className={styles.decisionTabs} aria-label="Review status">
        {["open", "flagged", "approved", "all"].map((key) => { const d = DECISIONS.find((item) => item.key === key); return <button key={key} type="button" aria-pressed={decision === key} onClick={() => setDecision(key)}>{d.label}<span>{decisionCounts[key]}</span></button>; })}
      </div>}
      {recordView && frozenMode && <div className={styles.decisionTabs} aria-label="Starred filter">
        <button type="button" aria-pressed={!starsOnly} onClick={() => setStarsOnly(false)}>All shifts<span>{inPeriod.length}</span></button>
        <button type="button" aria-pressed={starsOnly} onClick={() => setStarsOnly(true)}>Starred<span>{stars.size}</span></button>
      </div>}
      <div className={styles.toolbar}>
        {recordView && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee, client or service" aria-label="Search shifts" className={styles.search} />}
        {recordView && <AuditMenu label={<><ListFilter size={14} aria-hidden="true" /> {`Filter${onlyKinds.length ? ` · ${onlyKinds.length}` : ""}`}</>}>
          <p className={styles.menuHeading}>Match every selected finding</p>
          {Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([kind, n]) => <button key={kind} type="button" aria-pressed={onlyKinds.includes(kind)} onClick={() => toggleKind(kind)}><span>{onlyKinds.includes(kind) ? "✓ " : ""}{labelOf[kind]}</span><small>{n}</small></button>)}
          {onlyKinds.length > 0 && <button type="button" onClick={() => setOnlyKinds([])}>Clear findings</button>}
        </AuditMenu>}
        <AuditMenu label={<><ArrowDownWideNarrow size={14} aria-hidden="true" /> {`Sort${sortKeys.length ? ` · ${sortKeys.length}` : ""}`}</>}>
          <p className={styles.menuHeading}>Applied in selection order</p>
          {Object.entries(ROLL_SORTS).filter(([k]) => recordView || ["date", "first", "last"].includes(k)).map(([k, v]) => <button key={k} type="button" aria-pressed={sortKeys.includes(k)} onClick={() => toggleSort(k)}>{v.label}<small>{sortKeys.includes(k) ? sortKeys.indexOf(k) + 1 : ""}</small></button>)}
          {sortKeys.length > 0 && <button type="button" onClick={() => setSortKeys([])}>Default order</button>}
        </AuditMenu>
        {recordView && (q || onlyKinds.length > 0) && <button type="button" className={styles.secondary} onClick={() => { setQ(""); setOnlyKinds([]); }}>Clear filters</button>}
      </div>
      {recordView && <p className={styles.resultCount}>{shown.length} of {inPeriod.length} shifts{period === "all" ? "" : ` in ${period}`}</p>}
      {batchId && recordView && !frozenMode && <details className={styles.tools}><summary>Review tools</summary>
        <div className={styles.tools}>
          <AutoFlag batchId={batchId} onFlagged={(applied) => setLocalReviews((v) => ({ ...v, ...Object.fromEntries(applied.map((a) => [a.shiftKey, { decision: "flagged", reason: a.reason, billableMin: null, by: null, at: null }])) }))} />
          <ResetAll batchId={batchId} onReset={() => setLocalReviews(Object.fromEntries(rowsProp.map((r) => [r.shiftKey, null])))} />
        </div>
      </details>}
      {view === "newnotes" ? (
        <NewNotes
          rows={openNotes}
          rowsByKey={rowsByKey}
          titles={titles}
          onSeen={(id) => setSeenIds((s) => new Set(s).add(id))}
          onOpen={openShiftOf}
        />
      ) : view === "orphans" ? (
        <Orphans rows={sortOrphans(period === "all" ? orphans : orphans.filter((n) => n.period === period), sortKeys)} staffName={staffName} />
      ) : view === "lost" ? (
        <LostShifts rows={sortOrphans(period === "all" ? lost : lost.filter((n) => n.period === period), sortKeys)} staffName={staffName} />
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
                {staffName(name)}
                <span className="text-[11px] font-semibold normal-case tracking-normal tabular-nums">
                  {list.length} {list.length === 1 ? "shift" : "shifts"}
                </span>
              </h2>
              <div className="mt-2 space-y-3">
                {list.map((r) => <Card key={r.key} r={r} onReview={noteReview} title={titles?.[r.employeeKey]} staffName={staffName} batchId={batchId} frozen={frozenMode} starred={stars.has(r.shiftKey)} onStar={onStar} />)}
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
          batchId={batchId}
          frozen={frozenMode}
          stars={stars}
          onStar={onStar}
        />
      )}
      <p className={styles.legend}>A time gap alone is not a finding. Read the notes before deciding. Audit decisions do not change pay.</p>
      </>}
    </AuditWorkspace>
  );
}

// NOTES THAT MATCHED NO BILLED SHIFT.
//
// Either the service was documented and nothing in the uploaded periods bills
// for it, or it is a SECOND note for a client whose booking already has one -
// a visit written up twice. Both are worth a look and neither belongs on
// somebody else's shift, which is where they used to end up.
function Orphans({ rows, staffName = (n) => n }) {
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
              <span className="text-base font-semibold text-foreground">{staffName(n.who)}</span>
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

// SHIFTS AN EARLIER COPY HELD THAT THE LATEST UPLOAD DOES NOT - Mánu
// 2026-09-06: "flag as well... if entire shifts have disapeared." Reviewed
// ones were already pulled back to Flagged when the upload noticed; this
// view is where a person reads which shifts those were, with the reading as
// it stood when the decision was made - the shift itself is gone, so that
// snapshot is the only record left.
function LostShifts({ rows, staffName = (n) => n }) {
  if (!rows.length) {
    return (
      <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-faint">
        Every shift from the earlier copies is still in the latest upload.
      </p>
    );
  }
  return (
    <>
      <p className="mt-4 text-xs text-faint">
        {rows.length} {rows.length === 1 ? "shift" : "shifts"} from an earlier copy of this period
        {rows.length === 1 ? " is" : " are"} not in the latest upload. Reviewed ones were flagged
        when it happened.
      </p>
      <ul className="mt-2 space-y-3">
        {rows.map((n, i) => (
          <li key={n.shiftKey || i} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-base font-semibold text-foreground">{staffName(n.who)}</span>
              <span className="text-sm tabular-nums text-muted">{n.date}</span>
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {n.client || "no client on the booking"}
              {n.billedMin != null ? ` · ${(n.billedMin / 60).toFixed(2)}h billed` : ""}
              {n.service ? ` · ${n.service}` : ""}
            </p>
            {n.review ? (
              <p
                className={`mt-2 text-xs font-semibold ${
                  n.review.decision === "approved"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {n.review.decision === "approved" ? "Approved" : "Flagged"}
                {n.review.by ? ` by ${n.review.by}` : ""}
                {n.review.reason ? ` - ${n.review.reason.replace(/\.$/, "")}` : ""}
              </p>
            ) : (
              <p className="mt-2 text-xs font-semibold text-faint">Nobody had ruled on it.</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

// NOTES THAT ARRIVED OR CHANGED AFTER THE SHIFT WAS DECIDED - Mánu
// 2026-09-07: "if there was new schedule notes/service notes then there
// needs to be a place just for those. even if they were accepted or
// flagged." The decision stands; the entry stays until marked seen, across
// any number of uploads, so a busy day cannot slip one past the reviewer.
function NewNotes({ rows, rowsByKey, titles, onSeen, onOpen }) {
  const [busyId, setBusyId] = useState(null);
  const uploads = new Set(rows.map((n) => n.batchId)).size;
  const seen = async (id) => {
    if (busyId) return;
    setBusyId(id);
    const body = new FormData();
    body.set("id", id);
    let res;
    try { res = await markNoteChangeSeen(body); } catch { res = null; }
    setBusyId(null);
    if (res?.ok) onSeen(id);
  };
  if (!rows.length) {
    return (
      <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-faint">
        No notes have arrived or changed on decided shifts since your last look.
      </p>
    );
  }
  return (
    <>
      <p className="mt-4 text-xs text-faint">
        Notes that arrived or changed after you decided the shift. Your decisions stand.
        Each entry stays here until you mark it seen. {rows.length}{" "}
        {rows.length === 1 ? "entry" : "entries"} across {uploads} {uploads === 1 ? "upload" : "uploads"}.
      </p>
      <ul className="mt-2 space-y-3">
        {rows.map((n) => {
          const row = rowsByKey.get(n.shiftKey);
          const decision = row?.review?.decision || n.decision;
          const detail = n.detail ? n.detail.charAt(0).toUpperCase() + n.detail.slice(1) : "Note changed";
          const body =
            n.kind === "schedule"
              ? row?.scheduleNote?.text || null
              : row?.note?.summary || null;
          const billed = row?.billedMin ?? n.billedMin;
          const clocked = row?.clockedMin ?? n.clockedMin;
          return (
            <li key={n.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-base font-semibold text-foreground">{n.who}</span>
                {titles?.[n.employeeKey] && <span className="text-xs text-muted">{titles[n.employeeKey]}</span>}
                <span className="text-sm tabular-nums text-muted">{n.date}</span>
                {n.client && <span className="text-sm text-muted">{clientFirstLast(n.client)}</span>}
                <span
                  className={`${styles.decisionDot} ${
                    decision === "approved"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : decision === "flagged"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted"
                  }`}
                >
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                  {decision === "approved" ? "Approved" : decision === "flagged" ? "Flagged" : "Not decided"}
                </span>
              </div>
              <p className={styles.noteChangeLine}>{detail} on the {mdyOfIso(n.updatedAt)} upload.</p>
              {body && (
                <div className={styles.noteChangeBody}>
                  {n.kind !== "schedule" && row?.note?.source === "dsn" && <span className={styles.noteTag}>DSN</span>}
                  {body}
                </div>
              )}
              <div className={styles.noteChangeFoot}>
                <span>
                  {billed != null ? `Billed ${hrs(billed)}` : "No billed figure"}
                  {clocked != null ? ` · Clocked ${hrs(clocked)}` : ""}
                </span>
                <button type="button" className={`${styles.secondary} ${styles.pushRight}`} onClick={() => onOpen(n.who)}>Open the shift</button>
                <button type="button" className={styles.primary} disabled={busyId === n.id} onClick={() => seen(n.id)}>
                  {busyId === n.id ? "Saving…" : "Seen"}
                </button>
              </div>
            </li>
          );
        })}
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

// STAFF READ FIRST NAME FIRST, EVERYWHERE - Mánu 2026-09-06: "make every
// staff always first name then last name. only if we sort by last name
// should it be last name, first." So this flip belongs to that one sort
// alone, where it shows the surname the list is ordered by.
const lastFirst = (name) => {
  const { first, last } = nameParts(name);
  return first && last && first !== last ? `${last}, ${first}` : name;
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
};

// keys that answer the same question cancel each other - Mánu 2026-09-05:
// "you shouldnt be able to click first name and last name at the same time.
// it should undo the ones that contradict each other."
const SORT_CONFLICTS = [["first", "last"]];

function RollUp({ rows, what, onOpen, authorized = null, authLabel = null, rowsFor = null, onReview = null, titles = null, sortKeys = [], batchId = null, frozen = false, stars = null, onStar = null }) {
  // the Last name sort flips STAFF names to "Last, First" - the employee
  // roll and the staff on its unfolded cards; clients keep the roster form
  const staffName = sortKeys.includes("last") && what === "Employee" ? lastFirst : (n) => n;
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
                        {openGroups.has(g.name) ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
                      </button>
                    )}
                    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(g.name); }}>{staffName(g.name)}</button>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{g.shifts}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">
                    {g.adjusted > 0 ? <span className="line-through text-faint">{hrs(g.billedMin)}</span> : hrs(g.billedMin)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      g.billableMin !== g.billedMin
                        ? "font-semibold text-amber-600 dark:text-amber-400"
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
                          <Card key={r.key} r={r} onReview={onReview} title={titles?.[r.employeeKey]} staffName={staffName} batchId={batchId} frozen={frozen} starred={!!stars?.has(r.shiftKey)} onStar={onStar} />
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

function Card({ r, onReview, title, staffName = (n) => n, batchId = null, frozen = false, starred = false, onStar = null }) {
  const [open, setOpen] = useState(false);
  const [openSched, setOpenSched] = useState(false);
  const [openOverlap, setOpenOverlap] = useState(false);
  const surfaced = r.reasons.length > 0;
  // THE REPORT CAUGHT UP TO THE CORRECTION - the newest copy bills exactly
  // what the reviewer corrected it to, so nothing flipped and the card says
  // so quietly instead of asking anything.
  const rv = r.review;
  const settled = !frozen && reviewSettled(r);
  // ON A PHONE THE STATUS RIDES THE NAME ROW - Mánu 2026-09-06: "put not
  // decided on the same row as the name af it the name interfered then drop
  // the status string and leave only the status color marking." The name
  // never yields: if showing the word would wrap it, the word goes and the
  // dot stays. Measured once per card while the word is showing - a wrapped
  // name means the word interfered - and latched, since a phone's width
  // only ever changes on rotation.
  const nameRef = useRef(null);
  const [dotOnly, setDotOnly] = useState(false);
  useLayoutEffect(() => {
    if (dotOnly) return undefined;
    const measure = () => {
      const el = nameRef.current;
      if (!el || window.innerWidth >= 640) return;
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
      if (el.getBoundingClientRect().height > lineHeight * 1.4) setDotOnly(true);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [dotOnly]);
  const decisionTone =
    r.review?.decision === "approved"
      ? "text-emerald-600 dark:text-emerald-400"
      : r.review?.decision === "flagged"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted";
  const decisionWord =
    r.review?.decision === "approved" ? "Approved" : r.review?.decision === "flagged" ? "Flagged" : "Not decided";
  return (
    <article className={styles.card} data-decision={r.review?.decision || "open"}>
      {/* the corner answers the two questions at a glance: which day, and
          where the review stands - his mock, 2026-09-06 - and keeps its
          shape on desktop. */}
      <div className="flex items-start justify-between gap-x-3">
        <span className="min-w-0 text-base font-semibold text-foreground">
          <span ref={nameRef}>{staffName(r.who)}</span>
          {title && <span className="mt-0.5 block text-xs font-medium text-muted sm:ml-2 sm:mt-0 sm:inline">{title}</span>}
        </span>
        <span
          className={`flex shrink-0 items-center gap-1.5 pt-1 text-sm font-medium sm:hidden ${decisionTone}`}
          aria-label={dotOnly ? decisionWord : undefined}
          title={dotOnly ? decisionWord : undefined}
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
          {!dotOnly && decisionWord}
        </span>
        <span className="hidden shrink-0 text-right sm:block">
          <span className="block text-sm tabular-nums text-muted">{r.date}</span>
          <span className={`mt-0.5 flex items-center justify-end gap-1.5 text-sm font-medium ${decisionTone}`}>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
            {decisionWord}
          </span>
        </span>
        {frozen && (
          <button
            type="button"
            className={styles.starBtn}
            aria-pressed={starred}
            onClick={() => onStar?.(r.shiftKey)}
          >
            <Star size={13} aria-hidden="true" fill={starred ? "currentColor" : "none"} /> {starred ? "Starred" : "Star"}
          </button>
        )}
      </div>
      <p className="mt-0.5 text-sm tabular-nums text-muted sm:hidden">{r.date}</p>
      {/* client first, first name first, then the service, no dots - the
          deck's heading, Mánu 2026-09-05 */}
      <p className="mt-0.5 text-sm">
        <span className="font-semibold text-foreground">
          {r.client ? clientFirstLast(r.client) : "no client on the booking"}
        </span>
        {r.service && <span className="ml-3 text-muted">{r.service}</span>}
      </p>

      <ShiftEvidence row={r} />

      {surfaced && (
        <ul className="mt-3 space-y-1">
          {r.reasons.map((x, i) => (
            <li
              key={i}
              className={`flex items-start gap-1.5 text-xs leading-snug ${
                x.kind === "no-note" || x.kind === "added-late"
                  ? "font-medium text-rose-600 dark:text-rose-400"
                  : "text-amber-900 dark:text-amber-200"
              }`}
            >
              {x.kind === "no-note" || x.kind === "added-late"
                ? <CircleAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
                : <Flag size={13} aria-hidden="true" className="mt-0.5 shrink-0" />}
              <span><span className="font-semibold">{x.label}.</span> {x.text}</span>
            </li>
          ))}
        </ul>
      )}


      {/* the client's day drawn like a calendar conflict, behind its own
          disclosure beside the finding it pictures - Mánu's variant C */}
      {r.overlapPartners?.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            aria-expanded={openOverlap}
            onClick={() => setOpenOverlap((v) => !v)}
            className="text-xs font-semibold text-brand underline underline-offset-4"
          >
            {openOverlap ? "Hide the double booking" : "See the double booking"}
          </button>
          {openOverlap && <OverlapDay row={r} />}
        </div>
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

        </p>
      )}

      {settled && (
        <p className={styles.settled}>
          <span className={styles.settledMark} aria-hidden="true">✓</span>
          <span>
            The newest copy now bills {hrs(r.billedMin)}, the figure you corrected it to
            {rv.lastAt ? ` on ${mdyOfIso(rv.lastAt)}` : ""}. Your correction and {rv.decision === "approved" ? "approval" : "flag"} stand.
          </span>
        </p>
      )}

      {/* the added-late / time-edited findings already say this in the
          findings list - the raw diff sentence on top was the same fact
          twice (his call, 2026-09-08) */}
      {r.changed && !r.changed.includes("new") && (
        <p className="mt-2 text-xs font-semibold text-sky-700 dark:text-sky-300">
          Changed since the previous copy:{" "}
          {r.changedDetail
            || r.changed.map((k) => ({ new: "new shift", hours: "hours moved", note: "note changed", "note-gone": "note gone" })[k] || k).join(", ")}.
        </p>
      )}


      {/* both notes, each behind its own toggle - the schedule note is the
          reason typed on the shift, the service note the account of what was
          delivered. See StudyMode. */}
      {(r.scheduleNote || r.note) && (
        <div className="mt-3 space-y-1.5">
          {r.scheduleNote && (
            <div>
              <button
                type="button"
                aria-expanded={openSched}
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
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="text-xs font-semibold text-brand underline underline-offset-4"
              >
                {open
                  ? `Hide the ${r.note.source === "dsn" ? "DSN" : "service note"}`
                  : `Read the ${r.note.source === "dsn" ? "DSN" : "service note"} (${r.note.words} words)`}
              </button>
              {open && (
                <div className="mt-1.5 rounded-lg border border-border bg-surface-2 p-3">
                  <NoteBody note={r.note} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {!frozen && <DecideBar r={r} onReview={onReview} batchId={batchId} settled={settled} />}
    </article>
  );
}

// 09/06/26 off an ISO stamp - the date shape every audit surface speaks
const mdyOfIso = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
};


function DecideBar({ r, onReview, batchId = null, settled = false }) {
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState("");
  const [billable, setBillable] = useState("");
  // the clock window the figure was typed as, when the time boxes made it -
  // rides beside billable and lands on the review as billableFrom/ToMin
  const [billableWin, setBillableWin] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reasonId = useId();

  // THE TIME MOVED AFTER THE REVIEW - the decision froze its figures, the
  // newest copy reads differently, and neither is the settled catch-up case:
  // the shared TimeCompare block shows both readings and picks which bills.
  const moved = !settled && reviewMoved(r);

  const send = async (decision, o = {}) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("decision", decision);
    body.set("batchId", batchId || "");
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
      o.billableMin !== undefined
        ? o.billableMin
        : decision === "flagged" && billable !== "" && Number.isFinite(Number(billable))
          ? Number(billable)
          : null;
    const win = o.win !== undefined ? o.win : billableWin;
    if (bm != null) body.set("billableMin", bm);
    if (bm != null && win) {
      body.set("billableFromMin", win.from);
      body.set("billableToMin", win.to);
    }
    const why = decision === "flagged" ? reason.trim() : "";
    if (why) body.set("reason", why);
    let res;
    try { res = await reviewShift(body); }
    catch { setError("Could not save the decision. Please try again."); return; }
    finally { setBusy(false); }
    if (!res?.ok) { setError("Could not save the decision. Please try again."); return; }
    onReview?.(r.shiftKey, {
      decision,
      by: "you",
      reason: why || null,
      billableMin: bm,
      billableFrom: bm != null && win ? win.from : null,
      billableTo: bm != null && win ? win.to : null,
      // the decision re-freezes to the current reading, so the side-by-side
      // clears without a rebuild
      wasBilledMin: r.billedMin ?? null,
      wasClockedMin: r.clockedMin ?? null,
      lastAt: new Date().toISOString(),
    });
    setFlagging(false);
    setReason("");
    setBillable("");
    setBillableWin(null);
  };

  return (
    <div className={styles.cardFooter}>
      {error && <p role="alert" className={styles.bad}>{error}</p>}
      {!flagging && moved && (
        <TimeCompare
          r={r}
          busy={busy}
          onFlag={() => setFlagging(true)}
          onPick={(which) =>
            which === "reviewed"
              ? send("approved", { billableMin: reviewedFigureOf(r.review), win: reviewedWinOf(r.review) })
              : send("approved", { billableMin: null, win: null })
          }
        />
      )}
      {flagging ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
          <label htmlFor={reasonId} className="block text-xs font-semibold text-foreground">
            What should be looked at?{" "}
            <span className="font-normal text-muted">Optional.</span>
          </label>
          <textarea
            id={reasonId}
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
            onChange={(v, w) => { setBillable(v); setBillableWin(w || null); }}
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
              onClick={() => { setFlagging(false); setReason(""); setBillable(""); setBillableWin(null); }}
              className="rounded-md border border-border-strong px-3.5 py-1.5 text-sm font-medium text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : moved ? null : (
        <div className={styles.cardActions}>
          <button type="button" disabled={busy} onClick={() => setFlagging(true)} className={styles.secondary}>Flag</button>
          <button type="button" disabled={busy} onClick={() => send("approved")} className={styles.primary}>{busy ? "Saving…" : "Approve"}</button>
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
