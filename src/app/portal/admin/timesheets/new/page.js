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
    "That export contains days that haven't happened yet. QSP prints scheduled shifts exactly like worked ones, so those would become timesheets asking people to sign for time they haven't worked. Pull the period again once it has ended.",
  twoperiods:
    "That export covers more than one pay period, so every employee appears twice. QSP snaps to whole pay periods - asking for a range that crosses a boundary returns both of them. Request a single period.",
  empty: "No employee hours found in that file. Is it the right export?",
  noschedule:
    "The Employee Schedules export is required. It's what corroborates the days nobody clocked, and without it those premium hours have nothing behind them at all.",
  noclock:
    "The QSClock Time and Attendance export is required. It's the only file that separates a punch someone clocked from one typed in afterwards, which is what decides whether a premium can be signed off.",
  norests:
    "The Rest Periods Report is required. It's QSP's own record of which rest breaks were taken, and rest premiums are the bigger half of the total. Without it they're inferred from gaps between punches, which can't tell a break from travel between clients.",
  restparse:
    "Couldn't read that as the QSP Rest Periods Report. It needs to be the .xls straight from Reports → Rest Periods Report.",
  clockparse:
    "Couldn't read that as the QSClock Time and Attendance report. It needs to be the .xls straight from Scheduling → Reports → Shift Audit, not a re-saved copy.",
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
            <Step name="Simple Timesheet" path="Reports → Timesheets" />
            <Step
              name="Employee Schedules"
              path="Scheduling → Reports → Print/Email Schedules"
              note="Report type: Employee, and pick the month the pay period falls in."
            />
            <Step
              name="QSClock Time and Attendance"
              path="Scheduling → Reports → Shift Audit → QSClock Time and Attendance"
            />
            <Step name="Rest Periods Report" path="Reports → Rest Periods Report" />
          </dl>
          <p className="mt-3 text-amber-700 dark:text-amber-400">
            Only pull a period after it has ended. QSP prints shifts that
            haven&apos;t been worked yet exactly like real ones.
          </p>
        </div>
        <div>
          <p className="font-medium text-foreground">What happens on upload</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Each 10-minute rest break becomes <strong>paid</strong> time (QSP leaves it out).</li>
            <li>30-minute meal breaks stay unpaid.</li>
            <li>A missed meal or rest break adds a 1-hour premium under CA Labor Code 226.7.</li>
            <li>Overtime per California rules, Monday-Sunday workweek.</li>
            <li>The four exports together decide which premium hours can be stood behind.</li>
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
function Step({ name, path, note }) {
  return (
    <div>
      <dt className="font-medium text-foreground">{name}</dt>
      <dd className="mt-0.5">
        <span className="inline-block rounded border border-border-strong bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] leading-tight text-foreground">
          {path}
        </span>
        {note && <span className="mt-1 block text-xs text-muted">{note}</span>}
      </dd>
    </div>
  );
}
