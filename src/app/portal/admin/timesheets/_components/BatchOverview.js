import Link from "next/link";
import { Check, Clock3, FlaskConical, MoreHorizontal, TriangleAlert } from "lucide-react";
import { batchState, periodDays } from "@/lib/timesheet/batch-state";
import { batchPeriodLabels } from "@/lib/timesheet/batch-overview";
import { companyDateTime } from "@/lib/company-time";
import { batchForceTo } from "@/lib/timesheet-mode";
import { VersionBadge } from "./LiveBadge";
import LockPeriod from "./LockPeriod";
import SendModeBanner from "./SendModeBanner";
import styles from "./BatchOverview.module.css";

const hours = (value) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BatchOverview({ batch, state, newerInPeriod, total, sent, signed, approved, sourceDocs, uploadedByName, mode, totals, premium, waiting, actions, sendControl }) {
  const period = batchPeriodLabels(batch.periodFrom, batch.periodTo);
  const lifecycle = batchState(batch);
  const days = periodDays(batch);
  const covered = days.filter((day) => day.covered).length;
  const redirectedTo = batchForceTo(batch);
  const StateIcon = lifecycle.key === "final" ? Check : lifecycle.key === "live" ? Clock3 : TriangleAlert;
  const leave = [totals.pto > 0 && `${hours(totals.pto)} PTO hours`, totals.sick > 0 && `${hours(totals.sick)} sick-pay hours`].filter(Boolean);

  return (
    <div className={styles.overview}>
      <header className={styles.header}>
        <div>
          <p className={styles.month}>{period.eyebrow} · {batch.program === "DP" ? "Day program" : "ILS"}</p>
          <h1 className={styles.title}>{period.title}</h1>
          <div className={styles.metadata}>
            <span className={styles.status} data-state={lifecycle.key}>
              <StateIcon size={14} aria-hidden="true" />
              {lifecycle.key === "final" ? "Final upload" : lifecycle.key === "live" ? "Still coming in" : "Needs a decision"}
            </span>
            <span>{total} employees</span>
            <span aria-hidden="true">·</span>
            <a href="#period-details">Period details</a>
          </div>
        </div>
        <div className={styles.toolbar}>
          {state.key !== "superseded" && sendControl}
          <Link className={styles.button} href={`/portal/admin/timesheets/${batch.id}/legacy#timesheet-documents`}>Documents</Link>
          <details className={styles.more}>
            <summary className={styles.button} aria-label="More period actions"><MoreHorizontal size={18} aria-hidden="true" /></summary>
            <nav className={styles.menu} aria-label="Period actions">{actions}</nav>
          </details>
        </div>
      </header>

      {redirectedTo ? (
        <p className={styles.delivery}><FlaskConical size={16} aria-hidden="true" /><span>Test batch · All emails go to {redirectedTo}</span></p>
      ) : (
        <div className={styles.deliveryMode}>
          {batch.testOnly && <p className={styles.caution}>Test batch · no address set</p>}
          <SendModeBanner mode={mode} />
        </div>
      )}

      <dl className={styles.totals}>
        <div>
          <dt>Hours worked</dt>
          <dd className={styles.hours}>{hours(totals.worked)}</dd>
          {leave.length > 0 && <p>Plus {leave.join(" · ")}</p>}
        </div>
        <div>
          <dt>Current premium hours</dt>
          <dd className={styles.hours}>{hours(premium)}</dd>
          {waiting > 0 && <p>Provisional · {waiting} with questions</p>}
        </div>
        <div>
          <dt>Signed timesheets</dt>
          <dd>{signed}<span className={styles.muted}> / {total}</span></dd>
          <p>{sent} sent · {approved} approved</p>
        </div>
      </dl>

      <section id="period-details" className={styles.details} aria-labelledby="period-details-title">
        <div className={styles.detailsHeading}>
          <h2 id="period-details-title">Period details</h2>
          <VersionBadge newerInPeriod={newerInPeriod} />
        </div>
        {state.key !== "final" && (
          <p className={styles.explanation}>
            {state.key === "live"
              ? `The export reaches ${state.reach || "no recorded date"}. The period runs to ${batch.periodTo}.`
              : state.key === "superseded"
                ? "A later upload of this pay period exists. This is the record of the earlier export."
                : "The whole period is in. Confirm that the schedule is locked before sending."}
          </p>
        )}
        {days.length > 0 && (
          <ol className={styles.days} aria-label="Export coverage by date">
            {days.map((day, index) => (
              <li key={index} className={day.covered ? styles.covered : styles.missing}>
                <span aria-hidden="true">{day.day}</span>
                <span className="sr-only">{day.day}: {day.covered ? "covered by the export" : "not in the export yet"}</span>
              </li>
            ))}
          </ol>
        )}
        <dl className={styles.detailRows}>
          <div>
            <dt>Export coverage</dt>
            <dd className={days.length && covered === days.length ? styles.positive : styles.caution}>
              {!days.length ? "Coverage unavailable" : covered === days.length ? `All ${days.length} dates covered` : `${covered} of ${days.length} dates covered`}
            </dd>
          </div>
          {batch.lockedAt && (
            <div><dt>Marked final</dt><dd>{batch.lockedByName && `${batch.lockedByName} · `}{companyDateTime(batch.lockedAt)}</dd></div>
          )}
          <div>
            <dt>Uploaded</dt>
            <dd>{companyDateTime(batch.createdAt)}{uploadedByName && <span className={styles.subvalue}>{uploadedByName}</span>}</dd>
          </div>
          <div><dt>Source documents</dt><dd>{sourceDocs}</dd></div>
        </dl>
        {state.key !== "superseded" && (
          <div className={styles.lock}>
            <LockPeriod batchId={batch.id} locked={!!batch.lockedAt} lockedByName={batch.lockedByName}
              lockedAt={batch.lockedAt ? companyDateTime(batch.lockedAt) : null} covered={state.covered} showStatus={false} />
          </div>
        )}
      </section>
    </div>
  );
}
