import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { sendModeSummary } from "@/lib/timesheet-send";
import { describePunchIssue, scheduledPaidHours } from "@/lib/timesheet/anomalies";
import BackLink from "@/components/BackLink";
import SendModeBanner from "../_components/SendModeBanner";
import ReviewTable from "../_components/ReviewTable";
import SendPanel from "../_components/SendPanel";
import DeleteBatchButton from "../_components/DeleteBatchButton";
import { assignTimesheet, clearTimesheetAssignment, sendTimesheets } from "../actions";

export const metadata = { title: "Timesheet batch", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TimesheetBatchPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        orderBy: { sourceName: "asc" },
        include: {
          user: {
            select: {
              id: true, email: true, name: true,
              preferredFirstName: true, preferredLastName: true, title: true, image: true,
            },
          },
          corrections: { where: { status: "open" }, select: { id: true } },
        },
      },
    },
  });
  if (!batch) notFound();

  const staff = await prisma.user.findMany({
    where: { deactivatedAt: null },
    select: { id: true, name: true, preferredFirstName: true, preferredLastName: true, title: true, image: true, email: true },
    orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
  });
  const candidates = staff.map((u) => ({
    id: u.id,
    displayName: preferredName(u),
    title: u.title || "",
    image: u.image || null,
    email: u.email,
  }));

  const rows = batch.timesheets.map((t) => ({
    id: t.id,
    sourceName: t.sourceName,
    matchMethod: t.matchMethod,
    confidence: t.data?.confidence ?? null,
    suggestions: (t.data?.suggestions || []).map((s) => ({
      ...candidates.find((c) => c.id === s.id),
      confidence: s.confidence,
    })).filter((s) => s.id),
    user: t.user
      ? { id: t.user.id, displayName: preferredName(t.user), email: t.user.email, image: t.user.image }
      : null,
    rawHours: t.rawHours,
    paidHours: t.paidHours,
    otHours: t.otHours,
    doubleHours: t.doubleHours,
    premiumHours: t.premiumHours,
    partialWeek: t.partialWeek,
    hasPdf: !!t.pdfUrl,
    sentAt: t.sentAt ? t.sentAt.toISOString() : null,
    sentToEmail: t.sentToEmail,
    intendedEmail: t.intendedEmail,
    signedAt: t.signedAt ? t.signedAt.toISOString() : null,
    approvedAt: t.approvedAt ? t.approvedAt.toISOString() : null,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    disputed: t.corrections.length > 0,
    punchIssues: (t.data?.punchIssues || []).length,
    // how many of those flags actually need a person. the raw count sits
    // directly above Send all and read "23 people have punch entries that
    // can't be right" when one day in the whole batch was unresolved - most
    // are either repairable, corroborated by the schedule, or move no figure
    // at all. the number someone reads last should be the one they can act on.
    punchOpen: (t.data?.punchIssues || []).filter((p) => {
      const sc = t.data?.scheduleCheck?.byDate?.[p.date];
      return describePunchIssue(p, scheduledPaidHours(sc))?.tone === "human";
    }).length,
    scheduleFlags: (t.data?.scheduleCheck?.flagged || []).length,
    // "worked hours that differ from what was scheduled" was counting days
    // nobody worked AT ALL. those are a different question and a worse one.
    scheduleMissing: (t.data?.scheduleCheck?.flagged || [])
      .filter((f) => f.flag === "missing-from-timesheet").length,
    scheduleMatched: !!t.data?.scheduleCheck?.matched,
    scheduleStatus: t.data?.scheduleCheck?.status || "no-file",
    scheduleError: t.data?.scheduleCheck?.error || null,
    support: t.data?.premiumSupport?.totals || null,
  }));

  const total = rows.length;
  const matched = rows.filter((r) => r.user).length;
  const unmatched = total - matched;
  const sent = rows.filter((r) => r.sentAt).length;
  const signed = rows.filter((r) => r.signedAt).length;
  const approved = rows.filter((r) => r.approvedAt).length;
  const awaitingApproval = rows.filter((r) => r.signedAt && !r.approvedAt).length;
  const disputed = rows.filter((r) => r.disputed).length;
  const punchIssueRows = rows.filter((r) => r.punchIssues > 0).length;
  const punchOpenRows = rows.filter((r) => r.punchOpen > 0).length;
  const punchOpenDays = rows.reduce((n, r) => n + r.punchOpen, 0);
  const punchDays = rows.reduce((n, r) => n + r.punchIssues, 0);
  // days on the schedule that were never worked, kept apart from days simply
  // worked differently - the second is ordinary, the first is a missing day
  const scheduleMissingRows = rows.filter((r) => r.scheduleMissing > 0).length;
  const scheduleFlagRows = rows.filter((r) => r.scheduleFlags - r.scheduleMissing > 0).length;
  const anyScheduleChecked = rows.some((r) => r.scheduleMatched);
  const scheduleMatchedCount = rows.filter((r) => r.scheduleMatched).length;
  const scheduleNotFound = rows.filter((r) => r.scheduleStatus === "name-not-found").length;
  const scheduleFailed = rows.find((r) => r.scheduleStatus === "parse-failed");
  // premium hours split by how well the day behind each one is evidenced. only
  // batches uploaded with the clock report carry this.
  const support = rows.reduce(
    (a, r) => (r.support
      ? { recorded: a.recorded + (r.support.recorded || 0),
          supported: a.supported + (r.support.supported || 0),
          unverified: a.unverified + (r.support.unverified || 0) }
      : a),
    { recorded: 0, supported: 0, unverified: 0 },
  );
  const hasSupport = support.recorded + support.supported + support.unverified > 0;

  const readyToSend = rows.filter((r) => r.user && r.hasPdf && !r.sentAt && !r.disputed).length;
  const missingPdf = rows.filter((r) => !r.hasPdf).length;
  const mode = sendModeSummary();

  const sentCount = sp?.sent ? Number(sp.sent) : null;
  const failedCount = sp?.failed ? Number(sp.failed) : null;

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/portal/admin/timesheets">Back to Timesheets</BackLink>
        <span className="flex flex-wrap items-center gap-2">
          <a
            href={`/portal/admin/timesheets/${batch.id}/penalties`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-brand bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand/20"
          >
            Penalty hours for payroll (PDF) →
          </a>
          <Link
            href={`/portal/admin/timesheets/${batch.id}/report`}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Payout report →
          </Link>
          <Link
            href={`/portal/admin/timesheets/${batch.id}/stats`}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Insights &amp; stats →
          </Link>
          <Link
            href="/portal/admin/timesheets/patterns"
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Repeat patterns →
          </Link>
        </span>
      </div>

      {/* the corrected sheets themselves. these used to appear only once
          somebody had signed, which is backwards - reading the batch over is
          exactly what you want to do BEFORE anyone is emailed. */}
      <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Download the corrected timesheets
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a
            href={`/portal/admin/timesheets/${batch.id}/download?all=1`}
            className="rounded-md border border-brand bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand/20"
          >
            All {total} as one PDF
          </a>
          <a
            href={`/portal/admin/timesheets/${batch.id}/download-zip?all=1`}
            className="rounded-md border border-brand bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand/20"
          >
            All {total} separately (.zip)
          </a>
          {signed > 0 && (
            <>
              <span className="text-xs text-faint">or signed only:</span>
              <a
                href={`/portal/admin/timesheets/${batch.id}/download`}
                className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
              >
                {signed} as one PDF
              </a>
              <a
                href={`/portal/admin/timesheets/${batch.id}/download-zip`}
                className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
              >
                {signed} separately (.zip)
              </a>
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          Every sheet carries the break highlighting, the color key and the
          premium section. Where someone has signed or been approved, that copy
          is used instead of the blank one.
        </p>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted">
            Uploaded the wrong export, or need to redo it after correcting QSP?
          </p>
          <DeleteBatchButton
            batchId={batch.id}
            period={`${batch.periodFrom} to ${batch.periodTo}`}
          />
        </div>
      </div>

      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Pay period</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {batch.periodFrom} to {batch.periodTo}
      </h1>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Stat label="employees" value={total} />
        <Stat label="matched" value={matched} tone={unmatched ? "warn" : "ok"} />
        <Stat label="sent" value={sent} />
        <Stat label="signed" value={signed} tone={signed === total && total > 0 ? "ok" : undefined} />
        <Stat label="approved" value={approved} tone={approved === signed && signed > 0 ? "ok" : undefined} />
      </div>

      <SendModeBanner mode={mode} />

      {punchDays > 0 && (
        <div
          className={
            punchOpenDays > 0
              ? "mt-4 rounded-lg border-2 border-rose-400 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/40"
              : "mt-4 rounded-lg border border-border bg-surface-2 p-4"
          }
        >
          <p
            className={
              punchOpenDays > 0
                ? "text-base font-semibold text-rose-900 dark:text-rose-200"
                : "text-base font-semibold text-foreground"
            }
          >
            {punchOpenDays > 0 ? "Check these before you send anything" : "Nothing here needs a decision"}
          </p>
          {/* built as strings rather than interleaved JSX - mixing expressions
              and wrapped text is how "people have" and "punch entries" ended up
              rendering as "havepunch". */}
          <p
            className={
              punchOpenDays > 0
                ? "mt-1 text-sm text-rose-800 dark:text-rose-200/90"
                : "mt-1 text-sm text-muted"
            }
          >
            {punchOpenDays > 0 ? (
              <span className="block">
                <strong>{punchOpenDays}</strong>
                {` ${punchOpenDays === 1 ? "day needs" : "days need"} somebody to decide, across ${punchOpenRows} ${punchOpenRows === 1 ? "person" : "people"}. Nothing else can be settled from the records we hold.`}
              </span>
            ) : (
              <span className="block">
                {`Every one of the ${punchDays} flagged ${punchDays === 1 ? "day" : "days"} either has a repair the schedule confirms, or pays the same whichever way it is read.`}
              </span>
            )}
            <span className="mt-1 block">
              {`${punchDays} ${punchDays === 1 ? "day is" : "days are"} flagged in total, across ${punchIssueRows} ${punchIssueRows === 1 ? "person" : "people"} - a clock-out before the clock-in, or a stretch of 10+ hours that is almost certainly a rest break with the wrong AM/PM on it. Most are repairable or already corroborated.`}
            </span>
          </p>
          <Link
            href={`/portal/admin/timesheets/${batch.id}/checks`}
            className={
              punchOpenDays > 0
                ? "mt-3 inline-block rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                : "mt-3 inline-block rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-3"
            }
          >
            See what looks wrong →
          </Link>
        </div>
      )}

      {/* three different things, and they used to all read as "no schedule
          uploaded" - which is useless when the truth is that one WAS given and
          silently failed to parse. */}
      {scheduleFailed ? (
        <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <strong>A schedule PDF was uploaded but couldn&apos;t be read</strong>, so
          the hours were only checked against themselves.
          {scheduleFailed.scheduleError && (
            <span className="mt-1 block font-mono text-xs opacity-80">
              {scheduleFailed.scheduleError}
            </span>
          )}
          <span className="mt-1 block">
            It needs to be the QSP <em>Employee Schedules</em> export - the month
            calendar with one page per person, not a payroll report.
          </span>
        </div>
      ) : !anyScheduleChecked ? (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          No schedule export reached the server with this batch, so the hours are
          only checked against themselves. A punch typed into the wrong box stays
          invisible that way.{" "}
          <Link href="/portal/admin/timesheets/new" className="font-semibold underline underline-offset-4">
            Upload again with the schedule PDF
          </Link>{" "}
          to get the second check.
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          Checked against the schedule: <strong>{scheduleMatchedCount}</strong> of{" "}
          {total} matched to a schedule page.
          {scheduleFlagRows > 0 && (
            <span className="mt-1 block">
              <strong>{scheduleFlagRows}</strong>
              {` ${scheduleFlagRows === 1 ? "person" : "people"} worked hours that differ from what was scheduled. That is ordinary and nothing is wrong with it - the timesheet is what counts. It is listed on the checks screen only as context.`}
            </span>
          )}
          {/* a day on the schedule that was never punched is NOT "worked
              differently" - it is a day missing from the timesheet, and it is
              the more serious of the two. it was being counted as the first. */}
          {scheduleMissingRows > 0 && (
            <span className="mt-1 block font-semibold">
              {`${scheduleMissingRows} ${scheduleMissingRows === 1 ? "person was" : "people were"} scheduled on a day the timesheet has no punches for at all, so it pays nothing. Worth opening before you send.`}
            </span>
          )}
          {scheduleNotFound > 0 && (
            <span className="mt-1 block">
              <strong>{scheduleNotFound}</strong> had no page in the schedule
              export under a matching name, so those hours have no second opinion.
            </span>
          )}
        </div>
      )}

      {/* the thing management actually has to sign: how much of the premium
          total stands on evidence, and how much needs a person. */}
      {hasSupport && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-foreground">
            Premium hours, by what stands behind them
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Evidenced
              value={support.recorded}
              label="Recorded by QSP"
              detail="A rest break QSP's own report accounts for, or a day clocked in and out of every shift."
              tone="good"
            />
            <Evidenced
              value={support.supported}
              label="Corroborated"
              detail="A meal premium on a day the schedule gave them no meal period at all."
              tone="ok"
            />
            <Evidenced
              value={support.unverified}
              label="Needs somebody to look"
              detail="Nothing behind it: not clocked, and no corroborating record."
              tone={support.unverified > 0 ? "bad" : "good"}
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            Graded per premium, not per day - a rest question and a meal question
            have different witnesses, and the schedule holds meal breaks but not
            one rest period. Hours differing from the schedule is not counted
            against anything here: people work different hours than they were
            scheduled, and the timesheet is the record we go by.
          </p>
        </div>
      )}

      {disputed > 0 && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>{disputed}</strong>{" "}
          {disputed === 1 ? "person says their timesheet is" : "people say their timesheets are"}{" "}
          wrong. Their signatures are on hold and they won&apos;t be sent again
          until it&apos;s resolved.{" "}
          <Link
            href={`/portal/admin/timesheets/${batch.id}/corrections`}
            className="font-semibold underline underline-offset-4"
          >
            Review what they reported
          </Link>
          .
        </div>
      )}

      {sentCount !== null && (
        <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          Sent {sentCount} timesheet{sentCount === 1 ? "" : "s"}
          {mode.live ? "" : ` (redirected to ${mode.recipients.join(", ")})`}.
          {failedCount ? ` ${failedCount} failed - check the rows below.` : ""}
        </div>
      )}

      {missingPdf > 0 && (
        <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <strong>{missingPdf}</strong>{" "}
          {missingPdf === 1 ? "timesheet has" : "timesheets have"} no stored PDF
          in this batch - file storage was failing when it was uploaded. Those
          can&apos;t be sent (the link would 404). Refresh the Blob token with{" "}
          <code className="rounded bg-rose-100 px-1 py-0.5 text-xs dark:bg-rose-900/50">
            vercel env pull .env.local
          </code>{" "}
          and upload the export again.
        </div>
      )}

      {unmatched > 0 && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>{unmatched}</strong>{" "}
          {unmatched === 1 ? "timesheet has" : "timesheets have"} no matched
          employee yet. Those can&apos;t be sent until you pick who they belong
          to.
        </div>
      )}

      <SendPanel
        batchId={batch.id}
        readyToSend={readyToSend}
        alreadySent={sent}
        send={sendTimesheets}
        live={mode.live}
      />

      <ReviewTable
        rows={rows}
        candidates={candidates}
        batchId={batch.id}
        assign={assignTimesheet}
        clear={clearTimesheetAssignment}
        send={sendTimesheets}
      />
    </section>
  );
}

function Stat({ label, value, tone }) {
  const cls =
    tone === "ok"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
      : tone === "warn"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
        : "border-border bg-surface text-muted";
  return (
    <span className={`rounded-md border px-2.5 py-1 ${cls}`}>
      {label} <b className="font-semibold">{value}</b>
    </span>
  );
}

// one column of the premium-evidence panel
function Evidenced({ value, label, detail, tone }) {
  const cls =
    tone === "good"
      ? "border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20"
      : tone === "ok"
        ? "border-sky-300/60 bg-sky-50/60 dark:border-sky-900/50 dark:bg-sky-950/20"
        : "border-rose-300/60 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20";
  const num =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "ok"
        ? "text-sky-700 dark:text-sky-400"
        : "text-rose-700 dark:text-rose-400";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <p className={`text-2xl font-semibold tabular-nums ${num}`}>
        {value.toFixed(2)}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}
