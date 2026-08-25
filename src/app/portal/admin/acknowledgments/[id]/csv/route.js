import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { cell, csvResponse } from "@/lib/csv";
import { isCompanyMeeting } from "@/lib/announcements";
import { firstLine } from "../../roster";
import { ackAuditRows, AUDIT_COLUMNS, fileDate, officeFromSearch } from "../../audit";

// one announcement's acknowledgment roster as a file - the same list as the
// detail page, one row per person.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const user = await getCurrentUser();
  // read-receipts are sensitive - Admin/IT/Super only, same gate as the page.
  if (!isAdminUp(user?.role)) {
    return new Response("Not found", { status: 404 });
  }

  const { id } = await params;
  const p = await prisma.announcement.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      tag: true,
      deletedAt: true,
      publishedAt: true,
      requireAck: true,
      formId: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
      acks: {
        select: {
          userId: true,
          viaEmail: true,
          recordedById: true,
          createdAt: true,
        },
      },
    },
  });
  if (!p || p.deletedAt || !p.publishedAt || !p.requireAck || isCompanyMeeting(p.tag)) {
    return new Response("Not found", { status: 404 });
  }

  const office = officeFromSearch(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await ackAuditRows(p, { office });
  const lines = [AUDIT_COLUMNS.map(cell).join(",")];
  for (const r of rows) {
    lines.push(r.map(cell).join(","));
  }

  const slug = (p.title || firstLine(p.content))
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "announcement";
  const suffix = office ? `-${office.toLowerCase()}` : "";
  return csvResponse(lines, `acknowledgments-${slug}${suffix}-${fileDate()}.csv`);
}
