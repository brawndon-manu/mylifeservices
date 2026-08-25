import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { officeFromSearch, OFFICE_FILTER_LABELS } from "@/lib/positions";
import { renderFormsOverviewReport } from "@/lib/form-report-pdf";
import { submissionRow } from "../query";
import { fileDate } from "../../acknowledgments/audit";
import { fmtPosted } from "../../acknowledgments/roster";

// the whole forms library as one document: a cover with the totals and a
// per-form summary, then each form's signature record. built on demand so it
// can never disagree with the screen.
export const dynamic = "force-dynamic";

export async function GET(req) {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const office = officeFromSearch(Object.fromEntries(new URL(req.url).searchParams));

  const [forms, submissions] = await Promise.all([
    prisma.form.findMany({
      select: { id: true, title: true, category: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    }),
    prisma.formSubmission.findMany({
      where: office ? { user: { offices: { has: office } } } : {},
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

  const byForm = new Map(forms.map((f) => [f.id, []]));
  for (const s of submissions) {
    byForm.get(s.formId)?.push(s);
  }

  const sections = forms.map((f) => {
    const subs = byForm.get(f.id) || [];
    const unassigned = subs.filter((s) => s.attribution === "unassigned").length;
    return {
      formTitle: f.title,
      category: f.category,
      stats: {
        total: subs.length,
        attributed: subs.length - unassigned,
        unassigned,
        lastLabel: subs.length ? fmtPosted(subs[0].createdAt) : null,
        lastAt: subs.length ? subs[0].createdAt : null,
      },
      rows: subs.map(submissionRow),
    };
  });

  let bytes;
  try {
    const out = await renderFormsOverviewReport(
      {
        forms: sections,
        filterLabel: office ? `${OFFICE_FILTER_LABELS[office]} only` : "",
      },
      {
        generatedOn: new Date().toLocaleDateString("en-US", {
          timeZone: "America/Los_Angeles",
        }),
      },
    );
    bytes = out.bytes;
  } catch (e) {
    console.error("forms overview pdf failed:", e);
    return new NextResponse("Could not build the report", { status: 500 });
  }

  const suffix = office ? `-${office.toLowerCase()}` : "";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="form-signature-records${suffix}-${fileDate()}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
