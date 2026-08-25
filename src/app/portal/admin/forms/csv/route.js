import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { cell, csvResponse } from "@/lib/csv";
import { firstLine } from "../../acknowledgments/roster";
import { fmtStamp, fileDate } from "../../acknowledgments/audit";
import { ATTRIBUTION_LABELS, readFilters, submissionWhere } from "../query";

// the form-submissions list as a file, honoring the same filters as the page:
// who signed which form, when, and how the signature got attributed.
export const dynamic = "force-dynamic";

export async function GET(req) {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) {
    return new Response("Not found", { status: 404 });
  }

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const filters = readFilters(sp);
  const submissions = await prisma.formSubmission.findMany({
    where: submissionWhere(filters),
    orderBy: { createdAt: "desc" },
    include: {
      form: { select: { title: true } },
      user: {
        select: {
          name: true,
          preferredFirstName: true,
          preferredLastName: true,
          title: true,
          email: true,
        },
      },
    },
  });

  // no relation on the model - resolve announcement titles by id
  const annIds = [...new Set(submissions.map((s) => s.announcementId).filter(Boolean))];
  const announcements = annIds.length
    ? await prisma.announcement.findMany({
        where: { id: { in: annIds } },
        select: { id: true, title: true, content: true },
      })
    : [];
  const annTitle = new Map(
    announcements.map((a) => [a.id, a.title || firstLine(a.content)]),
  );

  const header = [
    "Form",
    "Submitted",
    "Employee",
    "Job title",
    "Email",
    "Attribution",
    "Name as typed",
    "Email as typed",
    "For announcement",
  ];
  const lines = [header.map(cell).join(",")];

  for (const s of submissions) {
    lines.push(
      [
        s.form.title,
        fmtStamp(s.createdAt),
        s.user ? preferredName(s.user) : "",
        s.user?.title || "",
        s.user?.email || "",
        ATTRIBUTION_LABELS[s.attribution] || s.attribution,
        s.submitterName,
        s.submitterEmail,
        s.announcementId ? annTitle.get(s.announcementId) || "" : "",
      ]
        .map(cell)
        .join(","),
    );
  }

  const suffix = filters.office ? `-${filters.office.toLowerCase()}` : "";
  return csvResponse(lines, `form-submissions${suffix}-${fileDate()}.csv`);
}
