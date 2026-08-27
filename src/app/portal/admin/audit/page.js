import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";

export const metadata = { title: "Audit", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");

  // SELECTED WITHOUT `notes`. That column holds every note in the range - 1.4MB
  // for a month - and a list of a year of them would pull seventeen megabytes to
  // print twelve dates. The schema says so beside the field.
  const batches = await prisma.serviceNoteBatch.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, periodFrom: true, periodTo: true, sourceName: true,
      noteCount: true, createdAt: true,
      uploadedBy: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
    },
  });

  return (
    <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin">Back to Admin</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Admin</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Audit</h1>
        <Link
          href="/portal/admin/audit/new"
          className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
        >
          Upload service notes
        </Link>
      </div>

      <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
        What was billed for a shift, against what the clock recorded and what the service note
        documents. The notes come from the QSP Employee Detailed Daily Service Notes export; the
        billed and clocked hours come from the pay periods already uploaded under Timesheets.
      </p>

      {batches.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border-strong bg-surface-2 p-10 text-center">
          <p className="text-sm font-medium text-foreground">No service notes uploaded yet.</p>
          <p className="mt-1 text-sm text-muted">
            Export the Employee Detailed Daily Service Notes report from QSP over the range you
            want to review, then upload it here.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {batches.map((b) => (
            <li key={b.id}>
              <Link
                href={`/portal/admin/audit/${b.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition hover:border-brand"
              >
                <span>
                  <span className="block text-lg font-semibold text-foreground">
                    {b.periodFrom} to {b.periodTo}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {b.noteCount} notes
                    {b.sourceName ? ` · ${b.sourceName}` : ""}
                    {b.uploadedBy ? ` · uploaded by ${preferredName(b.uploadedBy)}` : ""}
                  </span>
                </span>
                <span className="text-sm font-semibold text-brand">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
