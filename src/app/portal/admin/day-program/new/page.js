import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import { uploadDayProgramBatch } from "../actions";
import PartialPick from "./PartialPick";

export const metadata = { title: "Upload day program period", robots: { index: false, follow: false } };

const ERRORS = {
  notimesheet: "Pick the Simple Timesheet PDF first - hours come from it and nothing runs without it.",
  notpdf: "The timesheet needs to be the PDF export from QSP, not a scan or a print-to-PDF.",
  norests: "The Rest Periods Report (.xls) is required - it's the only systematic record that a rest break happened, and the second breaks are read out of its schedule notes.",
  parse: "Couldn't read one of those files. The message below says which reader gave up.",
  mileage:
    "That mileage report was refused, and nothing was created. Miles print on the sheet people sign and attest to, so a file matching nobody - or saying nobody drove all period - is far more likely to be the wrong export than the truth. Check it covers this period, then try again.",
  empty: "The timesheet read fine but held no employee hours. Is it the right export?",
  noblob:
    "File storage isn't configured (BLOB_READ_WRITE_TOKEN is missing), so nothing could be saved. Nothing was created.",
  blob:
    "File storage rejected the upload - the Blob token is probably expired. Run `vercel env pull .env.local` to refresh it, then try again. Nothing was created.",
  save:
    "The sheets could not be saved. Nothing was created: the batch and all of its sheets go in as one write, so a failure here leaves nothing behind to clean up.",
  future:
    "That export contains days that haven't happened yet. QSP prints scheduled shifts exactly like worked ones, so those would become sheets asking people to sign for time they haven't worked. Pull the period again once it has ended - or tick \"partial pay period\" below to drop the unworked days and keep what has been worked.",
  range: "That date range doesn't work: the start is after the end.",
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
        timesheet. Rest breaks come from the Rest Periods report, and the
        second breaks staff type into their own schedule notes are read
        straight off it - no spreadsheet to keep by hand. Miles come from the
        mileage export. Meals are exempt under the on-duty meal agreement, so
        no meal premium is ever computed here.
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
          hint="Straight from QSP. Both layouts read, so an edited copy with second-break columns filled in still works - but you don't need to fill anything in. Rest breaks, the second breaks named in schedule notes, and the reasons staff give all come from here."
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
          id="mileage"
          label="Employee Mileage Tracking Report (.xls) - optional"
          hint="QSP > Reports > Employee Mileage Tracking. The day program has no payroll report to carry a mileage column, so this is the only place miles come from. Leave it out and the sheet says nothing about mileage, rather than printing a 0.00 nobody should have to attest to."
          accept=".xls,application/vnd.ms-excel"
        />
        {/* deliberately last: the upload refuses a file holding days nobody
            has worked, and this is the way past that check, so it should read
            like what it is rather than an ordinary option. */}
        <PartialPick />
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
