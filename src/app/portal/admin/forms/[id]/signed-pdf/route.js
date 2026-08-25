import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { renderSignedFormsBundle } from "@/lib/signed-forms-pdf";
import { readFilters, submissionWhere, submissionRow } from "../../query";
import { fileDate } from "../../../acknowledgments/audit";

// one form's actual signed documents in one file, a divider page before each.
// honors the same filters as the record page.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { id } = await params;
  const form = await prisma.form.findUnique({
    where: { id },
    select: { id: true, title: true, category: true },
  });
  if (!form) return new NextResponse("Not found", { status: 404 });

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const submissions = await prisma.formSubmission.findMany({
    where: submissionWhere({ ...readFilters(sp), form: form.id }),
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          name: true,
          preferredFirstName: true,
          preferredLastName: true,
          email: true,
        },
      },
    },
  });
  if (!submissions.length) {
    return new NextResponse("No submissions match", { status: 404 });
  }

  const items = await Promise.all(
    submissions.map(async (s) => ({
      ...submissionRow(s),
      bytes: await fetch(s.pdfUrl)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null),
    })),
  );

  let bytes;
  try {
    const out = await renderSignedFormsBundle(
      { groups: [{ formTitle: form.title, category: form.category, items }] },
      {
        generatedOn: new Date().toLocaleDateString("en-US", {
          timeZone: "America/Los_Angeles",
        }),
      },
    );
    bytes = out.bytes;
  } catch (e) {
    console.error("signed forms bundle pdf failed:", e);
    return new NextResponse("Could not build the bundle", { status: 500 });
  }

  const slug = form.title
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "form";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="signed-${slug}-${fileDate()}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
