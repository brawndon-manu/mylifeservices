import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets, isSuper } from "@/lib/roles";
import { splitPremiumForSheets, confirmedFromAnswers } from "@/lib/timesheet/premium-split";
import { reviewChoices } from "@/lib/timesheet/qsp-changes";
import { timeOffReviewItems } from "@/lib/timesheet/time-off";
import { batchPeriodLabels } from "@/lib/timesheet/batch-overview";
import BackLink from "@/components/BackLink";
import { SignatureBadge } from "../../_components/LiveBadge";
import DeleteBatchButton from "../../_components/DeleteBatchButton";
import ResetAnswersButton from "../../_components/ResetAnswersButton";

export const metadata = {
  title: "Legacy · Timesheets",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// Temporary home for the tools removed from the main pay period page.
// Keeping this under [id] retains the shared presence and read-only behavior.
export default async function TimesheetLegacyPage({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      timesheets: {
        include: {
          corrections: {
            where: { OR: [{ status: "open" }, { kind: { startsWith: "q_" } }] },
            select: { id: true, kind: true, status: true, date: true },
          },
        },
      },
    },
  });
  if (!batch) notFound();
  if (batch.auditOnly) redirect(`/portal/admin/audit/${batch.id}`);

  const canPreview = isSuper(user?.role);
  const total = batch.timesheets.length;
  const sent = batch.timesheets.filter((t) => t.sentAt).length;
  const signed = batch.timesheets.filter((t) => t.signedAt).length;
  const confirmedBySheet = Object.fromEntries(
    batch.timesheets.map((t) => [t.id, confirmedFromAnswers(t.corrections)]),
  );
  const premiumSplit = splitPremiumForSheets(batch.timesheets, { confirmedBySheet });
  const rows = batch.timesheets.map((t) => ({
    scheduleMissing: (t.data?.scheduleCheck?.flagged || [])
      .filter((f) => f.flag === "missing-from-timesheet").length,
    scheduleFlags: (t.data?.scheduleCheck?.flagged || []).length,
    scheduleMatched: !!t.data?.scheduleCheck?.matched,
    scheduleStatus: t.data?.scheduleCheck?.status || "no-file",
    scheduleError: t.data?.scheduleCheck?.error || null,
  }));
  // what a reset would destroy, counted from the rows already loaded rather than
  // with a second query - the `q_` rows ARE the answers
  const answersGiven = batch.timesheets.reduce(
    (n, t) => n + t.corrections.filter((c) => String(c.kind || "").startsWith("q_")).length,
    0,
  );
  // days on the schedule that were never worked, kept apart from days simply
  // worked differently - the second is ordinary, the first is a missing day
  const scheduleMissingRows = rows.filter((r) => r.scheduleMissing > 0).length;
  const scheduleFlagRows = rows.filter((r) => r.scheduleFlags - r.scheduleMissing > 0).length;
  const anyScheduleChecked = rows.some((r) => r.scheduleMatched);
  const scheduleMatchedCount = rows.filter((r) => r.scheduleMatched).length;
  const scheduleNotFound = rows.filter((r) => r.scheduleStatus === "name-not-found").length;
  const scheduleFailed = rows.find((r) => r.scheduleStatus === "parse-failed");
  // THE QUICKSOLVE DESK'S HEADLINE: how many entries the signed reviews have
  // left to key in, and how many reviews are signed off as fully entered.
  // Derived the same way the desk and both emails derive it - one derivation.
  const qspCorrections = await prisma.timesheetCorrection.findMany({
    where: { timesheet: { batchId: batch.id, signedAt: { not: null } }, status: { not: "open" } },
    select: {
      id: true, timesheetId: true, kind: true, date: true, status: true,
      choice: true, statedBreaks: true, question: true, timeOff: true,
      qspMarks: { select: { fact: true } },
    },
  });
  const qsp = { owed: 0, marked: 0, reviews: 0 };
  {
    const bySheet = new Map();
    for (const c of qspCorrections) {
      if (!bySheet.has(c.timesheetId)) bySheet.set(c.timesheetId, []);
      bySheet.get(c.timesheetId).push(c);
    }
    for (const cs of bySheet.values()) {
      const items = [...reviewChoices(cs), ...timeOffReviewItems(cs)];
      const owed = items.reduce((n, it) => n + it.changes.length, 0);
      if (!owed) continue;
      qsp.reviews += 1;
      qsp.owed += owed;
      const marked = new Set(cs.flatMap((c) => c.qspMarks.map((m) => `${c.id}|${m.fact}`)));
      qsp.marked += items.reduce(
        (n, it) => n + it.changes.filter((ch) => marked.has(`${it.correctionId}|${ch.fact}`)).length,
        0,
      );
    }
  }

  const period = batchPeriodLabels(batch.periodFrom, batch.periodTo);
  return (
    <section className="mx-auto max-w-7xl px-6 py-6 sm:py-8">
      <BackLink href={`/portal/admin/timesheets/${batch.id}`}>Back to pay period</BackLink>
      <header className="mt-5 mb-6 border-b border-border pb-6">
        <p className="text-sm text-muted">
          {period.eyebrow} · {period.title} ({batch.program === "DP" ? "Day program" : "ILS"})
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Legacy</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Tools and reports moved from the pay period page, kept here while their new homes are decided.
        </p>
      </header>
      {canPreview && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border-strong bg-surface-2 px-3 py-2">
          <p className="text-xs text-muted">
            <b className="text-foreground">Testing.</b> Answer as anyone from
            their row on the pay period page, then put every question back with this.
          </p>
          <ResetAnswersButton
            batchId={batch.id}
            answers={answersGiven}
            signed={signed}
          />
        </div>
      )}

      {/* the corrected sheets themselves. these used to appear only once
          somebody had signed, which is backwards - reading the batch over is
          exactly what you want to do BEFORE anyone is emailed. */}
      <div id="timesheet-documents" className="mt-4 scroll-mt-24 rounded-lg border border-border bg-surface-2 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Download the corrected timesheets
        </h2>
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
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted">
            Uploaded the wrong export, or need to redo it after correcting QSP?
          </p>
          <DeleteBatchButton
            batchId={batch.id}
            period={`${batch.periodFrom} to ${batch.periodTo}`}
          />
        </div>

      </div>

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

      {/* the thing management actually has to sign. this card no longer grades
          the total itself - see the RETIRED note above readyToSend. it points
          at the one screen that does. */}
      {/* gated on the ORIGINAL figure, not the stored premiumHours column -
          the stored column falls as people answer, and a card that vanishes
          while the original says hours stand would be the old leak wearing a
          different face. */}
      {premiumSplit.originalProjected > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Premium hours, by what stands behind them
          </h2>
          <p className="mt-1 text-xs text-muted">
            {premiumSplit.originalProjected.toFixed(2)} hours across this pay period. Nobody should
            sign off on that figure without reading one of these.
          </p>

          {/* TWO FIGURES, SIMPLIFIED BY MÁNU 2026-08-17, replacing the
              projected/settled pair and a short-lived third tile. The FIRST
              is the original: every fault the reports show, unmoved by an
              employee's own answers, signed or not - the number that stands
              if nobody signs off. Only a reviewer settling an hour, or a
              re-upload, moves it. The SECOND is the live one: same number,
              moving up or down as sign-offs land, and it is what the payout
              report and the penalty roster pay. */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Projected premium
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {premiumSplit.originalProjected.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-muted">
                Every fault the reports show, taken literally, with its penalty.
                This is the number that stands if nobody signs off.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface-2 p-3">
              {/* THE LIVE PILL SITS HERE: this is the figure that moves as
                  people sign, so the light belongs beside the number it
                  describes. */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Live premium
                </p>
                <SignatureBadge sent={sent} signed={signed} size="sm" />
              </div>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {premiumSplit.liveProjected.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-muted">
                The projected figure with every sign-off applied, moving as
                they land. This is what the payout report and the penalty
                hours PDF pay.
              </p>
            </div>
          </div>

          {/* what each premium rests on, and which ones nobody has settled.
              this is the question that decides whether any of them can be sent,
              so it leads. */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-xs text-muted">
              What each premium rests on: witnessed by a document, settled by a
              ruling, or still waiting on a person.
            </p>
            <Link
              href={`/portal/admin/timesheets/${batch.id}/evidence`}
              className="max-w-full shrink-0 rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
            >
              What they rest on →
            </Link>
          </div>

          {/* and the other question people ask straight afterwards: where the
              hours fall, who carries them, and what caused each one. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-xs text-muted">
              Where the {premiumSplit.liveProjected.toFixed(2)} hours fall, who carries them,
              and the reason behind every one.
            </p>
            <Link
              href={`/portal/admin/timesheets/${batch.id}/penalty-hours`}
              className="max-w-full shrink-0 rounded-md border border-border-strong px-4 py-2 text-sm font-semibold transition hover:bg-surface-3"
            >
              View the breakdown →
            </Link>
          </div>
        </div>
      )}

      {/* THE CLOCK EXPORT, WHICH IS NOT PART OF THE PAYROLL. It is optional, it
          moves no figure on this page, and it answers a different question from
          everything above: not what anybody is owed, but whether the times on
          the record were clocked or typed. Its own card for that reason, and
          the only card here that says something when it is empty - a period
          uploaded without the export has no attendance record at all, and that
          is worth seeing rather than guessing at. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 p-3">
        <p className="text-xs text-muted">
          {batch.clockFindings
            ? `${batch.clockFindings.shifts} shifts from the clock export, rostered against what was `
              + `actually clocked, with the location and the 3.5 hour cap beside them.`
            : "No clock export on this pay period, so there is no record of who clocked in, who "
              + "clocked out, or where they were."}
        </p>
        <Link
          href={`/portal/admin/timesheets/${batch.id}/attendance`}
          className="max-w-full shrink-0 rounded-md border border-border-strong px-4 py-2 text-sm font-semibold transition hover:bg-surface-3"
        >
          QSClock Time and Attendance →
        </Link>
      </div>

      {/* THE QUICKSOLVE CORRECTIONS DESK. What the signed reviews have left to
          key into QuickSolve, worked entry by entry and signed off per review.
          Its own card because it is the office's follow-through on every
          signature above. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 p-3">
        <p className="text-xs text-muted">
          {qsp.reviews === 0
            ? "No signed review has left entries to change in QuickSolve yet."
            : `${qsp.owed - qsp.marked} of ${qsp.owed} entries still to add in QuickSolve, ` +
              `across ${qsp.reviews} signed ${qsp.reviews === 1 ? "review" : "reviews"}.`}
        </p>
        <Link
          href={`/portal/admin/timesheets/${batch.id}/qsp`}
          className="max-w-full shrink-0 rounded-md border border-border-strong px-4 py-2 text-sm font-semibold transition hover:bg-surface-3"
        >
          Corrections to make in QuickSolve →
        </Link>
      </div>

    </section>
  );
}
