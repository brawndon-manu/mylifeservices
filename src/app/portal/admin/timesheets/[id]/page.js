import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { sendModeSummary } from "@/lib/timesheet-send";
import { describePunchIssue, scheduledPaidHours } from "@/lib/timesheet/anomalies";
import { buildQuestions, answerProgress } from "@/lib/timesheet/questions";
import {
  splitPremium,
  splitPremiumForSheets,
  confirmedFromAnswers,
} from "@/lib/timesheet/premium-split";
import BackLink from "@/components/BackLink";
import SendModeBanner from "../_components/SendModeBanner";
import ReviewTable from "../_components/ReviewTable";
import { signTimesheetToken } from "@/lib/timesheet-token";
import { isSuper } from "@/lib/roles";
import SendPanel from "../_components/SendPanel";
import LiveBadge, { PeriodStrip, VersionBadge, SignatureBadge } from "../_components/LiveBadge";
import LockPeriod from "../_components/LockPeriod";
import { batchState } from "@/lib/timesheet/batch-state";
import TestBatchBadge from "../_components/TestBatchBadge";
import ProgramBadge from "../_components/ProgramBadge";
import DeleteBatchButton from "../_components/DeleteBatchButton";
import ResetAnswersButton from "../_components/ResetAnswersButton";
import { assignTimesheet, clearTimesheetAssignment, sendTimesheets } from "../actions";
import { companyDate } from "@/lib/company-time";

// the tab is where the name is most visible, and "Timesheet batch" told you
// nothing about WHICH one when three are open at once. `batch` is our word
// anyway - payroll says "the July 16th to 31st period".
export async function generateMetadata({ params }) {
  const { id } = await params;
  const b = await prisma.timesheetBatch.findUnique({
    where: { id },
    select: { periodFrom: true, periodTo: true },
  });
  return {
    title: b ? `Pay period ${b.periodFrom} to ${b.periodTo}` : "Pay period",
    robots: { index: false, follow: false },
  };
}
export const dynamic = "force-dynamic";

export default async function TimesheetBatchPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");

  const batch = await prisma.timesheetBatch.findUnique({
    where: { id },
    include: {
      uploadedBy: {
        select: { name: true, preferredFirstName: true, preferredLastName: true },
      },
      timesheets: {
        orderBy: { sourceName: "asc" },
        include: {
          user: {
            select: {
              id: true, email: true, name: true,
              preferredFirstName: true, preferredLastName: true, title: true, image: true,
              // ON THE ROW BECAUSE THE ROW IS WHERE YOU DECIDE TO RING SOMEBODY.
              // This screen is behind `canManageTimesheets`, and All employees -
              // one click away, same batch, same people - has shown the number
              // since it was built. Selecting it here does not widen who can
              // read one; the 2026-08-16 rule puts every timesheets screen on
              // the same side of the line already.
              phone: true,
            },
          },
          // open ones block signing. The `q_` ones are the five questions the
          // employee is asked before signing, and they are NOT open - they must
          // not put the sheet into the reported-a-problem state, but payroll
          // still has to see who has answered and who has argued back.
          corrections: {
            where: { OR: [{ status: "open" }, { kind: { startsWith: "q_" } }] },
            select: { id: true, kind: true, status: true, date: true },
          },
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

  // the five pre-signing questions, from the same classifier the timesheet review page
  // and the server action use, so payroll's count cannot drift from what the
  // person is actually being shown
  const progressFor = (t) =>
    answerProgress(
      buildQuestions(t.data, {
        restRows: batch.restsByDate || [],
        sourceName: t.sourceName,
      }),
      t.corrections,
    );

  // the projected figure and what the policy assumptions would take off it. A
  // premium somebody has told us they ARE owed can no longer be assumed away, so
  // the answers feed in.
  // WHICH PREMIUMS SOMEBODY HAS SAID THEY ARE OWED. Derived in
  // premium-split.js now rather than here: the PDF route needs the same answer
  // to build the corrected copy, and a screen and a document disagreeing about
  // what a person said is the drift the single classifier exists to stop. The
  // version that lived here also missed `q_nothingDocumented`, which is the
  // question 53 of the 59 are being asked.
  const confirmedBySheet = {};
  for (const t of batch.timesheets) {
    confirmedBySheet[t.id] = confirmedFromAnswers(t.corrections);
  }
  const premiumSplit = splitPremiumForSheets(batch.timesheets, { confirmedBySheet });

  // SEEING EXACTLY WHAT ONE EMPLOYEE SEES, without waiting for their email.
  //
  // Mánu 2026-08-12: "I want super privileges to be able to test run every
  // employee's time sheet corrections and generated time sheet." The link is the
  // employee's own signed token, so what opens is not an admin rendering of
  // their sheet - it IS their sheet, down to the questions and the figures.
  //
  // SUPER ONLY, AND NOT BECAUSE THE PAGE IS SECRET. That token is a bearer
  // credential: whoever holds it can answer and sign as that person, and this
  // batch already lost one answer to a stray click. So the link is minted only
  // for the one role that could reach everything anyway, and it opens in preview
  // mode - see `?preview=1` and the banner it raises on the far side.
  const canPreview = isSuper(user?.role);

  const rows = batch.timesheets.map((t) => {
    // THE SAME THREE FIGURES THE THREE DOCUMENTS PRINT, computed from the
    // function the documents are built with rather than read off the stored
    // column. Every link on the row carries the total it is about to open, so
    // nobody has to click twice to find out which one they wanted.
    const split = splitPremium(t.data?.days || [], { confirmed: confirmedBySheet[t.id] });
    const progress = progressFor(t);
    return {
    id: t.id,
    sourceName: t.sourceName,
    // null for everyone but SUPER, so the token never reaches a page that is
    // not entitled to it
    previewToken: canPreview ? signTimesheetToken(t.id) : null,
    matchMethod: t.matchMethod,
    confidence: t.data?.confidence ?? null,
    suggestions: (t.data?.suggestions || []).map((s) => ({
      ...candidates.find((c) => c.id === s.id),
      confidence: s.confidence,
    })).filter((s) => s.id),
    user: t.user
      ? {
        id: t.user.id, displayName: preferredName(t.user),
        email: t.user.email, phone: t.user.phone || null, image: t.user.image,
      }
      : null,
    rawHours: t.rawHours,
    paidHours: t.paidHours,
    otHours: t.otHours,
    doubleHours: t.doubleHours,
    premiumHours: t.premiumHours,
    // projected = every fault charged, which is the sheet that goes out, and
    // now the only figure a row quotes.
    //
    // `premiumAssumed` and `premiumCorrected` were both here and both went on
    // 2026-08-12 - the first with the `assumed` render basis, the second with
    // the "as corrected" link. Each was read by exactly one thing, a preview-PDF
    // link, and the column is two documents now: the projected sheet and the
    // signed one. See the note on `SheetLinks`.
    premiumProjected: split.projected,
    partialWeek: t.partialWeek,
    // a lunch that HAPPENED but started after the fifth hour still owes a
    // premium, and it reads as an error to anyone who remembers taking it.
    // worth naming on the row rather than only inside the sheet.
    mealLateDays: (t.data?.days || []).filter((d) => d.mealLate).length,
    // a day the schedule has and the timesheet does not - it pays nothing, so
    // it is the one row state worth spotting from the list
    missingDays: (t.data?.scheduleCheck?.flagged || [])
      .filter((f) => f.flag === "missing-from-timesheet").length,
    // the unsigned sheet is rendered on demand from `data`, so there is no
    // stored file to look for - renderOk is what says it can be built at all,
    // and it is set by a real render at upload rather than assumed.
    hasPdf: t.renderOk !== false && (t.data?.days || []).length > 0,
    sentAt: t.sentAt ? t.sentAt.toISOString() : null,
    sentToEmail: t.sentToEmail,
    intendedEmail: t.intendedEmail,
    signedAt: t.signedAt ? t.signedAt.toISOString() : null,
    approvedAt: t.approvedAt ? t.approvedAt.toISOString() : null,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    // ONLY the open ones. The query now also returns the `q_` answers, and
    // counting those here would have marked all 59 as having reported a problem
    // the moment anybody confirmed anything.
    disputed: t.corrections.some((c) => c.status === "open"),
    // the five pre-signing questions: how many this person has been asked, how
    // many are answered, and how many they answered AGAINST us. A decline is
    // the one that moves a figure back, so it is the one payroll must see.
    // COUNTED PER QUESTION, not per kind - see answerProgress. Counting kinds
    // read "waiting on 1 of 2" for ever on anybody whose kind covers more than
    // one question, which is now most of the batch.
    questionsAsked: progress.asked,
    questionsAnswered: progress.answered,
    questionsDeclined: progress.declined,
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
    // what the two source documents say about this one person, so the row can
    // link straight to the page its figures were read off
    docs: {
      sourcePages: t.data?.sourcePages || [],
      schedulePages: t.data?.schedulePages || [],
      days: (t.data?.days || []).length,
      // QSP's own figure, before any of our corrections - it is what is
      // actually printed on the page the link opens
      clockHours: (Math.round((t.rawHours || 0) * 100) / 100).toFixed(2),
      rosteredDays: Object.keys(t.data?.scheduleCheck?.byDate || {}).length,
      missingDays: (t.data?.scheduleCheck?.flagged || [])
        .filter((f) => f.flag === "missing-from-timesheet").length,
      punchIssues: (t.data?.punchIssues || []).length,
    },
    };
  });

  // how many of the source exports this period was uploaded with. tells you at
  // a glance whether a batch is missing a document it should have had.
  const sourceDocs = [
    batch.sourceUrl, batch.scheduleUrl, batch.clockUrl, batch.payrollUrl, batch.restsUrl,
  ].filter(Boolean).length;
  // pinned to Pacific rather than the server's zone. this renders on the
  // server, so without a fixed zone it reads "Aug 6" on a dev box in
  // California and "Aug 7" on Vercel, which runs UTC - the same upload,
  // two dates, depending where the page was rendered. Payroll is in
  // California, so California is the answer that means something.
  const uploadedOn = companyDate(batch.createdAt);
  const uploadedByName = batch.uploadedBy ? preferredName(batch.uploadedBy) : null;

  const total = rows.length;
  const matched = rows.filter((r) => r.user).length;
  const unmatched = total - matched;
  const sent = rows.filter((r) => r.sentAt).length;
  const signed = rows.filter((r) => r.signedAt).length;
  // what a reset would destroy, counted from the rows already loaded rather than
  // with a second query - the `q_` rows ARE the answers
  const answersGiven = batch.timesheets.reduce(
    (n, t) => n + t.corrections.filter((c) => String(c.kind || "").startsWith("q_")).length,
    0,
  );
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
  // RETIRED 2026-08-09: this page used to grade the premium total itself, in
  // recorded / corroborated / needs-somebody-to-look, beside a link to the
  // evidence page grading the SAME hours as witnessed / ruled / open. The two
  // reconcile exactly and neither was wrong, but two answers to "how well
  // evidenced is this" sitting inches apart is how the wrong figure ends up in
  // front of David. The evidence page is the one that survived: it separates a
  // document saying so from Mánu deciding, which the older grading could not.
  //
  // Its copy had also outlived its rule. "Recorded by QSP" read "a rest break
  // QSP's own report accounts for, OR A DAY CLOCKED IN AND OUT OF EVERY SHIFT",
  // and a punch has witnessed nothing since 2026-08-06.
  //
  // `premiumSupport` is still WRITTEN on upload and still read by the checks
  // screen, so nothing is deleted from the data - only this second opinion.
  //
  // And since 2026-08-17 the stored premiumHours column is not summed here at
  // all: it falls as people answer, and every figure the premium card quotes
  // now comes from premiumSplit, whose original does not.

  const readyToSend = rows.filter((r) => r.user && r.hasPdf && !r.sentAt && !r.disputed).length;

  // LIVE / NEEDS A DECISION / FINAL, worked out once and read by both the badge
  // and the send gate, so the two can never disagree about whether a period is
  // finished.
  // IS THERE A NEWER UPLOAD OF THIS SAME FORTNIGHT? This page loads one batch,
  // so unlike the list it has to ask. One count, and it decides whether the
  // header claims to be the live copy.
  const newerInPeriod = (await prisma.timesheetBatch.count({
    where: {
      periodFrom: batch.periodFrom,
      periodTo: batch.periodTo,
      // SAME PROGRAM ONLY, the same rule `supersededBy` and `groupByPeriod`
      // already hold. Both payrolls run the same fortnights, so counting across
      // them made a day program upload read as a newer version of the agency's
      // export: SUPERSEDED beats every other state, which took the live batch
      // read-only and hid the lock control on sixty sheets that were out for
      // signature. This count is the page's own - it loads one batch and cannot
      // use the list's helper - which is why the filter had to be added twice.
      program: batch.program,
      createdAt: { gt: batch.createdAt },
    },
  })) > 0;
  const state = batchState(batch, { newerInPeriod });
  const lockedOn = batch.lockedAt
    ? companyDate(batch.lockedAt, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    })
    : null;
  const missingPdf = rows.filter((r) => !r.hasPdf).length;
  const mode = sendModeSummary();

  const sentCount = sp?.sent ? Number(sp.sent) : null;
  const failedCount = sp?.failed ? Number(sp.failed) : null;

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* back to whichever world this batch belongs to - the deep pages are
            shared, the lists never mix */}
        <BackLink href={batch.program === "DP" ? "/portal/admin/day-program" : "/portal/admin/timesheets"}>
          {batch.program === "DP" ? "Back to Day program" : "Back to Timesheets"}
        </BackLink>
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
            href={`/portal/admin/timesheets/${batch.id}/signed`}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Signed timesheets →
          </Link>
          {/* THE PERIOD AS A GRID, for the day program only: they have no Misc
              classification, so a day off reads as a gap and the gap is where
              time off gets recorded. */}
          {batch.program === "DP" && (
            <Link
              href={`/portal/admin/timesheets/${batch.id}/calendar`}
              className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
            >
              Calendar &amp; time off &rarr;
            </Link>
          )}
          {/* CORRECT A FEW PEOPLE WITHOUT REPLACING THE PERIOD. Only on a batch
              that is still the current one: a superseded upload refuses the
              write anyway, and offering the door is worse than not having it. */}
          {state.key !== "superseded" && (
            <Link
              href={`/portal/admin/timesheets/new?into=${batch.id}`}
              className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
            >
              Re-upload some people →
            </Link>
          )}
          <Link
            href={`/portal/admin/timesheets/${batch.id}/stats`}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Insights &amp; stats →
          </Link>
          <Link
            href={`/portal/admin/timesheets/patterns?program=${batch.program || "MLS"}`}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Repeat patterns →
          </Link>
        </span>
      </div>

      {/* the period names itself before anything else on the page. it used to
          sit below the download card, so the first thing you read was a row of
          buttons and the first thing you could NAME was three inches down. */}
      <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-brand-dark">Pay period</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {batch.periodFrom} to {batch.periodTo}
        </h1>
        <ProgramBadge batch={batch} />
        <LiveBadge batch={batch} />
        <VersionBadge newerInPeriod={newerInPeriod} />
        {/* BESIDE the state, never instead of it - a rehearsal batch is still
            live or final or superseded, and both facts matter. The address is
            shown in full here: this is the page somebody is on when they decide
            to send, and "where does it go" is the question at that moment. */}
        <TestBatchBadge batch={batch} />
      </div>
      {/* WHAT IS ACTUALLY IN, rather than a number to trust. This is the screen
          where the answer decides whether sixty people get emailed. */}
      <div className={`mt-4 rounded-xl border border-border bg-surface p-4 border-l-4 ${state.edge}`}>
        <p className="text-sm text-muted">
          {state.key === "live" ? (
            <>
              The export reaches <span className="font-semibold text-foreground">{state.reach}</span>, and
              the period runs to <span className="font-semibold text-foreground">{batch.periodTo}</span>.
              {state.daysToCome ? ` ${state.daysToCome} day${state.daysToCome === 1 ? "" : "s"} still to come.` : ""}
            </>
          ) : state.key === "superseded" ? (
            <>
              A later upload of this pay period exists, and that one is the live copy.
              This is kept as the record of what the export said at the time.
            </>
          ) : state.key === "needs-decision" ? (
            <>The whole period is in the export, up to <span className="font-semibold text-foreground">{state.reach}</span>.</>
          ) : (
            <>Closed. Every day of the period is in and somebody has marked it final.</>
          )}
        </p>
        <PeriodStrip batch={batch} />
        {/* nothing to decide about a replaced export - the question belongs to
            whichever upload is current */}
        {state.key !== "superseded" && (
          <LockPeriod
            batchId={batch.id}
            locked={!!batch.lockedAt}
            lockedByName={batch.lockedByName}
            lockedAt={lockedOn}
            covered={state.covered}
          />
        )}
      </div>
      {/* two runs of the same dates are indistinguishable without this, and
          nothing else on the page says when the export was pulled. */}
      <p className="mt-2 text-sm text-muted">
        Uploaded <span className="text-foreground">{uploadedOn}</span>
        {uploadedByName && (
          <>
            {" by "}
            <span className="text-foreground">{uploadedByName}</span>
          </>
        )}
        {sourceDocs > 0 && ` · ${sourceDocs} source document${sourceDocs === 1 ? "" : "s"}`}
      </p>

      {/* THE TESTING ROW, up with the batch's own numbers rather than buried in
          the downloads card three screens down - which is where this sat first,
          and Mánu could not find it: "I don't see the test button."

          Its neighbours matter. Next to Delete it read as another way to throw
          the batch away; up here, beside the counts it is about to change, it
          reads as what it is. SUPER only, same gate as the preview links. */}
      {canPreview && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border-strong bg-surface-2 px-3 py-2">
          <p className="text-xs text-muted">
            <b className="text-foreground">Testing.</b> Answer as anyone from
            their row below, then put every question back with this.
          </p>
          <ResetAnswersButton
            batchId={batch.id}
            answers={answersGiven}
            signed={signed}
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Stat label="employees" value={total} />
        <Stat label="matched" value={matched} tone={unmatched ? "warn" : "ok"} />
        <Stat label="sent" value={sent} />
        <Stat label="signed" value={signed} tone={signed === total && total > 0 ? "ok" : undefined} />
        <Stat label="approved" value={approved} tone={approved === signed && signed > 0 ? "ok" : undefined} />
      </div>

      <SendModeBanner mode={mode} />

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

      {(punchDays > 0 || batch.program === "DP") && (
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
            ) : punchDays > 0 ? (
              <span className="block">
                {`Every one of the ${punchDays} flagged ${punchDays === 1 ? "day" : "days"} either has a repair the schedule confirms, or pays the same whichever way it is read.`}
              </span>
            ) : (
              <span className="block">
                No punch problems were found. The rest-break findings
                {batch.dpAudit?.faults?.length
                  ? ` and the ${batch.dpAudit.faults.length} rows the rest break audit flagged`
                  : ""}
                {" "}are on the checks screen.
              </span>
            )}
            {punchDays > 0 && (
              <span className="mt-1 block">
                {`${punchDays} ${punchDays === 1 ? "day is" : "days are"} flagged in total, across ${punchIssueRows} ${punchIssueRows === 1 ? "person" : "people"} - a clock-out before the clock-in, or a stretch of 10+ hours that is almost certainly a rest break with the wrong AM/PM on it. Most are repairable or already corroborated.`}
              </span>
            )}
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

      {/* the thing management actually has to sign. this card no longer grades
          the total itself - see the RETIRED note above readyToSend. it points
          at the one screen that does. */}
      {/* gated on the ORIGINAL figure, not the stored premiumHours column -
          the stored column falls as people answer, and a card that vanishes
          while the original says hours stand would be the old leak wearing a
          different face. */}
      {premiumSplit.originalProjected > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-5">
          <p className="text-sm font-semibold text-foreground">
            Premium hours, by what stands behind them
          </p>
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
              className="shrink-0 rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
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
              className="shrink-0 rounded-md border border-border-strong px-4 py-2 text-sm font-semibold transition hover:bg-surface-3"
            >
              View the breakdown →
            </Link>
          </div>
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
          {missingPdf === 1 ? "timesheet" : "timesheets"} could not be BUILT when
          this batch was uploaded, so {missingPdf === 1 ? "it" : "they"} can&apos;t
          be sent. Sheets are generated on demand rather than stored, so this is
          a problem producing the document, not saving it - most often the layout
          running out of room on somebody&apos;s longest sheet. The reason was
          logged at upload time. Once the render is fixed the sheet builds
          normally; re-uploading the export also clears it.
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
        // SHUT UNTIL SOMEBODY SAYS THE PERIOD IS FINISHED. Not until the data
        // looks finished - the schedule locks at 8pm on the last day and no
        // export records it, so a full period is still only a precondition.
        blocked={state.key !== "final"}
        blockedWhy={
          state.key === "live"
            ? `Cannot send until the pay period comes to an end. The export reaches ${state.reach}, the period runs to ${batch.periodTo}.`
            : state.key === "superseded"
              ? "A later upload of this pay period exists. Send from that one."
              : "The whole period is in, but nobody has said the schedule is locked yet."
        }
      />

      <ReviewTable
        rows={rows}
        candidates={candidates}
        batchId={batch.id}
        assign={assignTimesheet}
        clear={clearTimesheetAssignment}
        send={sendTimesheets}
        hasSource={!!batch.sourceUrl}
        hasSchedule={!!batch.scheduleUrl}
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

// `Evidenced`, the three-column grading that used to sit on this page, was
// removed 2026-08-09 along with the panel it filled. The evidence page grades
// the same hours and is the only place that should.
