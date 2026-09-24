"use client";

// THE MONTH PER CLIENT: authorized, billed, and what's left to fill.
//
// qsp bills the schedule, and a past shift's schedule is never moved back for
// an addendum, so qsp's own figures can't say how much of a client's month is
// really left. billed here is the audit's one billable rule (billable-of),
// with the hours an addendum or a review correction moved marked apart. the
// payout report's anatomy in the workspace's own palette, and blue means one
// thing on this page: hours an addendum added. the sums are client-month.js.
import { Fragment, useMemo, useState } from "react";
import { ArrowDownAZ, ChevronDown, ChevronRight, CircleAlert, CircleCheck, Search } from "lucide-react";
import { billableOf } from "@/lib/timesheet/billable-of";
import { clientMonthModel } from "@/lib/timesheet/client-month";
import { clock, clientFirstLast } from "./figures";
import styles from "./ClientHours.module.css";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// 3,600.35, the way the payout report prints hours
const hours = (m) => ((m || 0) / 60).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (m) => (!m ? "0.00" : `${m > 0 ? "+" : "−"}${hours(Math.abs(m))}`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const partsOf = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || "");
  return m ? { mm: Number(m[1]), dd: Number(m[2]), yyyy: 2000 + Number(m[3]) } : null;
};
const dayKey = (d) => {
  const p = partsOf(d);
  return p ? p.yyyy * 10000 + p.mm * 100 + p.dd : 0;
};

const TABS = [
  ["all", "All", () => true],
  ["left", "Hours left", (l) => l.remainingMin > 0],
  ["none", "No shift yet", (l) => l.authorizedMin != null && !l.rows.length],
  ["over", "Over", (l) => l.remainingMin != null && l.remainingMin < 0],
  ["addendum", "Addendum", (l) => l.addenda > 0],
  ["noauth", "No authorization", (l) => l.authorizedMin == null],
];

const NONE = -1e9;
const SORTS = {
  name: { label: "last name", cmp: (a, b) => a.name.localeCompare(b.name) },
  left: { label: "most hours left", cmp: (a, b) => (b.remainingMin ?? NONE) - (a.remainingMin ?? NONE) || a.name.localeCompare(b.name) },
  used: { label: "most used", cmp: (a, b) => (b.usedPct ?? NONE) - (a.usedPct ?? NONE) || a.name.localeCompare(b.name) },
};

export default function ClientHours({ rows = [], month = null, monthLabel = null }) {
  const model = useMemo(() => clientMonthModel({ rows, authLines: month?.lines || [] }), [rows, month]);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name");
  const [open, setOpen] = useState(() => new Set());
  const toggle = (name) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const from = partsOf(month?.from);
  const through = partsOf(month?.through);
  const oneMonth = from && through && from.mm === through.mm && from.yyyy === through.yyyy;
  const monthName = through ? MONTHS[through.mm - 1] : null;
  // the days of the month after the last one this copy reads
  const daysLeft = through ? new Date(through.yyyy, through.mm, 0).getDate() - through.dd : 0;
  const upTo = month?.through?.slice(0, 5) || "";
  const billedSpan = !from || from.dd === 1 ? `through ${upTo}` : `${month.from.slice(0, 5)} to ${upTo}`;

  const { lines, totals, noClient } = model;
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const pick = (TABS.find((t) => t[0] === tab) || TABS[0])[2];
    return lines
      .filter(pick)
      .filter((l) =>
        !needle
        || l.name.toLowerCase().includes(needle)
        || clientFirstLast(l.name).toLowerCase().includes(needle)
        || clientFirstLast(l.caseManager || "").toLowerCase().includes(needle)
        || l.rows.some((r) => String(r.who || "").toLowerCase().includes(needle)))
      .sort(SORTS[sort].cmp);
  }, [lines, tab, needle, sort]);

  if (!month?.lines) {
    return (
      <p className={styles.emptyState}>
        No authorizations are on file for {monthName ? `${monthName} ${through.yyyy}` : "this month"}. Upload that
        month&apos;s Budget Capture Report from Audit home, under Manage authorizations.
      </p>
    );
  }

  // what hours left leaves to each client's own balance, said once under the table
  const apart = [
    totals.over ? `the ${hours(totals.overMin)} hrs over on ${totals.over === 1 ? "one client" : plural(totals.over, "client")}` : null,
    totals.noAuth ? `the ${hours(totals.noAuthMin)} hrs billed with no authorization on file` : null,
  ].filter(Boolean);
  const leftOut = [
    noClient.shifts ? `${plural(noClient.shifts, "shift")} (${hours(noClient.billableMin)} hrs) with no client on the booking` : null,
    month.leftOut?.count ? `${month.leftOut.count} ${month.leftOut.types.join(" and ")} ${month.leftOut.count === 1 ? "authorization" : "authorizations"}` : null,
  ].filter(Boolean);

  return (
    <div className={styles.page}>
      <section className={styles.summary} aria-label="Month totals">
        <div className={styles.summaryTop}>
          <div>
            <p className={styles.label}>{oneMonth ? `Hours left in ${monthName}` : "Hours left"}</p>
            <p className={styles.hero}>{hours(totals.leftMin)} <span>hrs</span></p>
            <p className={styles.caption}>
              Each client&apos;s authorization less what&apos;s billed {billedSpan}
              {oneMonth && daysLeft > 0 ? ` · ${plural(daysLeft, "day")} to go` : ""}
            </p>
          </div>
          <div className={styles.aside}>
            <span className={styles.status} data-tone={totals.over ? "over" : "ok"}>
              {totals.over ? <CircleAlert size={14} aria-hidden="true" /> : <CircleCheck size={14} aria-hidden="true" />}
              {totals.over ? `${plural(totals.over, "client")} over` : "No client over"}
            </span>
            {totals.none > 0 && <p className={styles.caption}>{plural(totals.none, "client")} with no shift yet</p>}
          </div>
        </div>
        <dl className={styles.breakdown}>
          <Metric label="Authorized" value={hours(totals.authorizedMin)} />
          <Metric label="QSP billed" value={hours(totals.billedMin)} />
          <Metric label="Addenda" value={signed(totals.addendumMin)} tone="amended" />
          <Metric label="Review corrections" value={signed(totals.reviewMin)} tone="reviewed" />
          <Metric label="Billed" value={hours(totals.billableMin)} tone="sum" />
        </dl>
        <div className={styles.formula}>
          <span>QSP billed + addenda + review corrections = Billed</span>
          {month.leftOut?.types?.includes("Day Program") && <span>Day Program is billed outside this audit</span>}
        </div>
      </section>

      <div className={styles.tabs} aria-label="Which clients">
        {TABS.filter(([key, , pick]) => key !== "noauth" || lines.some(pick)).map(([key, label, pick]) => (
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>
            {label}<span>{lines.filter(pick).length}</span>
          </button>
        ))}
      </div>

      <div className={styles.tableHeading}>
        <h2>Clients <span>{lines.length}</span></h2>
        <p role="status">{shown.length} of {plural(lines.length, "client")} · Sorted by {SORTS[sort].label}</p>
      </div>
      <div className={styles.controls}>
        <label className={styles.searchBox}>
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search clients or staff</span>
          <input type="search" placeholder="Search client or staff" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <p className={styles.key}>
          Hours
          <i data-tone="amended" aria-hidden="true" />added by an addendum
          <i data-tone="reviewed" aria-hidden="true" />corrected in review
          <i data-tone="over" aria-hidden="true" />over
        </p>
      </div>
      <div className={styles.phoneSort} aria-label="Sort">
        {Object.entries(SORTS).map(([key, s]) => (
          <button key={key} type="button" aria-pressed={sort === key} onClick={() => setSort(key)}>
            {s.label.charAt(0).toUpperCase() + s.label.slice(1)}
          </button>
        ))}
      </div>

      <div className={styles.tableScroll} role="region" aria-label="Client hours, scroll for every client" tabIndex={0}>
        <table className={styles.table}>
          <caption className="sr-only">Authorized, billed and hours left per client for {monthLabel || monthName}.</caption>
          <colgroup><col /><col className={styles.num} /><col className={styles.num} /><col className={styles.num} /><col className={styles.num} /><col className={styles.st} /></colgroup>
          <thead>
            <tr>
              <th scope="col" className={styles.client} aria-sort={sort === "name" ? "ascending" : undefined}>
                <button type="button" aria-pressed={sort === "name"} onClick={() => setSort("name")}>Client <ArrowDownAZ size={14} aria-hidden="true" /></button>
                <small>Last name</small>
              </th>
              <th scope="col">Authorized</th>
              <th scope="col">Billed</th>
              <th scope="col" aria-sort={sort === "left" ? "descending" : undefined}>
                <button type="button" aria-pressed={sort === "left"} onClick={() => setSort("left")}>Hours left</button>
              </th>
              <th scope="col" aria-sort={sort === "used" ? "descending" : undefined}>
                <button type="button" aria-pressed={sort === "used"} onClick={() => setSort("used")}>Used</button>
              </th>
              <th scope="col" className={styles.left}>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={6} className={styles.none}>No client matches that.</td></tr>
            )}
            {shown.map((l) => {
              const isOpen = open.has(l.name);
              return (
                <Fragment key={l.clientKey || l.name}>
                  <ClientRow l={l} isOpen={isOpen} onToggle={() => toggle(l.name)} />
                  {isOpen && <ShiftRows l={l} />}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className={styles.client}>
                {oneMonth ? `${monthName} to date` : "This copy"}
                <span className={styles.rowNote}>{plural(lines.length, "client")}</span>
              </th>
              <td className={styles.auth}>{hours(totals.authorizedMin)}</td>
              <td className={`${styles.billed} ${styles.strong}`}>
                {hours(totals.billableMin)}<span className={styles.ph}> of {hours(totals.authorizedMin)} billed</span>
              </td>
              <td className={`${styles.remain} ${styles.strong}`}>{hours(totals.leftMin)}<span className={styles.ph}> left</span></td>
              <td className={styles.used}>{totals.usedPct}%</td>
              <td className={styles.state} />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className={styles.footnote}>
        Billed is QSP&apos;s billed figure with each approved addendum&apos;s signed time in its place, and a
        reviewer&apos;s correction where there is one; the later of the two wins.
        {apart.length > 0 && ` Hours left is each client's own balance, so ${apart.join(" and ")} ${apart.length > 1 ? "take" : "takes"} nothing from anyone else.`}
      </p>
      <p className={styles.footnote}>
        {leftOut.length > 0 && `Left out: ${leftOut.join(", and ")}. `}
        Authorizations are the {monthLabel} Budget Capture Report{month.uploadedOn ? `, uploaded ${month.uploadedOn}` : ""}.
      </p>
    </div>
  );
}

function Metric({ label, value, tone }) {
  return <div data-tone={tone}><dt>{label}</dt><dd>{value} <span>hrs</span></dd></div>;
}

function ClientRow({ l, isOpen, onToggle }) {
  const note = [l.services.join(" + "), l.caseManager ? clientFirstLast(l.caseManager) : null].filter(Boolean).join(" · ");
  const billedTone = l.addenda ? styles.amended : l.reviews ? styles.reviewed : "";
  const status = [];
  if (l.authorizedMin == null) status.push(["noauth", "No authorization"]);
  else if (l.remainingMin < 0) status.push(["over", "Over"]);
  else if (!l.rows.length) status.push(["none", "No shift yet"]);
  else if (l.remainingMin === 0) status.push(["full", "Full"]);
  if (l.addenda) status.push(["amended", "Addendum"]);
  return (
    <tr className={styles.row} onClick={onToggle}>
      <th scope="row" className={styles.client}>
        <div className={styles.name}>
          <button
            type="button"
            className={styles.chev}
            aria-expanded={isOpen}
            aria-label={isOpen ? `Hide the shifts for ${l.name}` : `Show the shifts for ${l.name}`}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            {isOpen ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
          </button>
          <div>
            {l.name}
            {note && <span className={styles.rowNote}>{note}</span>}
          </div>
        </div>
      </th>
      <td className={`${styles.auth} ${l.authorizedMin == null ? styles.dim : ""}`}>
        {l.authorizedMin == null ? "-" : hours(l.authorizedMin)}
      </td>
      <td className={`${styles.billed} ${billedTone} ${billedTone ? styles.strong : ""}`}>
        {hours(l.billableMin)}
        {l.authorizedMin != null && <span className={styles.ph}> of {hours(l.authorizedMin)}</span>}
        <span className={styles.ph}> billed</span>
        {l.addenda > 0 && <span className={`${styles.note} ${styles.amended}`}>{signed(l.addendumMin)} addendum</span>}
        {l.reviews > 0 && l.reviewMin !== 0 && <span className={`${styles.note} ${styles.reviewed}`}>{signed(l.reviewMin)} review</span>}
      </td>
      {l.remainingMin == null ? (
        <td className={`${styles.remain} ${styles.dim}`}>-</td>
      ) : l.remainingMin < 0 ? (
        <td className={`${styles.remain} ${styles.over}`}>{hours(-l.remainingMin)} over</td>
      ) : (
        <td className={`${styles.remain} ${styles.strong}`}>{hours(l.remainingMin)}<span className={styles.ph}> left</span></td>
      )}
      <td className={`${styles.used} ${l.usedPct == null ? styles.dim : l.usedPct > 100 ? styles.over : ""}`}>
        {l.usedPct == null ? "-" : `${l.usedPct}%`}
      </td>
      <td className={styles.state}>
        {status.map(([tone, word]) => <span key={tone} data-tone={tone}>{word}</span>)}
      </td>
    </tr>
  );
}

// a client's shifts under its row, by staff member and date: real table rows,
// so every figure sits in the Billed column it adds up to
function ShiftRows({ l }) {
  if (!l.rows.length) {
    return (
      <tr className={`${styles.sub} ${styles.who} ${styles.last}`}>
        <th scope="row" className={styles.client} colSpan={6}>Nothing billed for this client on this copy yet.</th>
      </tr>
    );
  }
  const byWho = new Map();
  for (const r of [...l.rows].sort((a, b) => dayKey(a.date) - dayKey(b.date) || (a.startMin ?? 0) - (b.startMin ?? 0))) {
    const who = r.who || "Unknown";
    if (!byWho.has(who)) byWho.set(who, []);
    byWho.get(who).push(r);
  }
  const groups = [...byWho];
  return groups.map(([who, list], gi) => (
    <Fragment key={who}>
      <tr className={`${styles.sub} ${styles.who}`}>
        <th scope="row" className={styles.client}>{who} · {plural(list.length, "shift")}</th>
        <td className={styles.pad} />
        <td className={styles.billed}>{hours(list.reduce((n, r) => n + (billableOf(r).min ?? 0), 0))}</td>
        <td className={styles.pad} /><td className={styles.pad} /><td className={styles.pad} />
      </tr>
      {list.map((r, si) => {
        const b = billableOf(r);
        const last = gi === groups.length - 1 && si === list.length - 1;
        const tone = b.source === "amendment" ? styles.amended : b.source === "review" ? styles.reviewed : "";
        const win = r.schedFrom != null && r.schedTo != null ? `${clock(r.schedFrom)}-${clock(r.schedTo)}` : null;
        const moved = b.source !== "billed" && (b.min ?? 0) !== (r.billedMin ?? 0);
        return (
          <tr key={r.shiftKey} className={`${styles.sub} ${last ? styles.last : ""}`}>
            <th scope="row" className={styles.client}>
              {r.date}{win ? ` · ${win}` : ""}
              {b.source === "amendment" && (
                <span className={`${styles.why} ${styles.amended}`}>
                  {b.from != null && b.to != null ? `${clock(b.from)}-${clock(b.to)} ` : ""}by addendum, approved by {b.by || b.byLegal || "the office"}
                </span>
              )}
              {b.source === "review" && (
                <span className={`${styles.why} ${styles.reviewed}`}>corrected in review by {b.by || b.byLegal || "the reviewer"}</span>
              )}
            </th>
            <td className={styles.pad} />
            <td className={`${styles.billed} ${tone}`}>
              {moved ? `${hours(r.billedMin)} → ${hours(b.min)}` : hours(b.min)}
            </td>
            <td className={styles.pad} /><td className={styles.pad} /><td className={styles.pad} />
          </tr>
        );
      })}
    </Fragment>
  ));
}
