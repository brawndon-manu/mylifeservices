import { redirect } from "next/navigation";
import { hasBlobStorage } from "@/lib/blob";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import { uploadBatch } from "../../timesheets/actions";
import UploadForm from "../../timesheets/new/UploadForm";
import { ERRORS } from "../../timesheets/new/upload-errors";

// THE AUDIT LANE'S OWN DOOR, 2026-09-03. Mánu: "the audit card and the
// timesheets will be its own seperate data so the newer data doesnt override
// the exisiting signed off sheets." Same form component, same action, same
// parsers as the pay-period upload - this page differs in what it asks for
// (six exports, not eight: no payroll report, no rest report) and what the
// upload becomes: a batch flagged auditOnly, living on the Audit page,
// superseding nothing, sending nothing.
export const metadata = { title: "Upload an audit copy", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewAuditCopyPage({ searchParams }) {
  const user = await getCurrentUser();
  // gated like the action it posts to, not like the read-only audit screens
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  const sp = await searchParams;
  const error = sp?.error ? ERRORS[sp.error] || "Something went wrong." : null;
  const why = typeof sp?.why === "string" ? sp.why : null;

  const aside = (
    <div className="rounded-xl border border-border bg-surface-2 p-5 text-sm leading-relaxed text-muted">
      <p className="font-medium text-foreground">What an audit copy is</p>
      <p className="mt-1 text-xs">
        Fresh QSP exports of a pay period, uploaded to be read against the
        service notes and your shift decisions. It appears on the Audit page
        only. Nothing is sent, nothing can be signed, and the pay period&apos;s
        timesheets are not touched.
      </p>
      <p className="mt-4 font-medium text-foreground">The six exports</p>
      <p className="mt-1 text-xs">
        Simple Timesheet (PDF), Employee Schedules (PDF), QSClock Time and
        Attendance (.xls), DSN (Employee Detailed Daily Service Notes) (PDF),
        Employee Service Notes (.xls), Employee Schedule Notes (.xls). A month audit adds a second Simple Timesheet, one export per pay period. The
        payroll and rest period reports are not needed here - they feed the
        payroll surfaces, which an audit copy never reaches.
      </p>
      <p className="mt-4 text-xs">
        Shift decisions and billable adjustments already made for the period
        carry over on their own: they are keyed to the shift, not the upload.
      </p>
    </div>
  );

  return (
    <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/audit">Back to Audit</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Audit</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Upload an audit copy
      </h1>

      {error && (
        <div role="alert" className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <p>{error}</p>
          {why && (
            <p className="mt-2 font-mono text-xs opacity-80">Details: {why}</p>
          )}
        </div>
      )}

      <div className="mt-8">
        <UploadForm action={uploadBatch} aside={aside} blobUpload={hasBlobStorage()} audit />
      </div>
    </section>
  );
}
