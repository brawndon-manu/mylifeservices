"use client";

import { useState } from "react";
import { Flag, CircleCheck, CircleAlert } from "lucide-react";
import { decideLockChange, approveClockMatches } from "../actions";
import audit from "../../audit/audit.module.css";
import styles from "../lock.module.css";

// what each change is called on its card, and the tabs it counts under. Kept
// here in step with KIND_LABELS / KIND_TABS in schedule-lock.js, which the
// browser cannot import (it pulls node:crypto); a test holds the two together.
const KIND_LABELS = {
  times: "Times changed",
  added: "Added",
  removed: "Removed",
  moved: "Moved to another day",
  reassigned: "Given to another employee",
  client: "Client changed",
  service: "Service changed",
  "calendar-missing": "Calendar missing",
  "calendar-new": "New calendar",
  "note-added": "Schedule note added",
  "note-edited": "Schedule note changed",
  "note-removed": "Schedule note removed",
  "service-note-added": "Service note added",
  "service-note-edited": "Service note changed",
  "service-note-removed": "Service note removed",
  "dsn-added": "DSN added",
  "dsn-edited": "DSN changed",
  "dsn-removed": "DSN removed",
  "dsn-claim": "DSN mileage answer changed",
  "clock-changed": "Clock punch changed",
  miles: "Miles changed",
  "trip-added": "Trip added",
  "trip-removed": "Trip removed",
  missing: "Missing from this upload",
};
const KIND_TABS = [
  ["times", "Times", ["times"]],
  ["added", "Added", ["added"]],
  ["removed", "Removed", ["removed"]],
  ["moved", "Moved", ["moved"]],
  ["reassigned", "Reassigned", ["reassigned"]],
  ["client", "Client", ["client"]],
  ["service", "Service", ["service"]],
  ["calendars", "Calendars", ["calendar-missing", "calendar-new"]],
  ["scheduleNotes", "Schedule notes", ["note-added", "note-edited", "note-removed"]],
  ["serviceNotes", "Service notes", ["service-note-added", "service-note-edited", "service-note-removed"]],
  ["dsn", "DSN", ["dsn-added", "dsn-edited", "dsn-removed", "dsn-claim"]],
  ["clock", "Clock", ["clock-changed"]],
  ["miles", "Miles", ["miles", "trip-added", "trip-removed"]],
];
const tabOf = (c) => (c.kind === "missing" ? c.source : KIND_TABS.find(([, , k]) => k.includes(c.kind))?.[0] || "other");
// what a person missing from an export was missing, in words
const MISSING_WHAT = { scheduleNotes: "schedule notes", dsn: "DSNs", serviceNotes: "service notes", miles: "trips" };

const clock = (min) => {
  if (min == null) return "—";
  const h24 = Math.floor(min / 60) % 24;
  const h = h24 % 12 || 12;
  return `${h}:${String(min % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
};
const hrs = (min) => (Math.abs(min || 0) / 60).toFixed(2);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayName = (d) => {
  const [m, dd, yy] = String(d).split("/").map(Number);
  return `${DAYS[new Date(2000 + yy, m - 1, dd).getDay()]} ${String(d).slice(0, 5)}`;
};
const when = (iso) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" })
    .format(new Date(iso)).replace(",", " ·");
const dayKey = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(String(d || ""));
  return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
};
// "King, A" -> "A. King"; a name the export printed in full stays as it is
const clientName = (c) => {
  const s = String(c || "").trim();
  if (!s) return null;
  const [last, first] = s.split(",").map((x) => (x || "").trim());
  if (!first) return last;
  return first.length <= 2 ? `${first[0]}. ${last}` : `${first} ${last}`;
};

// the words that changed between two notes, marked: removed ones struck on the
// old side, added ones on the new. Plain text past a length where the
// comparison would get slow.
function wordDiff(a, b) {
  const x = String(a || "").split(/(\s+)/);
  const y = String(b || "").split(/(\s+)/);
  if (x.length * y.length > 1_200_000) return null;
  const n = x.length;
  const m = y.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const before = [];
  const after = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { before.push([x[i], false]); after.push([y[j], false]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { before.push([x[i], true]); i++; }
    else { after.push([y[j], true]); j++; }
  }
  while (i < n) before.push([x[i++], true]);
  while (j < m) after.push([y[j++], true]);
  return { before, after };
}
const Marked = ({ parts, tag: Tag }) => parts.map(([t, hit], k) => (hit && t.trim() ? <Tag key={k}>{t}</Tag> : <span key={k}>{t}</span>));

const Row = ({ dt, children }) => <dl className={styles.row}><dt>{dt}</dt><dd>{children}</dd></dl>;
const Moved = ({ on, children }) => (on ? <span className={styles.moved}>{children}</span> : children);
function Side({ label, fresh = false, children }) {
  return <div className={styles.side} data-new={fresh ? "" : undefined}><h4>{label}</h4>{children}</div>;
}
const None = ({ children }) => <p className={styles.none}>{children}</p>;

// ONE CHANGE, drawn the way the audit draws a shift: who and when in the
// corner, what changed in amber, then the lock and this upload side by side
function ChangeCard({ c, lockAt, uploadAt, onDecide, busy, error, alsoUnder }) {
  const [reopen, setReopen] = useState(false);
  const b = c.before;
  const a = c.after;
  const beforeLabel = b?.approvedAt ? `Approved · ${when(b.approvedAt)}` : `Locked · ${lockAt} upload`;
  const nowLabel = `Now · ${uploadAt} upload`;
  const who = c.employee || a?.employee || b?.employee || "Someone";
  const corner = c.kind === "moved" && b && a
    ? `${b.date.slice(0, 5)} → ${a.date}`
    : c.lastDate && c.lastDate !== c.date ? `${c.date} – ${c.lastDate}` : c.date;
  const state = c.decision || "open";
  const word = state === "approved" ? "Approved" : state === "unauthorized" ? "Unauthorized" : "Not decided";
  const pills = [];
  if (c.matchesClock) pills.push(<span key="c" className={styles.pill} data-t="clock">Matches the clock</span>);
  if (c.awayFromClock) pills.push(<span key="a" className={styles.pill} data-t="away">Away from the clock</span>);
  if (c.firstSeen) pills.push(<span key="f" className={styles.pill}>First seen {c.firstSeen}</span>);
  if (c.gone) pills.push(<span key="g" className={styles.pill}>No longer there</span>);
  const booking = a || b;
  const clientLine = (x) => (
    <p className={styles.client}><b>{x?.clientName || clientName(x?.client) || "No client on the booking"}</b>{x?.service && <span>{x.service}</span>}</p>
  );

  let body = null;
  if (c.source === "roster" && (c.kind === "calendar-missing" || c.kind === "calendar-new")) {
    const items = (b || a)?.items || [];
    const minutes = items.reduce((n, x) => n + (x.meal ? 0 : x.minutes || 0), 0);
    body = <>
      <p className={styles.client}>{c.kind === "calendar-missing" ? "The whole calendar is missing from this upload:" : "A calendar that was not in the lock:"} <b>{items.length} bookings, {hrs(minutes)} hours</b>.</p>
      <details className={styles.list}><summary>See the {items.length} bookings</summary>
        {items.map((x) => <span key={x.id}>{x.date} · {clock(x.start)} – {clock(x.end)} · {x.clientName || clientName(x.client) || "no client"} · {x.service || ""}</span>)}
      </details>
    </>;
  } else if (c.kind === "missing") {
    const items = b?.items || [];
    body = <>
      <p className={styles.client}>All {items.length} of their {MISSING_WHAT[c.source] || "entries"} on these days are missing from this upload.</p>
      <details className={styles.list}><summary>See the {items.length}</summary>
        {items.map((x) => <span key={x.id}>{x.date} · {clientName(x.client) || "no client"}{x.text ? ` · ${x.text.slice(0, 90)}${x.text.length > 90 ? "…" : ""}` : ""}{x.miles != null ? ` · ${x.miles} mi` : ""}</span>)}
      </details>
    </>;
  } else if (c.source === "roster") {
    const time = (x) => `${clock(x.start)} – ${clock(x.end)}`;
    if (c.kind === "client" || c.kind === "service") {
      body = <>
        <p className={styles.client}><b>{time(a)}</b><span>{hrs(a.minutes)} hours</span></p>
        <div className={styles.cmp}>
          <Side label={beforeLabel}><Row dt="Client">{b.clientName || clientName(b.client) || "none"}</Row><Row dt="Service">{b.service || "none"}</Row></Side>
          <Side label={nowLabel} fresh><Row dt="Client"><Moved on={a.client !== b.client}>{a.clientName || clientName(a.client) || "none"}</Moved></Row><Row dt="Service"><Moved on={a.service !== b.service}>{a.service || "none"}</Moved></Row></Side>
        </div>
      </>;
    } else {
      const less = b && a ? a.minutes - b.minutes : 0;
      body = <>
        {clientLine(booking)}
        <div className={styles.cmp}>
          <Side label={beforeLabel}>
            {b ? <>
              {c.kind === "reassigned" && <Row dt="Staff">{b.employee}</Row>}
              {c.kind === "moved" && <Row dt="Day">{dayName(b.date)}</Row>}
              <Row dt="Time">{time(b)}</Row>
              <Row dt="Hours">{hrs(b.minutes)}</Row>
            </> : <None>Not on the schedule</None>}
          </Side>
          <Side label={nowLabel} fresh>
            {a ? <>
              {c.kind === "reassigned" && <Row dt="Staff"><Moved on>{a.employee}</Moved></Row>}
              {c.kind === "moved" && <Row dt="Day"><Moved on>{dayName(a.date)}</Moved></Row>}
              <Row dt="Time">{b ? <><Moved on={a.start !== b.start}>{clock(a.start)}</Moved> – <Moved on={a.end !== b.end}>{clock(a.end)}</Moved></> : <Moved on>{time(a)}</Moved>}</Row>
              <Row dt="Hours"><Moved on={!b || a.minutes !== b.minutes}>{hrs(a.minutes)}</Moved>{b && less !== 0 && <span className={styles.sub}>{hrs(less)} {less < 0 ? "less" : "more"}</span>}</Row>
            </> : <None>Not on the schedule</None>}
          </Side>
        </div>
        {c.kind === "reassigned" && alsoUnder && <p className={styles.note}>Also listed under {alsoUnder}.</p>}
      </>;
    }
  } else if (c.source === "clock") {
    const punch = (x) => `${x.noIn ? "no punch" : clock(x.actualFrom)} – ${x.noOut ? "no punch" : clock(x.actualTo)}`;
    body = <>
      {clientLine(a)}
      <div className={styles.cmp}>
        <Side label={beforeLabel}><Row dt="Booked">{clock(b.schedFrom)} – {clock(b.schedTo)}</Row><Row dt="Clocked">{punch(b)}</Row></Side>
        <Side label={nowLabel} fresh><Row dt="Booked">{clock(a.schedFrom)} – {clock(a.schedTo)}</Row><Row dt="Clocked"><Moved on>{punch(a)}</Moved></Row></Side>
      </div>
    </>;
  } else if (c.source === "miles") {
    const trip = a || b;
    body = <>
      <p className={styles.client}><b>{trip.from || "?"} → {trip.to || "?"}</b><span>{clientName(trip.client) || "no client"}</span></p>
      <div className={styles.cmp}>
        <Side label={beforeLabel}>{b ? <><Row dt="Miles">{b.miles.toFixed(2)}</Row><Row dt="Source">{b.source || "—"}</Row></> : <None>No such trip</None>}</Side>
        <Side label={nowLabel} fresh>{a ? <>
          <Row dt="Miles"><Moved on={!b || a.miles !== b.miles}>{a.miles.toFixed(2)}</Moved>{b && a.miles !== b.miles && <span className={styles.sub}>{Math.abs(a.miles - b.miles).toFixed(2)} {a.miles < b.miles ? "less" : "more"}</span>}</Row>
          <Row dt="Source"><Moved on={!b || a.source !== b.source}>{a.source || "—"}</Moved></Row>
        </> : <None>No such trip</None>}</Side>
      </div>
    </>;
  } else {
    // the three notes exports
    const d = b && a && b.text !== a.text ? wordDiff(b.text, a.text) : null;
    const note = booking;
    body = <>
      <p className={styles.client}><b>{clientName(note.client) || "No client"}</b><span>{[note.service, note.start != null ? `${clock(note.start)} – ${clock(note.end)}` : null].filter(Boolean).join(" · ")}</span></p>
      <div className={styles.cmp}>
        <Side label={beforeLabel}>
          {b ? <p className={styles.text}>{d ? <Marked parts={d.before} tag="del" /> : b.text || "(no words)"}</p> : <None>No note</None>}
          {c.kind === "dsn-claim" && <Row dt="Mileage">{b.claim ? "Yes" : "No"}</Row>}
        </Side>
        <Side label={nowLabel} fresh>
          {a ? <p className={styles.text}>{d ? <Marked parts={d.after} tag="ins" /> : a.text || "(no words)"}</p> : <None>No note</None>}
          {c.kind === "dsn-claim" && <Row dt="Mileage"><Moved on>{a.claim ? "Yes" : "No"}</Moved></Row>}
        </Side>
      </div>
    </>;
  }

  const ev = c.evidence;
  const firstPunch = (ev?.punches || [])[0];
  // the punches a tagged change landed on (or left), in time order:
  // "Clocked in 3:00 PM, out 4:52 PM" or, across two shifts, "Clocked out 1:00 PM, in 1:30 PM"
  const hits = (ev?.hits || []).map((h) => `${h.kind} ${clock(h.at)}`).join(", ");
  const punchLine = firstPunch
    ? firstPunch.noIn && firstPunch.noOut
      ? "No clock punches for this booking."
      : `Clocked in ${firstPunch.noIn ? "(no punch)" : clock(firstPunch.from)}, out ${firstPunch.noOut ? "(no punch)" : clock(firstPunch.to)}.`
    : null;
  return (
    <article className={styles.card} data-decision={state} data-gone={c.gone ? "true" : undefined}>
      <div className={styles.head}>
        <span className={styles.who}>{who}</span>
        <span className={styles.corner}><span className={styles.date}>{corner}</span><span className={styles.state} data-s={state}>{word}</span></span>
      </div>
      <p className={styles.kind}><Flag size={12} aria-hidden="true" /><span>{KIND_LABELS[c.kind] || c.kind}</span>{pills}</p>
      {body}
      {c.source === "roster" && (
        c.matchesClock && hits
          ? <p className={styles.ev}><CircleCheck size={14} aria-hidden="true" /><span><b>Matches the clock.</b> Clocked {hits}.</span></p>
          : c.awayFromClock && hits
            ? <p className={styles.ev} data-t="away"><CircleAlert size={14} aria-hidden="true" /><span><b>Away from the clock.</b> Clocked {hits}.</span></p>
            : punchLine && <p className={styles.ev}><CircleAlert size={14} aria-hidden="true" /><span>{punchLine}</span></p>
      )}
      {c.source === "roster" && ev?.note && <p className={styles.said}>Staff wrote: “{ev.note}”</p>}
      <div className={styles.foot}>
        {error && <span className={styles.error}>{error}</span>}
        {state !== "open" && !reopen ? <>
          <span className={styles.decided}>{state === "approved" ? "Approved" : "Marked unauthorized"}{c.decidedByName ? ` by ${c.decidedByName}` : ""}{c.decidedAt ? ` · ${c.decidedAt}` : ""}</span>
          <button type="button" className={audit.secondary} onClick={() => setReopen(true)}>Change</button>
        </> : <>
          <button type="button" disabled={busy} className={styles.unauth} onClick={async () => { await onDecide(c.id, "unauthorized"); setReopen(false); }}>Unauthorized</button>
          <button type="button" disabled={busy} className={audit.primary} onClick={async () => { await onDecide(c.id, "approved"); setReopen(false); }}>{busy ? "Saving…" : "Approve"}</button>
        </>}
      </div>
    </article>
  );
}

// THE CHANGES ONE UPLOAD FOUND: tabs by decision and by kind, a search, and
// the cards grouped by person (or by day)
export default function LockChanges({ uploadId, eyebrow, from, to, lockAt, uploadAt, compared, changes: initial }) {
  const [changes, setChanges] = useState(initial);
  const [decisionTab, setDecisionTab] = useState("open");
  const [kindTab, setKindTab] = useState("all");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("employee");
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});
  const [bulk, setBulk] = useState(false);

  const present = changes.filter((c) => !c.gone);
  const byDecision = {
    open: changes.filter((c) => !c.decision),
    unauthorized: changes.filter((c) => c.decision === "unauthorized"),
    approved: changes.filter((c) => c.decision === "approved"),
    all: changes,
  };
  const clockOpen = present.filter((c) => c.matchesClock && !c.decision).length;
  const inTab = byDecision[decisionTab];
  const kindCounts = {};
  for (const c of inTab) kindCounts[tabOf(c)] = (kindCounts[tabOf(c)] || 0) + 1;
  const q = query.trim().toLowerCase();
  const shown = inTab
    .filter((c) => kindTab === "all" || tabOf(c) === kindTab)
    .filter((c) => filter === "all"
      || (filter === "clock" && c.matchesClock)
      || (filter === "away" && c.awayFromClock)
      || (filter === "new" && !c.firstSeen && !c.gone)
      || (filter === "gone" && c.gone))
    .filter((c) => !q || [c.employee, c.before?.employee, c.after?.employee, c.before?.client, c.after?.client, c.before?.service, c.after?.service]
      .some((v) => String(v || "").toLowerCase().includes(q)));

  // grouped: by the person it is on (a booking given to someone else shows
  // under both), or by the day
  const groups = new Map();
  const put = (key, label, c, also = null) => {
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key).items.push({ c, also });
  };
  for (const c of shown) {
    if (sort === "day") put(c.date || "", c.date ? dayName(c.date) : "No day", c);
    else {
      put(c.employee || "", c.employee || "No one", c, c.kind === "reassigned" ? c.before?.employee : null);
      if (c.kind === "reassigned" && c.before?.employee && c.before.employee !== c.employee) put(c.before.employee, c.before.employee, c, c.employee);
    }
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (sort === "day" ? dayKey(a) - dayKey(b) : a.localeCompare(b)));

  async function decide(id, decision) {
    setBusy((p) => ({ ...p, [id]: true }));
    setErrors((p) => ({ ...p, [id]: null }));
    const res = await decideLockChange(id, decision);
    setBusy((p) => ({ ...p, [id]: false }));
    if (!res?.ok) { setErrors((p) => ({ ...p, [id]: res?.error || "That didn't save." })); return; }
    setChanges((list) => list.map((c) => (c.id === id ? { ...c, decision: res.change.decision, decidedByName: res.change.decidedByName, decidedAt: res.change.decidedAt ? when(res.change.decidedAt) : null } : c)));
  }

  async function approveClock() {
    if (!window.confirm(clockOpen === 1 ? "Approve the 1 change that matches the clock?" : `Approve the ${clockOpen} changes that match the clock?`)) return;
    setBulk(true);
    const res = await approveClockMatches(uploadId);
    setBulk(false);
    if (!res?.ok) return;
    const ids = new Set(res.ids);
    const at = res.decidedAt ? when(res.decidedAt) : null;
    setChanges((list) => list.map((c) => (ids.has(c.id) ? { ...c, decision: "approved", decidedByName: res.decidedByName, decidedAt: at } : c)));
  }

  const comparedLine = [
    ["schedule", compared.roster],
    ["DSNs", compared.dsn],
    ["service notes", compared.serviceNotes],
    ["schedule notes", compared.scheduleNotes],
    ["clock", compared.clock],
    ["miles", compared.miles],
  ];

  return (
    <>
      <p className={audit.eyebrow}>{eyebrow}</p>
      <header className={audit.heading}>
        <div>
          <h1>Changes</h1>
          <p className={audit.subtitle} style={{ marginTop: 6 }}>{present.length.toLocaleString()} changes on {from} to {to} · checked against the {lockAt} lock</p>
        </div>
      </header>
      <p className={styles.compared}>
        Compared: {comparedLine.map(([what, r], i) => (
          <span key={what}>{i > 0 && " · "}<b>{what}</b> {r ? `${r.from.slice(0, 5)} to ${r.to.slice(0, 5)}` : "not in both uploads"}</span>
        ))}
      </p>
      {clockOpen > 0 && (
        <div className={styles.tools}>
          <CircleCheck size={15} aria-hidden="true" />
          {clockOpen === 1
            ? <span><b>1 change matches the clock</b>: its new times are exactly the punch.</span>
            : <span><b>{clockOpen} changes match the clock</b>: their new times are exactly the punch.</span>}
          <button type="button" disabled={bulk} className={`${audit.primary} ${styles.push}`} onClick={approveClock}>{bulk ? "Saving…" : clockOpen === 1 ? "Approve it" : `Approve those ${clockOpen}`}</button>
        </div>
      )}
      <div className={audit.decisionTabs} aria-label="Decision">
        {[["open", "Not decided"], ["unauthorized", "Unauthorized"], ["approved", "Approved"], ["all", "All"]].map(([k, label]) => (
          <button key={k} type="button" aria-pressed={decisionTab === k} onClick={() => setDecisionTab(k)}>{label}<span>{byDecision[k].length}</span></button>
        ))}
      </div>
      <div className={audit.decisionTabs} style={{ marginTop: -6 }} aria-label="Kind">
        <button type="button" aria-pressed={kindTab === "all"} onClick={() => setKindTab("all")}>Every kind<span>{inTab.length}</span></button>
        {KIND_TABS.filter(([k]) => kindCounts[k]).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={kindTab === k} onClick={() => setKindTab(k)}>{label}<span>{kindCounts[k]}</span></button>
        ))}
      </div>
      <div className={audit.toolbar}>
        <input className={audit.search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee, client or service" aria-label="Search employee, client or service" />
        <div className={styles.filters}>
          <select className={styles.select} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter">
            <option value="all">Every change</option>
            <option value="clock">Matches the clock</option>
            <option value="away">Away from the clock</option>
            <option value="new">New on this upload</option>
            <option value="gone">No longer there</option>
          </select>
          <select className={styles.select} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="employee">By employee</option>
            <option value="day">By day</option>
          </select>
        </div>
      </div>
      <p className={audit.resultCount}>{shown.length.toLocaleString()} of {changes.length.toLocaleString()} changes</p>
      {ordered.length === 0 && <div className={audit.empty}><p>{changes.length ? "Nothing here." : "Nothing changed on the locked days."}</p></div>}
      {ordered.map(([key, g]) => (
        <section key={key}>
          <h3 className={styles.group}>{g.label} <small>{g.items.length} {g.items.length === 1 ? "change" : "changes"}</small></h3>
          {g.items.map(({ c, also }) => (
            <ChangeCard key={`${key}-${c.id}`} c={c} lockAt={lockAt} uploadAt={uploadAt} busy={!!busy[c.id]} error={errors[c.id]} onDecide={decide} alsoUnder={also} />
          ))}
        </section>
      ))}
    </>
  );
}
