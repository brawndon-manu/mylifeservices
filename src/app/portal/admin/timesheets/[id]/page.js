import BatchViews from "../_components/BatchViews";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { portalNameBeside } from "@/lib/timesheet/display-name";
import { sendModeSummary } from "@/lib/timesheet-send";
import { describePunchIssue, scheduledPaidHours } from "@/lib/timesheet/anomalies";
import { buildQuestions, answerProgress } from "@/lib/timesheet/questions";
import {
  splitPremium,
  splitPremiumForSheets,
  confirmedFromAnswers,
} from "@/lib/timesheet/premium-split";
import BackLink from "@/components/BackLink";
import BatchOverview from "../_components/BatchOverview";
import { employeeCardPay } from "@/lib/timesheet/employee-card-pay";
import { batchWorkTotals, batchPeriodLabels } from "@/lib/timesheet/batch-overview";
import { reviewerSettledDates } from "@/lib/timesheet/corrections";
import ReviewTable from "../_components/ReviewTable";
import { signTimesheetToken } from "@/lib/timesheet-token";
import { isSuper } from "@/lib/roles";
import SendPanel from "../_components/SendPanel";
import RecomputeBatchButton from "../_components/RecomputeBatchButton";
import { batchState } from "@/lib/timesheet/batch-state";
import { supersededBy } from "@/lib/timesheet/superseded";
import { assignTimesheet, clearTimesheetAssignment, sendTimesheets } from "../actions";

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
              // salaried and exempt: no premium, no signature, no email. The
              // row reads it so the send count does not promise a message that
              // `sendTimesheets` will refuse to send.
              salariedExempt: true,
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
  // an audit copy has no business on this screen - its home is the Audit page,
  // and the buttons here (Send all first among them) must never see it
  if (batch.auditOnly) redirect(`/portal/admin/audit/${batch.id}`);

  const staff = await prisma.user.findMany({
    // an exempt account (a second login) can never be picked for a sheet
    where: { deactivatedAt: null, timesheetExempt: false },
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
        answers: t.corrections,
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

  const ptoRows = await prisma.ptoEntry.findMany({
    where: { program: batch.program || "MLS", periodFrom: batch.periodFrom, periodTo: batch.periodTo },
    select: { personKey: true, hours: true, kind: true },
  });

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
    // the name they go by, printed lighter beside QSP's spelling where the two
    // differ - see portalNameBeside
    nameBeside: t.user ? portalNameBeside(t.sourceName, preferredName(t.user)) : null,
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
        salariedExempt: t.user.salariedExempt === true,
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
    pay: employeeCardPay(t, ptoRows, split),
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
    // the sheet menu's slice: the hold beside the name, the mileage either
    // side of a removal, and whether a signature would come off with it
    held: !!t.heldAt,
    heldByName: t.heldByName,
    heldReason: t.heldReason,
    miles: t.data?.qspMiles ?? null,
    milesRemoved: t.data?.qspMilesRemoved?.was ?? null,
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
  // EVERY document a batch can carry, not the original five: the three notes
  // exports joined 08-27 and the day program's mileage has been here since it
  // shipped, and none of them were counted - Mánu 2026-09-01, four DP exports
  // uploaded and the header said three.
  const sourceDocs = [
    batch.sourceUrl, batch.scheduleUrl, batch.clockUrl, batch.payrollUrl, batch.restsUrl,
    batch.notesUrl, batch.serviceNotesUrl, batch.scheduleNotesUrl, batch.dpMileageUrl,
  ].filter(Boolean).length;
  const uploadedByName = batch.uploadedBy ? preferredName(batch.uploadedBy) : null;

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

  // THE SAME SET `sendTimesheets` WILL ACTUALLY SEND (Mánu 2026-09-09). This
  // number is not decoration: it gates the send button, labels it, and fills the
  // confirm dialog that says how many real people are about to be emailed, so a
  // count that disagrees with the action is a count that misstates a live send.
  // It disagreed twice. A FUZZY match is refused by the send - see
  // match-confirm.js, "Lines, Megan" in Megan McAlpine's inbox - and this
  // counted it anyway: 50 such rows across 28 of the 48 batches, so every send
  // he has run promised more than it did. And a REPORTED sheet was excluded
  // here while the send stopped skipping it on 2026-09-09, which would have
  // understated the next one. `renderOk` is a non-null Boolean, so `hasPdf`
  // already matches the send's own `renderOk: true`.
  const readyToSend = rows.filter(
    (r) => r.user && !r.user.salariedExempt && r.hasPdf && !r.sentAt && r.matchMethod !== "fuzzy",
  ).length;

  // LIVE / NEEDS A DECISION / FINAL, worked out once and read by both the badge
  // and the send gate, so the two can never disagree about whether a period is
  // finished.
  // IS THERE A NEWER UPLOAD OF THIS SAME FORTNIGHT? This page loads one batch,
  // so unlike the list it has to ask. One count, and it decides whether the
  // header claims to be the live copy.
  // ONE RULE, ASKED OF THE PLACE THAT OWNS IT. This was the page's own count and
  // it had to be taught the rule a filter at a time: first the program, because
  // the day program's fortnight read as a newer version of ILS's, and then
  // 2026-09-16 the audit flag, because it never knew about that one at all.
  //
  // Mánu: "why does it say superseded if this is the latest version". His 3:45am
  // ILS export was the live batch and his 3:52am AUDIT copy was seven minutes
  // newer, so the count found 1 and the header called the live batch replaced -
  // which hides the send control and takes the whole period read-only. Two live
  // payroll batches were mislabelled at the time, the current fortnight and
  // 08/16-08/31.
  //
  // `supersededBy` has held both halves of the rule since it was written: same
  // program, same KIND, and a monthly period match for audit copies. A third
  // copy of a rule is a third chance to be one filter short, so the page asks it
  // instead of counting for itself.
  const newerInPeriod = !!(await supersededBy(batch.id));
  const state = batchState(batch, { newerInPeriod });
  const missingPdf = rows.filter((r) => !r.hasPdf).length;
  const mode = sendModeSummary();

  const workTotals = batchWorkTotals(batch.timesheets, ptoRows);
  // The overview counts the questions currently shown to employees, including
  // their editable Misc answers. A payroll classification alone settles a day.
  const waiting = batch.timesheets.filter((t) => !answerProgress(
    buildQuestions(t.data, {
      restRows: batch.restsByDate || [], sourceName: t.sourceName,
      reviewerSettled: reviewerSettledDates(t.overrides),
      answers: t.corrections,
    }), t.corrections,
  ).settled).length;

  // WHY THE SEND IS SHUT, WRITTEN ONCE. Three things read it now: the panel's
  // amber block, the per-row button's confirm, and the banner a server refusal
  // comes back with. Three copies of it would be three chances to drift.
  const sendBlocked = state.key !== "final";
  const blockedWhy =
    state.key === "live"
      ? `Cannot send until the pay period comes to an end. The export reaches ${state.reach}, the period runs to ${batch.periodTo}.`
      : state.key === "superseded"
        ? "A later upload of this pay period exists. Send from that one."
        : "The whole period is in, but nobody has said the schedule is locked yet.";

  const sentCount = sp?.sent ? Number(sp.sent) : null;
  const failedCount = sp?.failed ? Number(sp.failed) : null;
  const unconfirmedCount = sp?.unconfirmed ? Number(sp.unconfirmed) : null;

  return (
    <section className="mx-auto max-w-7xl px-6 py-6 sm:py-8">
      <BackLink href={batch.program === "DP" ? "/portal/admin/day-program" : "/portal/admin/timesheets"}>
        {batch.program === "DP" ? "Back to Day program" : "Back to Timesheets"}
      </BackLink>
      <BatchOverview
        batch={batch} state={state} newerInPeriod={newerInPeriod}
        total={total} sent={sent} signed={signed} approved={approved}
        sourceDocs={sourceDocs} uploadedByName={uploadedByName}
        mode={mode} totals={workTotals} premium={premiumSplit.liveProjected} waiting={waiting}
        sendControl={
          <SendPanel
            batchId={batch.id}
            readyToSend={readyToSend}
            alreadySent={sent}
            send={sendTimesheets}
            live={mode.live}
            // SHUT UNTIL SOMEBODY SAYS THE PERIOD IS FINISHED. Not until the data
            // looks finished - the schedule locks at 8pm on the last day and no
            // export records it, so a full period is still only a precondition.
            // Enforced in `sendTimesheets` as well since 2026-09-09; this prop is the
            // explanation and the override, no longer the rule itself.
            blocked={sendBlocked}
            blockedWhy={blockedWhy}
          />
        }
        actions={<>
          <Link
            href={`/portal/admin/timesheets/${batch.id}/legacy`}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Legacy →
          </Link>
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
              write anyway, and offering the door is worse than not having it.
              EACH PROGRAM'S OWN FORM - this used to send a day program batch
              to the agency's eight-export page, which cannot read the four DP
              reports and had no partial path to write anyway. */}
          {state.key !== "superseded" && (
            <Link
              href={batch.program === "DP"
                ? `/portal/admin/day-program/new?into=${batch.id}`
                : `/portal/admin/timesheets/new?into=${batch.id}`}
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
          <Link
            href={`/portal/admin/timesheets/${batch.id}/attendance`}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            QSClock attendance →
          </Link>
        </>}
      />

      {/* RE-RUN THE ENGINE OVER THE WHOLE PERIOD. Here rather than on Legacy
          because it moves premium hours across every sheet, and this is the
          page somebody is on when that matters. SUPER only, matching the
          refusal the action itself makes - hiding a control the server would
          refuse is the honest pairing. Off a superseded upload entirely, which
          is read only for the same reason the re-upload door is missing there. */}
      {isSuper(user?.role) && state.key !== "superseded" && (
        <div className="mt-4 flex justify-end">
          <RecomputeBatchButton batchId={batch.id} />
        </div>
      )}

      {punchOpenDays > 0 && (
        <div className="mt-4 rounded-lg border-2 border-rose-400 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/40">
          <p className="text-base font-semibold text-rose-900 dark:text-rose-200">
            Check these before you send anything
          </p>
          <p className="mt-1 text-sm text-rose-800 dark:text-rose-200/90">
            <span className="block">
              <strong>{punchOpenDays}</strong>
              {` ${punchOpenDays === 1 ? "day needs" : "days need"} somebody to decide, across ${punchOpenRows} ${punchOpenRows === 1 ? "person" : "people"}. Nothing else can be settled from the records we hold.`}
            </span>
            <span className="mt-1 block">
              {`${punchDays} ${punchDays === 1 ? "day is" : "days are"} flagged in total, across ${punchIssueRows} ${punchIssueRows === 1 ? "person" : "people"}.`}
            </span>
          </p>
          <Link
            href={`/portal/admin/timesheets/${batch.id}/checks`}
            className="mt-3 inline-block rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
          >
            Data checks →
          </Link>
        </div>
      )}

      {disputed > 0 && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>{disputed}</strong>{" "}
          {disputed === 1 ? "person says their timesheet is" : "people say their timesheets are"}{" "}
          wrong. Nothing changes until you decide.{" "}
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
          {unconfirmedCount
            ? ` ${unconfirmedCount} not sent: the match is a guess nobody has confirmed. Pick the person on the row to send.`
            : ""}
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

      {/* THE SERVER REFUSED A SEND. Only reachable when something posted without
          the override - a forged request, or a UI that lost the rule - so it says
          the same sentence the panel says rather than inventing a second one. */}
      {sp?.notfinal && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {blockedWhy}
        </div>
      )}

      {unmatched > 0 && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>{unmatched}</strong>{" "}
          {unmatched === 1 ? "timesheet has" : "timesheets have"}{" "}
          no matched employee yet. Those can&apos;t be sent until you pick who
          they belong to.
        </div>
      )}

      <BatchViews batchId={batch.id} count={rows.length} />

      <ReviewTable
        rows={rows}
        candidates={candidates}
        batchId={batch.id}
        assign={assignTimesheet}
        clear={clearTimesheetAssignment}
        send={sendTimesheets}
        hasSource={!!batch.sourceUrl}
        hasSchedule={!!batch.scheduleUrl}
        periodLabel={`${batchPeriodLabels(batch.periodFrom, batch.periodTo).title} · ${batch.program === "DP" ? "Day Program" : "ILS"}`}
        blocked={sendBlocked}
        blockedWhy={blockedWhy}
      />
    </section>
  );
}

// `Evidenced`, the three-column grading that used to sit on this page, was
// removed 2026-08-09 along with the panel it filled. The evidence page grades
// the same hours and is the only place that should.
