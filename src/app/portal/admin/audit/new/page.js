import { redirect } from "next/navigation";
import { hasBlobStorage } from "@/lib/blob";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import AuditWorkspace from "../AuditWorkspace";
import styles from "../audit.module.css";
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
    <details className={styles.uploadGuide}>
      <summary>Which exports do I need?</summary>
      <p>Simple Timesheet (PDF), Employee Schedules (PDF), QSClock Time and Attendance (.xls), DSN (PDF), Employee Service Notes (.xls), and Employee Schedule Notes (.xls). A full month can include a second Simple Timesheet for its other pay period.</p>
      <p>An audit copy keeps payroll and signed timesheets unchanged. Existing shift decisions and corrected billable hours carry over.</p>
    </details>
  );

  return (
    <AuditWorkspace page="new">
      <header className={styles.heading}><div><h1>New audit copy</h1><p className={styles.subtitle}>Bring the records together for one pay period or month.</p></div></header>
      {error && (
        <div role="alert" className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <p>{error}</p>
          {why && (
            <p className="mt-2 font-mono text-xs opacity-80">Details: {why}</p>
          )}
        </div>
      )}

      <div className={styles.upload}>
        <UploadForm action={uploadBatch} aside={aside} blobUpload={hasBlobStorage()} audit />
      </div>
    </AuditWorkspace>
  );
}
