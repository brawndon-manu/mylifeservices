import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { companyDate } from "@/lib/company-time";
import { printedDate } from "@/lib/certificates/render";
import BackLink from "@/components/BackLink";
import CertificateBuilder from "./CertificateBuilder";
import { createCertificates } from "./actions";

export const metadata = { title: "Certificates", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CertificatesPage() {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) redirect("/portal");

  const [people, batches] = await Promise.all([
    // EVERYBODY, INCLUDING PEOPLE WHO HAVE LEFT - a certificate can be reissued
    // for a course somebody took while they were here.
    prisma.user.findMany({
      select: {
        id: true, name: true, preferredFirstName: true, preferredLastName: true, deactivatedAt: true,
      },
      orderBy: [{ name: "asc" }],
    }),
    prisma.certificateBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true, title: true, issuedOn: true, createdAt: true,
        _count: { select: { certificates: true } },
      },
    }),
  ]);

  const candidates = people.map((u) => ({
    id: u.id,
    // the document's name, and the one the list is searched by
    legalName: u.name,
    displayName: preferredName(u),
    gone: !!u.deactivatedAt,
  }));

  return (
    <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/forms">Back to Form submissions</BackLink>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">Certificates</h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        Upload a blank certificate, click where the name belongs, and pick who gets
        one. Every certificate is kept against the person it went to.
      </p>

      <CertificateBuilder candidates={candidates} action={createCertificates} />

      {batches.length > 0 && (
        <div className="mt-12">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Made before</h2>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
            {batches.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/portal/admin/forms/certificates/${b.id}`}
                  className="flex flex-wrap items-baseline gap-x-3 px-5 py-3 text-sm transition hover:bg-surface-2"
                >
                  <span className="font-medium text-foreground">{b.title}</span>
                  <span className="text-muted">
                    {b._count.certificates} {b._count.certificates === 1 ? "certificate" : "certificates"}
                  </span>
                  <span className="ml-auto text-xs tabular-nums text-muted">
                    {printedDate(b.issuedOn) || companyDate(b.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
