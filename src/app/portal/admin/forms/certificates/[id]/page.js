import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { companyDate } from "@/lib/company-time";
import { printedDate } from "@/lib/certificates/render";
import BackLink from "@/components/BackLink";
import DeleteBatch from "./DeleteBatch";
import { deleteCertificateBatch } from "../actions";

export const metadata = { title: "Certificates", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CertificateBatchPage({ params }) {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) redirect("/portal");
  const { id } = await params;

  const batch = await prisma.certificateBatch.findUnique({
    where: { id },
    select: {
      id: true, title: true, issuedOn: true, createdAt: true, templateName: true, runId: true,
      certificates: {
        orderBy: { printedName: "asc" },
        select: {
          id: true, printedName: true, issuedOn: true, pdfUrl: true, createdAt: true,
          user: { select: { name: true, preferredFirstName: true, preferredLastName: true, deactivatedAt: true } },
        },
      },
    },
  });
  if (!batch) notFound();

  const offRoll = batch.certificates.filter((c) => !c.user).length;

  return (
    <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/portal/admin/forms/certificates">Back to Certificates</BackLink>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/portal/admin/forms/certificates/${batch.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Download all as one PDF
          </a>
          {batch.runId && (
            <a
              href={`/portal/admin/forms/certificates/run/${batch.runId}/zip`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
            >
              Download the whole run
            </a>
          )}
          <a
            href={`/portal/admin/forms/certificates/${batch.id}/zip`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Download separate files
          </a>
        </div>
      </div>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{batch.title}</h1>
      <p className="mt-3 text-sm text-muted">
        {batch.certificates.length} issued
        {batch.issuedOn ? ` · dated ${printedDate(batch.issuedOn)}` : ""}
        {` · made ${companyDate(batch.createdAt)}`}
        {batch.templateName ? ` · from ${batch.templateName}` : ""}
      </p>
      {offRoll > 0 && (
        <p className="mt-2 text-sm text-muted">
          {offRoll} {offRoll === 1 ? "was" : "were"} typed in rather than picked from the
          directory, so {offRoll === 1 ? "it is" : "they are"} recorded by name only.
        </p>
      )}

      <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
        {batch.certificates.map((c) => (
          <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 px-5 py-3 text-sm">
            <span className="font-medium text-foreground">{c.printedName}</span>
            {c.issuedOn && <span className="text-xs text-muted">{printedDate(c.issuedOn)}</span>}
            {c.user && preferredName(c.user) !== c.printedName && (
              <span className="text-xs text-muted">{preferredName(c.user)}</span>
            )}
            {!c.user && <span className="text-xs text-muted">not in the directory</span>}
            {c.user?.deactivatedAt && <span className="text-xs text-muted">no longer here</span>}
            <a
              href={c.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto font-semibold text-brand hover:underline"
            >
              Open
            </a>
          </li>
        ))}
      </ul>

      <DeleteBatch batchId={batch.id} title={batch.title} count={batch.certificates.length} action={deleteCertificateBatch} />
    </section>
  );
}
