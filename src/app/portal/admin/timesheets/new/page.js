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
  empty: "No employee hours found in that file. Is it the right export?",
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

  return (
    <section className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/timesheets">Back to Timesheets</BackLink>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Upload a pay period
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        In QSP, download the <strong>Simple Timesheet</strong> export for the pay
        period - the one big PDF with every employee in it. Drop it here and each
        person&apos;s corrected timesheet is generated automatically.
      </p>

      {error && (
        <div role="alert" className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <p>{error}</p>
          {why && (
            <p className="mt-2 font-mono text-xs opacity-80">Details: {why}</p>
          )}
        </div>
      )}

      <div className="mt-8 rounded-xl border border-border bg-surface p-6 sm:p-8">
        <UploadForm action={uploadBatch} />
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface-2 p-5 text-sm leading-relaxed text-muted">
        <p className="font-medium text-foreground">What happens on upload</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Each 10-minute rest break is counted as <strong>paid</strong> time (QSP leaves it out).</li>
          <li>30-minute meal breaks stay unpaid.</li>
          <li>Missed meal or rest breaks add a 1-hour premium under CA Labor Code 226.7.</li>
          <li>Overtime is applied per California rules on a Monday-Sunday workweek.</li>
          <li>Nothing is emailed yet - you review the name matches first.</li>
        </ul>
      </div>
    </section>
  );
}
