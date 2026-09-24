"use client";

// THE MONTH PER CLIENT: authorized, billed for the whole month, and what's
// still open.
//
// qsp bills the schedule, and a past shift's schedule is never moved back for
// an addendum or a review correction, so qsp's own figures can't say how much
// of a client's month is really left. billed here is the whole month: the
// audit's one billable rule (billable-of) for the days that happened, and the
// copy's month schedule for the days still to come (planned.js). unscheduled
// is what's left of the authorization after that: the hours a client can still
// take up on top of the calendar. the payout report's anatomy in the
// workspace's own palette; blue is an addendum, amber a review correction, red
// over or booked past. the sums are client-month.js.
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
const two = (n) => String(n).padStart(2, "0");

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
  ["open", "Unscheduled hours", (l) => l.unscheduledMin > 0],
  ["nothing", "Nothing scheduled", (l) => l.authorizedMin != null && !l.rows.length && !l.planned.length],
  ["booked", "Booked past", (l) => l.authorizedMin != null && l.remainingMin >= 0 && l.unscheduledMin < 0],
  ["over", "Over", (l) => l.remainingMin != null && l.remainingMin < 0],
  ["addendum", "Addendum", (l) => l.addenda > 0],
  ["noauth", "No authorization", (l) => l.authorizedMin == null],
];

const NONE = -1e9;
const SORTS = {
  name: { label: "last name", cmp: (a, b) => a.name.localeCompare(b.name) },
  open: { label: "most unscheduled", cmp: (a, b) => (b.unscheduledMin ?? NONE) - (a.unscheduledMin ?? NONE) || a.name.localeCompare(b.name) },
};

export default function ClientHours({ rows = [], month = null, monthLabel = null }) {
  const planned = month?.planned?.shifts ? month.planned : null;
  const model = useMemo(
    () => clientMonthModel({ rows, authLines: month?.lines || [], planned }),
    [rows, month, planned],
  );
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
  const lastDay = through ? new Date(through.yyyy, through.mm, 0).getDate() : 0;
  const daysLeft = through ? lastDay - through.dd : 0;
  const upTo = month?.through?.slice(0, 5) || "";
  const billedSpan = !from || from.dd === 1 ? `through ${upTo}` : `${month.from.slice(0, 5)} to ${upTo}`;
  const aheadSpan = through && daysLeft > 0 ? `${two(through.mm)}/${two(through.dd + 1)} to ${two(through.mm)}/${two(lastDay)}` : null;

  const { lines, totals, noClient, unmatched } = model;
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
        || l.rows.some((r) => String(r.who || "").toLowerCase().includes(needle))
        || l.planned.some((s) => String(s.who || "").toLowerCase().includes(needle)))
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

  // what the schedule could not give a client, said once under the table
  const unclearGroups = new Map();
  for (const s of month.planned?.unclear || []) {
    const k = `${s.client}|${s.who}`;
    const g = unclearGroups.get(k) || { client: s.client, who: s.who, could: s.could, shifts: 0, min: 0 };
    g.shifts++;
    g.min += s.min;
    unclearGroups.set(k, g);
  }
  const notCounted = [
    ...[...unclearGroups.values()].map((g) =>
      `${plural(g.shifts, "scheduled shift")} (${hours(g.min)} hrs) for “${g.client}” with ${g.who}${g.could.length > 1 ? `, who could be ${g.could.map(clientFirstLast).join(" or ")}` : ""}`),
    month.planned?.noClient?.shifts ? `${plural(month.planned.noClient.shifts, "scheduled shift")} (${hours(month.planned.noClient.min)} hrs) that name no client` : null,
    unmatched.shifts ? `${plural(unmatched.shifts, "scheduled shift")} (${hours(unmatched.min)} hrs) for a client with no line here` : null,
  ].filter(Boolean);
  const leftOut = [
    noClient.shifts ? `${plural(noClient.shifts, "billed shift")} (${hours(noClient.billableMin)} hrs) with no client on the booking` : null,
    month.leftOut?.count ? `${month.leftOut.count} ${month.leftOut.types.join(" and ")} ${month.leftOut.count === 1 ? "authorization" : "authorizations"}` : null,
  ].filter(Boolean);
  const scheduleNote = month.planned?.missing
    ? "No month schedule was uploaded with this copy, so nothing counts as scheduled."
    : month.planned?.failed
      ? "The month schedule uploaded with this copy could not be read, so nothing counts as scheduled."
      : aheadSpan
        ? `Billed counts the shifts still to come: every ILS and Self Determination shift from ${aheadSpan} on the month schedule uploaded with this copy, joined to its client through the staff member who already serves them.`
        : `This copy reads to the end of ${monthName || "the month"}, so nothing is left to schedule.`;

  return (
    <div className={styles.page}>
      <section className={styles.summary} aria-label="Month totals">
        <div className={styles.summaryTop}>
          <div>
            <p className={styles.label}>{oneMonth ? `Unscheduled in ${monthName}` : "Unscheduled"}</p>
            <p className={styles.hero}>{hours(totals.unscheduledMin)} <span>hrs</span></p>
            <p className={styles.caption}>
              {aheadSpan && planned
                ? `Each client's authorization less what's billed for the month, the ${hours(totals.plannedMin)} hrs scheduled ${aheadSpan} included`
                : `Each client's authorization less what's billed ${billedSpan}`}
              {oneMonth && daysLeft > 0 ? ` · ${plural(daysLeft, "day")} to go` : ""}
            </p>
          </div>
          <div className={styles.aside}>
            <span className={styles.status} data-tone={totals.over ? "over" : "ok"}>
              {totals.over ? <CircleAlert size={14} aria-hidden="true" /> : <CircleCheck size={14} aria-hidden="true" />}
              {totals.over ? `${plural(totals.over, "client")} over` : "No client over"}
            </span>
            {totals.booked > 0 && (
              <p className={`${styles.caption} ${styles.warn}`}>
                {totals.over ? `${totals.booked} more` : plural(totals.booked, "client")} booked past their hours
              </p>
            )}
            {totals.nothing > 0 && <p className={styles.caption}>{totals.nothing} with nothing billed or scheduled</p>}
          </div>
        </div>
        <dl className={styles.breakdown}>
          <Metric label="Authorized" value={hours(totals.authorizedMin)} />
          <Metric label="QSP billed" value={hours(totals.qspMonthMin)} />
          <Metric label="Addenda" value={signed(totals.addendumMin)} tone="amended" />
          <Metric label="Review corrections" value={signed(totals.reviewMin)} tone="reviewed" />
          <Metric label="Billed" value={hours(totals.monthMin)} tone="sum" />
          <Metric label="Booked past" value={hours(totals.pastMin)} tone="past" />
        </dl>
        <div className={styles.formula}>
          <span>
            {aheadSpan && planned ? `QSP billed is the whole month on QSP's schedule, ${aheadSpan} included · ` : ""}
            Billed adds the addenda and review corrections · Unscheduled = authorized &minus; billed, client by client
          </span>
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
          <i data-tone="over" aria-hidden="true" />over or booked past
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
          <caption className="sr-only">Authorized, billed for the whole month and unscheduled hours per client for {monthLabel || monthName}.</caption>
          <colgroup><col /><col className={styles.num} /><col className={styles.num} /><col className={styles.num} /><col className={styles.st} /></colgroup>
          <thead>
            <tr>
              <th scope="col" className={styles.client} aria-sort={sort === "name" ? "ascending" : undefined}>
                <button type="button" aria-pressed={sort === "name"} onClick={() => setSort("name")}>Client <ArrowDownAZ size={14} aria-hidden="true" /></button>
                <small>Last name</small>
              </th>
              <th scope="col">Authorized</th>
              <th scope="col">Billed{aheadSpan && planned && <small className={styles.headNote}>whole month</small>}</th>
              <th scope="col" aria-sort={sort === "open" ? "descending" : undefined}>
                <button type="button" aria-pressed={sort === "open"} onClick={() => setSort("open")}>Unscheduled</button>
              </th>
              <th scope="col" className={styles.left}>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={5} className={styles.none}>No client matches that.</td></tr>
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
                {oneMonth ? monthName : "This copy"}
                <span className={styles.rowNote}>{plural(lines.length, "client")}</span>
              </th>
              <td className={styles.auth}>{hours(totals.authorizedMin)}</td>
              <td className={`${styles.billed} ${styles.strong}`}>
                {hours(totals.monthMin)}<span className={styles.ph}> billed of {hours(totals.authorizedMin)}, {hours(totals.plannedMin)} scheduled</span>
                {totals.plannedMin > 0 && <span className={`${styles.note} ${styles.dim}`}>incl. {hours(totals.plannedMin)} scheduled</span>}
              </td>
              <td className={`${styles.remain} ${styles.strong}`}>{hours(totals.unscheduledMin)}<span className={styles.ph}> unscheduled</span></td>
              <td className={styles.state} />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className={styles.footnote}>
        {scheduleNote} Unscheduled is each client&apos;s own balance: authorized, less billed for the month; a client over
        or booked past takes nothing from anyone else.
      </p>
      {notCounted.length > 0 && (
        <p className={styles.footnote}>
          Not counted: {notCounted.join("; ")}. A shift with a short name joins its client once that staff member has
          billed one of them.
        </p>
      )}
      <p className={styles.footnote}>
        Billed is QSP&apos;s billed figure with each approved addendum&apos;s signed time in its place, and a
        reviewer&apos;s correction where there is one; the later of the two wins.
        {leftOut.length > 0 && ` Left out: ${leftOut.join(", and ")}.`}
        {" "}Authorizations are the {monthLabel} Budget Capture Report{month.uploadedOn ? `, uploaded ${month.uploadedOn}` : ""}.
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
  else if (l.unscheduledMin < 0) status.push(["over", "Booked past"]);
  else if (!l.rows.length && !l.planned.length) status.push(["none", "Nothing scheduled"]);
  else if (l.unscheduledMin === 0) status.push(["full", "Fully booked"]);
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
      <td className={styles.billed}>
        <span className={billedTone ? `${billedTone} ${styles.strong}` : undefined}>{hours(l.monthMin)}</span>
        <span className={styles.ph}> billed{l.authorizedMin != null ? ` of ${hours(l.authorizedMin)}` : ""}{l.plannedMin ? `, ${hours(l.plannedMin)} scheduled` : ""}</span>
        {l.addenda > 0 && <span className={`${styles.note} ${styles.amended}`}>{signed(l.addendumMin)} addendum</span>}
        {l.reviews > 0 && l.reviewMin !== 0 && <span className={`${styles.note} ${styles.reviewed}`}>{signed(l.reviewMin)} review</span>}
        {l.plannedMin > 0 && <span className={`${styles.note} ${styles.dim}`}>incl. {hours(l.plannedMin)} scheduled</span>}
      </td>
      {l.unscheduledMin == null ? (
        <td className={`${styles.remain} ${styles.dim}`}>-</td>
      ) : l.remainingMin < 0 ? (
        <td className={`${styles.remain} ${styles.over}`}>{hours(-l.unscheduledMin)} over</td>
      ) : l.unscheduledMin < 0 ? (
        <td className={`${styles.remain} ${styles.over}`}>{hours(-l.unscheduledMin)} booked past</td>
      ) : (
        <td className={`${styles.remain} ${styles.strong}`}>{hours(l.unscheduledMin)}<span className={styles.ph}> unscheduled</span></td>
      )}
      <td className={styles.state}>
        {status.map(([tone, word]) => <span key={word} data-tone={tone}>{word}</span>)}
      </td>
    </tr>
  );
}

// a client's shifts under its row: what was billed, by staff member and date,
// then what the calendar holds after the copy's last day. real table rows, so
// each figure sits in the column it adds up to
function ShiftRows({ l }) {
  if (!l.rows.length && !l.planned.length) {
    return (
      <tr className={`${styles.sub} ${styles.who} ${styles.last}`}>
        <th scope="row" className={styles.client} colSpan={5}>Nothing billed or scheduled for this client yet.</th>
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
  const plannedRows = [...l.planned].sort((a, b) => dayKey(a.date) - dayKey(b.date) || a.from - b.from);
  return (
    <>
      {groups.map(([who, list], gi) => (
        <Fragment key={who}>
          <tr className={`${styles.sub} ${styles.who}`}>
            <th scope="row" className={styles.client}>{who} · {plural(list.length, "shift")}</th>
            <td className={styles.pad} />
            <td className={styles.billed}>{hours(list.reduce((n, r) => n + (billableOf(r).min ?? 0), 0))}</td>
            <td className={styles.pad} /><td className={styles.pad} />
          </tr>
          {list.map((r, si) => {
            const b = billableOf(r);
            const last = !plannedRows.length && gi === groups.length - 1 && si === list.length - 1;
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
                <td className={styles.pad} /><td className={styles.pad} />
              </tr>
            );
          })}
        </Fragment>
      ))}
      {plannedRows.length > 0 && (
        <>
          <tr className={`${styles.sub} ${styles.who} ${styles.plan}`}>
            <th scope="row" className={styles.client}>Scheduled · {plural(plannedRows.length, "shift")}</th>
            <td className={styles.pad} />
            <td className={styles.billed}>{hours(l.plannedMin)}</td>
            <td className={styles.pad} /><td className={styles.pad} />
          </tr>
          {plannedRows.map((s, i) => (
            <tr key={`${s.date}|${s.from}|${s.who}`} className={`${styles.sub} ${styles.plan} ${i === plannedRows.length - 1 ? styles.last : ""}`}>
              <th scope="row" className={styles.client}>{s.date} · {clock(s.from)}-{clock(s.to)} · {s.who}</th>
              <td className={styles.pad} />
              <td className={styles.billed}>{hours(s.min)}</td>
              <td className={styles.pad} /><td className={styles.pad} />
            </tr>
          ))}
        </>
      )}
    </>
  );
}
