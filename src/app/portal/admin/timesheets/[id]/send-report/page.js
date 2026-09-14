import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import SendReport from "./SendReport";
import { payrollBundlePreview, sendPayrollBundle } from "./actions";

export const metadata = { title: "Send payroll reports", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SendReportPage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  const { id } = await params;

  const preview = await payrollBundlePreview(id);
  if (!preview.ok) notFound();

  return (
    <section className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
      <BackLink href={`/portal/admin/timesheets/${id}`}>Back to the pay period</BackLink>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
        Send the payroll reports
      </h1>
      <p className="mt-3 text-sm text-muted">
        {preview.program === "DP" ? "Day Program" : "Agency"} · {preview.periodFrom} to {preview.periodTo}
        {preview.locked ? " · closed" : " · not closed"}
      </p>
      <SendReport batchId={id} preview={preview} action={sendPayrollBundle} />
    </section>
  );
}
