import { redirect } from "next/navigation";
import { hasBlobStorage } from "@/lib/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import { uploadBatch } from "../actions";
import { ERRORS } from "./upload-errors";
import UploadForm from "./UploadForm";
import PresenceProvider from "../[id]/Presence";
import WorkingNow from "../_components/WorkingNow";

export const metadata = { title: "Upload timesheets", robots: { index: false, follow: false } };


export default async function NewTimesheetBatchPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  const sp = await searchParams;
  const error = sp?.error ? ERRORS[sp.error] || "Something went wrong." : null;
  const why = typeof sp?.why === "string" ? sp.why : null;

  // the batch a new upload would land on top of: the most recent one. Only its
  // id and period, because all this drives is a presence poll and a sentence.
  // THE BATCH THIS UPLOAD CORRECTS, when the screen was reached from one.
  // Loaded rather than trusted: the period is printed back so a wrong id is
  // visible before any file is picked, and an id that is gone drops the screen
  // back to being an ordinary upload rather than failing at the write.
  const intoId = typeof sp?.into === "string" ? sp.into : null;
  const into = intoId
    ? await prisma.timesheetBatch.findUnique({
      where: { id: intoId },
      select: { id: true, periodFrom: true, periodTo: true, program: true },
    })
    : null;

  const latest = await prisma.timesheetBatch.findFirst({
    // this screen uploads the AGENCY's export, so the batch it would land on
    // top of is an agency one. Without this a day program upload would make
    // the warning name a period nobody here is working on. Audit copies are
    // not a thing an upload lands on top of either.
    where: { program: "MLS", auditOnly: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, periodFrom: true, periodTo: true },
  });

  // Everything below is built the way the admin dashboard is: a short line of
  // copy, then cards that use the width. That matters at 1280px - a paragraph
  // run full width here is ~140 characters, well past the readable 45-75, and
  // capping it inside the wider box is what made the page look broken before.
  // Short copy in bordered cards sidesteps the problem instead of fighting it.
  const aside = (
    <div className="rounded-xl border border-border bg-surface-2 p-5 text-sm leading-relaxed text-muted">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="font-medium text-foreground">What to pull from QSP</p>
          {/* the exact menu path for each one. this is the only written record
              of how to pull a pay period - without it the job belongs to
              whoever did it last. */}
          <dl className="mt-2 space-y-2.5">
            <Step
              name="Simple Timesheet"
              path="Reports → Timesheets"
              what="Every punch for every employee in the period. All the hours come from here."
            />
            <Step
              name="Employee Schedules"
              path="Scheduling → Reports → Print/Email Schedules"
              what="The month's calendar: who was booked with which client, and when."
              note="Report type: Employee, and pick the month the pay period falls in."
            />
            <Step
              name="Rest Periods Report"
              path="Reports → Rest Periods Report"
              what="One row per rest break taken, with the time it started and ended. The only record that a rest break happened."
              note="An .xls, not a PDF."
            />
            <Step
              name="Simple Payroll Processing Report"
              path="Reports → Payroll Reports → Simple Payroll Processing Report"
              what="One row per employee with QSP's own regular, overtime and double-time totals. What the corrected sheets get checked against."
              note="An .xls, not a PDF."
            />
          </dl>
          <p className="mt-3 text-amber-700 dark:text-amber-400">
            Only pull a period after it has ended. QSP prints shifts that
            haven&apos;t been worked yet exactly like real ones, and it returns
            the whole period whatever range you ask it for. To test one
            mid-period, tick <b>partial pay period</b> and give the range you
            actually wanted - everything outside it is dropped.
          </p>
        </div>
        <div>
          <p className="font-medium text-foreground">What happens on upload</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Rest breaks are already paid in the export, so hours are taken as QSP reports them.</li>
            <li>30-minute meal breaks stay unpaid.</li>
            <li>A missed meal or rest break adds a 1-hour premium under CA Labor Code 226.7.</li>
            <li>Overtime per California rules, Monday-Sunday workweek.</li>
            <li>A break only counts if something recorded it: a meal rostered on the schedule, a rest break in the Rest Periods Report.</li>
            <li>Nothing is emailed yet - you review the name matches first.</li>
          </ul>
        </div>
      </div>
    </div>
  );

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/timesheets">Back to Timesheets</BackLink>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Upload a pay period
      </h1>
      <p className="mt-2 text-base text-muted">
        Eight exports from QSP. Every corrected timesheet is generated from them.
      </p>

      {/* WHO IS MID-JOB ON THE BATCH THIS IS ABOUT TO REPLACE. Uploading while
          somebody is working through the checks changes the screen underneath
          them, and a mark set in that moment is set against findings that are
          being replaced. A warning rather than a block - two people working at
          once is normal, doing it unknowingly is the problem.
          Watch only: standing on the upload screen is not being in the batch,
          and announcing ourselves here would put a face on the very card we are
          asking about. */}
      {latest && (
        <PresenceProvider batchId={latest.id} watchOnly>
          <WorkingNow period={`${latest.periodFrom} to ${latest.periodTo}`} />
        </PresenceProvider>
      )}

      {error && (
        <div role="alert" className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <p>{error}</p>
          {why && (
            <p className="mt-2 font-mono text-xs opacity-80">Details: {why}</p>
          )}
        </div>
      )}

      {/* WHAT A CORRECTION IS ABOUT TO DO, before the files are picked rather
          than after they are processed. The people it will replace are the
          people in the export, which is not visible until it is read - so this
          says the RULE, and the batch page confirms the names afterwards. */}
      {into && (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            Correcting {into.periodFrom} to {into.periodTo}, not creating a new upload.
          </p>
          <p className="mt-1 text-amber-800 dark:text-amber-300">
            Only the people in these exports are replaced. Everyone else keeps their sheet,
            their signature and the link already in their inbox. The people you do replace
            lose their signature and their answers, because their figures are changing, and
            go back out to be signed again.
          </p>
        </div>
      )}

      <div className="mt-8">
        {/* with a blob store the exports go browser-to-Blob and the action
            receives URLs - the only shape that fits under Vercel's 4.5MB
            request cap, and what makes uploading from production possible */}
        <UploadForm action={uploadBatch} aside={aside} into={into?.id || null} blobUpload={hasBlobStorage()} />
      </div>
    </section>
  );
}

// one QSP export and where to find it
function Step({ name, path, what, note }) {
  return (
    <div>
      <dt className="font-medium text-foreground">{name}</dt>
      <dd className="mt-0.5">
        <span className="inline-block rounded border border-border-strong bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] leading-tight text-foreground">
          {path}
        </span>
        {what && <span className="mt-1 block text-xs">{what}</span>}
        {note && <span className="mt-0.5 block text-xs text-faint">{note}</span>}
      </dd>
    </div>
  );
}
