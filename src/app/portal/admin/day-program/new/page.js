import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import { uploadDayProgramBatch } from "../actions";

export const metadata = { title: "Upload day program period", robots: { index: false, follow: false } };

const ERRORS = {
  notimesheet: "Pick the Simple Timesheet PDF first - hours come from it and nothing runs without it.",
  notpdf: "The timesheet needs to be the PDF export from QSP, not a scan or a print-to-PDF.",
  norests: "The Rest Periods Report (.xls) is required - it's the only systematic record that a rest break happened.",
  notxlsx: "The rest break audit needs to be the .xlsx spreadsheet itself, not a re-saved copy.",
  parse: "Couldn't read one of those files. The message below says which reader gave up.",
  empty: "The timesheet read fine but held no employee hours. Is it the right export?",
  noblob:
    "File storage isn't configured (BLOB_READ_WRITE_TOKEN is missing), so nothing could be saved. Nothing was created.",
  blob:
    "File storage rejected the upload - the Blob token is probably expired. Run `vercel env pull .env.local` to refresh it, then try again. Nothing was created.",
  save:
    "The sheets could not be saved. Nothing was created: the batch and all of its sheets go in as one write, so a failure here leaves nothing behind to clean up.",
};

export default async function NewDayProgramBatchPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  const sp = await searchParams;
  const error = sp?.error ? ERRORS[sp.error] || "Something went wrong." : null;
  const why = typeof sp?.why === "string" ? sp.why : null;

  return (
    <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/day-program">Back to Day program</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Admin</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        Upload a day program period
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        The same engine the MLS timesheets run on, fed from the day
        program&apos;s documents. Hours and overtime come from the QSP
        timesheet; rest breaks, second breaks and the staff&apos;s own schedule
        notes come from the Rest Periods report. Meals are exempt under the
        on-duty meal agreement, so no meal premium is ever computed here.
      </p>

      {error && (
        <div className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm leading-relaxed text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          <p>{error}</p>
          {why && <p className="mt-2 font-mono text-xs opacity-80">{why}</p>}
        </div>
      )}

      <form action={uploadDayProgramBatch} className="mt-8 space-y-4">
        <FilePick
          id="timesheet"
          label="Simple Timesheet (.pdf)"
          hint="QSP > Reports > Timesheets. Hours, punches and overtime all come from here."
          accept=".pdf,application/pdf"
          required
        />
        <FilePick
          id="rests"
          label="Rest Periods Report (.xls)"
          hint="The QSP export, or your edited copy with the second break columns filled in - both layouts read. The 2nd breaks and the schedule notes come from here."
          accept=".xls,application/vnd.ms-excel"
          required
        />
        <FilePick
          id="schedule"
          label="Employee Schedules (.pdf) - optional"
          hint="The month's schedule export. Gives every sheet the shift cross-check the MLS batches get."
          accept=".pdf,application/pdf"
        />
        <FilePick
          id="audit"
          label="Rest break audit (.xlsx) - optional"
          hint="David's compliance sheet. Still the only record of the 2nd breaks that live in DSN summaries - without it those days read short."
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        />
        <button
          type="submit"
          className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
        >
          Upload and analyze
        </button>
      </form>
    </section>
  );
}

function FilePick({ id, label, hint, accept, required }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>
      <input
        id={id}
        name={id}
        type="file"
        required={required}
        accept={accept}
        className="mt-3 block w-full text-sm text-muted file:mr-4 file:rounded-md file:border-0 file:bg-brand-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand"
      />
    </div>
  );
}
