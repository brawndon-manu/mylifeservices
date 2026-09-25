import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { logFileOpen, logFileDenied } from "@/lib/file-log";
import { accessLabel } from "@/lib/access-labels";
import { readFilters, submissionWhere } from "../../query";
import { buildSignedFormsZip, slugify, zipResponse } from "../../zip";

// one form's signed documents, one PDF per person. honors the same filters as
// the record page.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) {
    await logFileDenied({ user, pathname: `form-records/${id}/signed-zip`, req, label: "Signed forms · zip" });
    return new NextResponse("Not found", { status: 404 });
  }

  const form = await prisma.form.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!form) return new NextResponse("Not found", { status: 404 });

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const filters = { ...readFilters(sp), form: form.id };
  const submissions = await prisma.formSubmission.findMany({
    where: submissionWhere(filters),
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { name: true, preferredFirstName: true, preferredLastName: true, email: true },
      },
    },
  });

  const buf = await buildSignedFormsZip([{ formTitle: form.title, submissions }]);
  if (!buf) return new NextResponse("No submissions match", { status: 404 });
  await logFileOpen({ user, pathname: `form-records/${id}/signed-zip`, req, label: accessLabel("Signed forms", form.title, "zip") });

  const suffix = filters.office ? `-${filters.office.toLowerCase()}` : "";
  return zipResponse(buf, `signed-${slugify(form.title, "form")}${suffix}`);
}
