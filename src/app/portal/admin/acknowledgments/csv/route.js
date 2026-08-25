import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { cell, csvResponse } from "@/lib/csv";
import { COMPANY_MEETING_TAG } from "@/lib/announcements";
import { audienceLabel, firstLine, fmtPosted } from "../roster";
import { ackAuditRows, AUDIT_COLUMNS, fileDate } from "../audit";

// the full acknowledgment audit as a file: every ack-required announcement,
// one row per person, who acked what and when. same dataset as the
// acknowledgments board, in a shape HR can file or hand to an auditor.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  // read-receipts are sensitive - Admin/IT/Super only, same gate as the board.
  if (!isAdminUp(user?.role)) {
    return new Response("Not found", { status: 404 });
  }

  const posts = await prisma.announcement.findMany({
    where: {
      requireAck: true,
      deletedAt: null,
      publishedAt: { not: null },
      tag: { not: COMPANY_MEETING_TAG },
    },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      content: true,
      tag: true,
      publishedAt: true,
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

  const header = ["Announcement", "Tag", "Posted", "Audience", ...AUDIT_COLUMNS];
  const lines = [header.map(cell).join(",")];

  for (const p of posts) {
    const rows = await ackAuditRows(p);
    const title = p.title || firstLine(p.content);
    const posted = p.publishedAt ? fmtPosted(p.publishedAt) : "";
    const audience = audienceLabel(p, rows.length);
    for (const r of rows) {
      lines.push([title, p.tag, posted, audience, ...r].map(cell).join(","));
    }
  }

  return csvResponse(lines, `acknowledgment-audit-${fileDate()}.csv`);
}
