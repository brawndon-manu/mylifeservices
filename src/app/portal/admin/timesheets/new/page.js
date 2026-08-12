import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import { uploadBatch } from "../actions";
import UploadForm from "./UploadForm";

export const metadata = { title: "Upload timesheets", robots: { index: false, follow: false } };

const ERRORS = {
  nofile: "Pick the QSP export PDF first.",
  notpdf: "That needs to be the PDF export from QSP.",
  parse: "Couldn't read that PDF. Make sure it's the Simple Timesheet export, not a scan.",
  future:
    "That export contains days that haven't happened yet. QSP prints scheduled shifts exactly like worked ones, so those would become timesheets asking people to sign for time they haven't worked. Pull the period again once it has ended - or tick \"partial pay period\" below to drop the unworked days and keep what has been worked.",
  twoperiods:
    "That export covers more than one pay period, so every employee appears twice. QSP snaps to whole pay periods - asking for a range that crosses a boundary returns both of them. Request a single period.",
  empty: "No employee hours found in that file. Is it the right export?",
  range: "That date range doesn't work: the start is after the end.",
  punches:
    "The punch times in that timesheet don't add up to QSP's own totals printed beside them, which almost always means it's a print-to-PDF rather than the download. Printing merges two times into a single cell, so everything after the first punch of each pair never reaches us. The file itself is fine and complete - that's the problem, because every employee, every row and every daily total still look right, and the premium hours come out wrong anyway. Pull it again from Reports → Timesheets and save the download rather than printing. It's the SMALLER file, around 920KB against 4.9MB. Nothing was created.",
  noschedule:
    "The Employee Schedules export is required. It's what corroborates the days nobody clocked, and without it those premium hours have nothing behind them at all.",
  schedule:
    "That schedule export covers almost nobody on the timesheet. QSP can produce a single-employee schedule that looks like the full one - the 59-person export is around 479KB and a one-person export around 184KB, and the file names are identical. Re-export it from Scheduling with every employee selected. No batch and no timesheets were created, so nothing is on the list to clean up; the four files you picked were already stored, which is harmless. Without a schedule, meal periods can't be evidenced for the people it misses, and the premium total would come out far too low rather than obviously wrong.",
  norests:
    "The Rest Periods Report is required. It's the only thing that records whether a rest break was actually taken, and rest premiums are the bigger half of the total. Without it every qualifying day comes back unanswerable.",
  restparse:
    "Couldn't read that as the QSP Rest Periods Report. It needs to be the .xls straight from Reports → Rest Periods Report.",
  nopayroll:
    "The Simple Payroll Processing Report is required. It carries QSP's own regular and overtime totals per person, which is the only way to check the corrected sheets against what payroll already produced.",
  payrollparse:
    "Couldn't read that as the QSP Simple Payroll Processing Report. It needs to be the .xls straight from Reports → Payroll Reports → Simple Payroll Processing Report, not a re-saved copy.",
  noblob:
    "File storage isn't configured (BLOB_READ_WRITE_TOKEN is missing), so the generated timesheets couldn't be saved. Nothing was created.",
  blob:
    "File storage rejected the upload - the Blob token is probably expired. Run `vercel env pull .env.local` to refresh it, then try again. Nothing was created.",
};

export default async function NewTimesheetBatchPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  const sp = await searchParams;
  const error = sp?.error ? ERRORS[sp.error] || "Something went wrong." : null;
  const why = typeof sp?.why === "string" ? sp.why : null;

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
        Four exports from QSP. Every corrected timesheet is generated from them.
      </p>

      {error && (
        <div role="alert" className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <p>{error}</p>
          {why && (
            <p className="mt-2 font-mono text-xs opacity-80">Details: {why}</p>
          )}
        </div>
      )}

      <div className="mt-8">
        <UploadForm action={uploadBatch} aside={aside} />
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
