"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveCorrection } from "@/app/portal/admin/timesheets/actions";
import { reportQueue, reportDate, reportTimestamp, reportSlotCheck, validReportSlots } from "@/lib/timesheet/reported-issues";
import { clockLabel } from "@/lib/timesheet/work-slots";
import { restAttested } from "@/lib/timesheet/rest-attestation";
import RecomputeButton from "./RecomputeButton";
import styles from "./ReportedIssues.module.css";

const hours = (n) => Number.isFinite(n) ? n.toFixed(2) : "0.00";
const statusLabel = (status) => ({ open: "Open", accepted: "Accepted", declined: "Declined" })[status] || status;
const queues = { review: "To review", rebuild: "Recalculate", history: "History" };

export default function ReportedIssues({ batch, sheets }) {
  const [filter, setFilter] = useState(() => Object.keys(queues).find((key) => sheets.some((sheet) => reportQueue(sheet) === key)) || "review");
  const [selected, setSelected] = useState(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const detailRef = useRef(null);
  const visible = sheets.filter((sheet) => reportQueue(sheet) === filter);
  const entries = visible.flatMap((sheet) => sheet.corrections.map((correction) => ({ sheet, correction })));
  const current = entries.find(({ correction }) => correction.id === selected) || entries[0];
  const openCount = sheets.reduce((n, sheet) => n + sheet.corrections.filter((c) => c.status === "open").length, 0);

  function choose(id) {
    setSelected(id);
    setMobileDetail(true);

  }

  useEffect(() => {
    if (mobileDetail) detailRef.current?.focus({ preventScroll: true });
  }, [mobileDetail, selected]);

  return (
    <section className={styles.page}>
      <Link href={`/portal/admin/timesheets/${batch.id}`} className={styles.back}>Back to the batch</Link>
      <header className={styles.heading}>
        <div>
          <h1>Reported problems</h1>
          <p className={styles.subtitle}>{reportDate(batch.periodFrom)} to {reportDate(batch.periodTo)} · {openCount ? `${openCount} waiting on you` : "nothing outstanding"}</p>
        </div>
      </header>
      {sheets.length === 0 ? <p className={styles.empty}>Nobody has reported a problem with this batch.</p> : (
        <div className={styles.workspace} data-mobile={mobileDetail ? "detail" : "list"}>
          <aside className={styles.inbox} aria-label="Reported problems">
            <div className={styles.filters} role="group" aria-label="Review status">
              {Object.entries(queues).map(([key, label]) => (
                <button key={key} type="button" className={styles.filter} aria-pressed={filter === key} onClick={() => { setFilter(key); setSelected(null); setMobileDetail(false); }}>
                  {label}<span>{sheets.filter((sheet) => reportQueue(sheet) === key).length}</span>
                </button>
              ))}
            </div>
            {visible.map((sheet) => (
              <div key={sheet.id} className={styles.group}>
                <div className={styles.personLabel}>{sheet.name}<small>{sheet.corrections.length}</small></div>
                {sheet.corrections.map((c) => (
                  <button key={c.id} type="button" className={styles.issue} aria-pressed={current?.correction.id === c.id} onClick={() => choose(c.id)}>
                    <span className={styles.issueDate}>{reportDate(c.date)}<span>{statusLabel(c.status)}</span></span>
                    <span className={styles.issueTitle}>{c.label}</span>
                    {c.claimedHours != null && <span className={styles.issueSummary}>{hours(c.claimedHours)} work hours reported</span>}
                  </button>
                ))}
              </div>
            ))}
            {!visible.length && <p className={styles.empty}>No reports in this view.</p>}
          </aside>
          <div ref={detailRef} tabIndex={-1} className={styles.detail}>
            <button type="button" className={`${styles.link} ${styles.mobileBack}`} onClick={() => setMobileDetail(false)}>Back to reports</button>
            {current ? <IssueDetail key={current.correction.id} {...current} batchId={batch.id} /> : <p className={styles.empty}>No reports in this view.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function IssueDetail({ sheet, correction: c, batchId }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const settled = c.status !== "open";
  const proposed = validReportSlots(c.statedSlots);
  const original = validReportSlots(c.original?.slots);
  const slotError = reportSlotCheck(c.statedSlots, c.claimedHours);
  const open = sheet.corrections.filter((item) => item.status === "open").length;

  async function decide(decision) {
    if (busy) return;
    setBusy(decision);
    setError(null);
    const data = new FormData();
    data.set("resolutionNote", note.trim());
    try {
      await resolveCorrection(c.id, decision, data);
      router.refresh();
    } catch {
      setError("Could not finish this decision. Refresh the page to check its status before trying again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <article>
      <div className={styles.identityRow}>
        <div><div className={styles.name}>{sheet.name}</div><p className={styles.tiny}>{hours(sheet.paidHours)} hrs · {hours(sheet.premiumHours)} premium</p></div>
        <span className={styles.status} data-status={c.status}>{statusLabel(c.status)}</span>
      </div>
      <p className={styles.date}>{reportDate(c.date)}</p>
      <h2 className={styles.title}>{c.label}</h2>
      {c.note && <blockquote className={styles.quote}>{c.note}</blockquote>}
      {c.original && c.claimedHours == null && (
        <p className={styles.caption}>
          What the punches say: {hours(c.original.paidHours)} hrs · {c.original.mealCount > 0 ? "meal punched" : "no meal punched"}
          {c.original.mealViolation && " · meal premium currently owed"}
          {!restAttested(c.date) && ` · ${c.original.restCount || 0}/${c.original.restRequired || 0} rest breaks`}
          {!restAttested(c.date) && c.original.restViolation && " · rest premium currently owed"}
        </p>
      )}
      {c.claimedHours != null && (
        <>
          <div className={styles.evidenceHeading}><h3>Work hours</h3></div>
          <div className={styles.comparison}>
            <div><div className={styles.colTitle}>Before correction</div><div className={styles.amount}>{hours(c.original?.paidHours)} <small>hrs</small></div><SlotList slots={original} /></div>
            <div><div className={styles.colTitle}>Employee reported</div><div className={styles.amount}>{hours(c.claimedHours)} <small>hrs</small></div><SlotList slots={proposed} /></div>
          </div>
          {(original.length > 0 || proposed.length > 0) && <SlotCalendar original={original} proposed={proposed} />}
        </>
      )}
      {slotError && <p className={styles.error} role="alert">{slotError}</p>}
      {!!c.statedTimes?.length && <p className={styles.caption}>They say they took it at {c.statedTimes.join(" and ")}.</p>}
      {!!c.strandedBreaks?.length && <p className={styles.warning}>These recorded breaks sit outside the new clock and come off the day: {c.strandedBreaks.join(", ")}.</p>}
      {!settled && (
        <>
          <p className={styles.impact}><strong>If you accept</strong>{c.effect}</p>
          <label className={styles.note}>Note for the record <span>(optional)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} disabled={!!busy} /></label>
          <div className={styles.actions}>
            <div className={styles.buttons}>
              <button type="button" className={`${styles.button} ${styles.primary}`} disabled={!!busy || !!slotError} onClick={() => decide("accepted")}>{busy === "accepted" ? "Accepting..." : "Accept"}</button>
              <button type="button" className={styles.button} disabled={!!busy} onClick={() => decide("declined")}>{busy === "declined" ? "Declining..." : "Decline"}</button>
            </div>
          </div>
        </>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.history}>
        <p>Reported {reportTimestamp(c.createdAt)}</p>
        {settled && <p>{statusLabel(c.status)}{c.resolvedBy ? ` by ${c.resolvedBy}` : ""} {reportTimestamp(c.resolvedAt)}</p>}
        {c.resolutionNote && <p><strong>Note: </strong>{c.resolutionNote}</p>}
        {sheet.recomputedAt && <p>Recalculated {reportTimestamp(sheet.recomputedAt)}</p>}
      </div>
      <div className={styles.progress}>
        {open > 0 ? <p className={styles.caption}>{open} open</p> : sheet.canRebuild ? (
          <RecomputeButton timesheetId={sheet.id} accepted={sheet.corrections.filter((item) => item.status === "accepted").length} />
        ) : <p className={styles.caption}>This batch was uploaded before corrections existed, so there&apos;s no punch detail to rebuild the sheet from. Re-upload the period to correct it here.</p>}
      </div>
      <Link className={styles.link} href={`/portal/admin/timesheets/${batchId}`}>Back to the batch</Link>
    </article>
  );
}

function SlotList({ slots }) {
  return <div className={styles.slots}>{slots.map((slot, index) => <span key={index}>{clockLabel(slot.from)} to {clockLabel(slot.to)}</span>)}</div>;
}

function SlotCalendar({ original, proposed }) {
  const all = [...original, ...proposed];
  const low = Math.floor(Math.min(...all.map((s) => s.from)) / 60) * 60;
  const high = Math.ceil(Math.max(...all.map((s) => s.to)) / 60) * 60;
  const span = Math.max(60, high - low);
  return (
    <div className={styles.calendar} style={{ height: 220 }} aria-label="Original and reported work slots">
      <div className={styles.ruler} aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i} style={{ top: `${i * 20}%` }}>{clockLabel(Math.round(low + span * i / 5))}</span>)}</div>
      {[original, proposed].map((slots, i) => (
        <div key={i} className={`${styles.lane} ${i ? styles.proposed : ""}`} aria-label={i ? "Employee reported" : "Before correction"}>
          {slots.map((slot, index) => <div key={index} className={styles.block} style={{ top: `${(slot.from - low) / span * 100}%`, height: `${(slot.to - slot.from) / span * 100}%` }} title={`${clockLabel(slot.from)} to ${clockLabel(slot.to)}`}>{clockLabel(slot.from)} to {clockLabel(slot.to)}</div>)}
        </div>
      ))}
    </div>
  );
}
