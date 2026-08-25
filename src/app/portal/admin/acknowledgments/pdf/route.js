import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { COMPANY_MEETING_TAG } from "@/lib/announcements";
import { renderAcksOverviewReport } from "@/lib/ack-report-pdf";
import { audienceLabel, firstLine, fmtPosted } from "../roster";
import {
  ackAuditPeople, ackStats, fileDate, officeFromSearch, OFFICE_LABELS,
} from "../audit";

// every ack-required announcement in one document: a cover with the totals,
// then each announcement's record - the post itself, then who acknowledged it,
// in portal or by email link, and when.
export const dynamic = "force-dynamic";

export async function GET(req) {
  const user = await getCurrentUser();
  // read-receipts are sensitive - Admin/IT/Super only, same gate as the board.
  if (!isAdminUp(user?.role)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const office = officeFromSearch(Object.fromEntries(new URL(req.url).searchParams));

  const rawPosts = await prisma.announcement.findMany({
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

  const posts = [];
  for (const p of rawPosts) {
    const people = await ackAuditPeople(p, { office });
    const stats = ackStats(people);
    posts.push({
      title: p.title || firstLine(p.content),
      tag: p.tag,
      postedLabel: fmtPosted(p.publishedAt),
      audLabel:
        audienceLabel(p, stats.expected) +
        (office ? ` · ${OFFICE_LABELS[office]} only` : ""),
      content: p.content,
      hasForm: !!p.formId,
      stats,
      rows: people,
    });
  }

  let bytes;
  try {
    const out = await renderAcksOverviewReport(
      { posts, filterLabel: office ? `${OFFICE_LABELS[office]} only` : "" },
      {
        generatedOn: new Date().toLocaleDateString("en-US", {
          timeZone: "America/Los_Angeles",
        }),
      },
    );
    bytes = out.bytes;
  } catch (e) {
    console.error("acknowledgments overview pdf failed:", e);
    return new NextResponse("Could not build the report", { status: 500 });
  }

  const suffix = office ? `-${office.toLowerCase()}` : "";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="acknowledgment-records${suffix}-${fileDate()}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
