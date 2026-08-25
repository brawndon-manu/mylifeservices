import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { renderFormsOverviewReport } from "@/lib/form-report-pdf";
import { ATTRIBUTION_LABELS } from "../query";
import { fmtStamp, fileDate } from "../../acknowledgments/audit";
import { fmtPosted } from "../../acknowledgments/roster";

// the whole forms library as one document: a cover with the totals and a
// per-form summary, then each form's signature record. built on demand so it
// can never disagree with the screen.
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
      rows: subs.map((s) => ({
        who: s.user ? preferredName(s.user) : s.submitterName,
        email: s.user ? s.user.email || "" : s.submitterEmail,
        how: ATTRIBUTION_LABELS[s.attribution] || s.attribution,
        when: fmtStamp(s.createdAt),
        asTyped: !s.user,
      })),
    };
  });

  let bytes;
  try {
    const out = await renderFormsOverviewReport(
      { forms: sections },
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

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="form-signature-records-${fileDate()}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
