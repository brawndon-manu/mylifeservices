import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { companyDate } from "@/lib/company-time";
import { printedDate } from "@/lib/certificates/render";
import BackLink from "@/components/BackLink";
import PlacementEditor from "./PlacementEditor";
import { regenerateCertificateBatch } from "../../actions";

export const metadata = { title: "Certificates", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CertificatePlacementPage({ params }) {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) redirect("/portal");
  const { id } = await params;

  const batch = await prisma.certificateBatch.findUnique({
    where: { id },
    select: {
      id: true, title: true, templateUrl: true, issuedOn: true,
      page: true, x: true, y: true, size: true, align: true, face: true, color: true,
      datePage: true, dateX: true, dateY: true, dateSize: true, dateAlign: true,
      _count: { select: { certificates: true } },
      // THE SAMPLE IS A REAL ONE. Drawing "Sample Name" would show a width
      // nobody is getting; the first name in the batch is the length that has
      // to fit.
      certificates: {
        orderBy: { printedName: "asc" },
        take: 1,
        select: { printedName: true, issuedOn: true },
      },
    },
  });
  if (!batch) notFound();

  const first = batch.certificates[0] || null;
  const { certificates, _count, ...placement } = batch;

  return (
    <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <BackLink href={`/portal/admin/forms/certificates/${batch.id}`}>Back to {batch.title}</BackLink>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
        Where the name goes
      </h1>
      <p className="mt-3 text-sm text-muted">
        {batch.title} · {_count.certificates}{" "}
        {_count.certificates === 1 ? "certificate" : "certificates"} to redraw
      </p>

      <PlacementEditor
        batch={{ ...placement, count: _count.certificates }}
        sample={first?.printedName || "Sample Name"}
        dateSample={printedDate(first?.issuedOn || batch.issuedOn) || companyDate(new Date())}
        action={regenerateCertificateBatch}
      />
    </section>
  );
}
