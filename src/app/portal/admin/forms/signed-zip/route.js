import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { logFileOpen, logFileDenied } from "@/lib/file-log";
import { accessLabel } from "@/lib/access-labels";
import { officeFromSearch } from "@/lib/positions";
import { buildSignedFormsZip, zipResponse } from "../zip";

// every signed document on file as its own PDF, a folder per form
export const dynamic = "force-dynamic";

const userSelect = {
  select: { name: true, preferredFirstName: true, preferredLastName: true, email: true },
};

export async function GET(req) {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) {
    await logFileDenied({ user, pathname: "form-records/signed-zip", req, label: "Signed forms · every form · zip" });
    return new NextResponse("Not found", { status: 404 });
  }
  const office = officeFromSearch(Object.fromEntries(new URL(req.url).searchParams));

  const [forms, submissions] = await Promise.all([
    prisma.form.findMany({
      select: { id: true, title: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    }),
    prisma.formSubmission.findMany({
      where: office ? { user: { offices: { has: office } } } : {},
      orderBy: { createdAt: "desc" },
      include: { user: userSelect },
    }),
  ]);

  const groups = forms
    .map((f) => ({
      folder: f.title,
      formTitle: f.title,
      submissions: submissions.filter((s) => s.formId === f.id),
    }))
    .filter((g) => g.submissions.length);

  const buf = await buildSignedFormsZip(groups);
  if (!buf) return new NextResponse("No submissions on file", { status: 404 });
  await logFileOpen({ user, pathname: "form-records/signed-zip", req, label: accessLabel("Signed forms", "every form", "zip") });

  const suffix = office ? `-${office.toLowerCase()}` : "";
  return zipResponse(buf, `signed-forms${suffix}`);
}
