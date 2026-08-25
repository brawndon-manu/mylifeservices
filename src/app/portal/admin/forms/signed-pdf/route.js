import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { renderSignedFormsBundle } from "@/lib/signed-forms-pdf";
import { submissionRow } from "../query";
import { fileDate } from "../../acknowledgments/audit";

// every signed document on file, all forms, in one file - grouped in library
// order with a divider page before each document.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [forms, submissions] = await Promise.all([
    prisma.form.findMany({
      select: { id: true, title: true, category: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    }),
    prisma.formSubmission.findMany({
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
    }),
  ]);
  if (!submissions.length) {
    return new NextResponse("No submissions on file", { status: 404 });
  }

  const withBytes = await Promise.all(
    submissions.map(async (s) => ({
      formId: s.formId,
      ...submissionRow(s),
      bytes: await fetch(s.pdfUrl)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null),
    })),
  );

  const groups = forms
    .map((f) => ({
      formTitle: f.title,
      category: f.category,
      items: withBytes.filter((s) => s.formId === f.id),
    }))
    .filter((g) => g.items.length);

  let bytes;
  try {
    const out = await renderSignedFormsBundle(
      { groups },
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

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="signed-forms-${fileDate()}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
