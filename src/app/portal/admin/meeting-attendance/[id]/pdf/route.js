import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { logFileOpen, logFileDenied } from "@/lib/file-log";
import { accessLabel } from "@/lib/access-labels";
import { prisma } from "@/lib/prisma";
import {
  ackAudienceWhere, isCompanyMeeting, recordNoteOf, topicsForSession, attachmentsForSession,
} from "@/lib/announcements";
import { loadMeetingMaterials } from "@/lib/meeting-materials";
// LEGAL NAMES ON EVERY DOWNLOADABLE DOCUMENT - see payrollName
import { payrollName } from "@/lib/contacts";
import { officeFromSearch } from "@/lib/positions";
import { buildRoster, meetingMeta } from "../../roster";
import { renderAttendanceReport } from "@/lib/meeting-attendance-pdf";

// the attendance board as a document. Same roster build as the page, so the
// print can never disagree with the screen; this route is the auth in front
// of the renderer.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  // roster is sensitive - same gate as the board itself
  if (!isAdminUp(user?.role)) {
    await logFileDenied({ user, pathname: `meeting-attendance/${id}.pdf`, req, label: "Meeting attendance" });
    return new NextResponse("Forbidden", { status: 403 });
  }

  const m = await prisma.announcement.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      tag: true,
      deletedAt: true,
      publishedAt: true,
      meetingFormat: true,
      meetingMandatory: true,
      meetingAt: true,
      meetingOptions: true,
      meetingResponseDueAt: true,
      meetingResponseDueTz: true,
      meetingBackfilled: true,
      meetingRecordSource: true,
      meetingTopics: true,
      // the documents the meeting was run from, so they can ride inside the
      // report rather than be linked from it
      attachments: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
    },
  });
  if (!m || m.deletedAt || !m.publishedAt || !isCompanyMeeting(m.tag)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const office = officeFromSearch(
    Object.fromEntries(new URL(req.url).searchParams),
  );

  const [audienceUsers, choices, responses] = await Promise.all([
    prisma.user.findMany({
      where: {
        // a record of a past meeting keeps the people who have since left
        ...ackAudienceWhere(m, { includeInactive: !!m.meetingBackfilled }),
        ...(office ? { offices: { has: office } } : {}),
      },
      select: {
        id: true,
        name: true,
        preferredFirstName: true,
        preferredLastName: true,
        title: true,
        offices: true,
      },
      orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
    }),
    prisma.announcementMeetingChoice.findMany({
      where: { announcementId: m.id },
      select: { userId: true, optionId: true, attended: true },
    }),
    prisma.announcementMeetingResponse.findMany({
      where: { announcementId: m.id },
      select: { userId: true, cantMakeIt: true, reason: true, attended: true, viaEmail: true },
    }),
  ]);

  const r = buildRoster(m, audienceUsers, choices, responses);
  const meta = meetingMeta(m, r);
  // legal name leads, the preferred name rides beside it in lighter type when
  // the two differ - Mánu 2026-09-03, same rule as the payout documents
  const uById = new Map(audienceUsers.map((u) => [u.id, u]));
  const slimP = (p) => {
    const legal = payrollName(uById.get(p.id)) || p.displayName;
    return {
      name: legal,
      preferred: p.displayName && p.displayName !== legal ? p.displayName : null,
      title: p.title,
      attended: p.attended,
      reason: p.reason,
    };
  };

  // Loaded ONCE for the whole report: the union across every series, deduped by
  // url, so a document two series share is read and embedded a single time.
  // Each section then picks its own out of this by url.
  const loaded = await loadMeetingMaterials(m);

  let bytes;
  try {
    const out = await renderAttendanceReport(
      {
        meetingTitle: m.title,
        mandatory: !!m.meetingMandatory,
        metaLine: meta.metaLine,
        recordNote: recordNoteOf(m),
        materials: loaded,
        office: office || null,
        stats: {
          backfilled: !!m.meetingBackfilled,
          invited: r.invited,
          responded: r.responded,
          pct: meta.pct,
          going: r.goingCount,
          cantLabel: r.isSeries ? "Can't attend a series" : "Can't make it",
          cantCount: r.isSeries ? r.seriesCantCount : r.cantAll.length,
          noResponseCount: r.noResponse.length,
          present: r.present,
          absent: r.absent,
          unmarked: r.summary.unmarked,
          // marks exist or the meeting is over - matches the board's stat strip
          showRollCall: meta.isPast || r.present > 0 || r.absent > 0,
        },
        // ONE SECTION PER DATE, always - a single-date meeting is a list of
        // one, so the renderer has no second path. The series name rides the
        // section label rather than standing alone above the first of its
        // sessions, and each section carries the topics for ITS date.
        sections: r.hasSessions
          ? (r.isSeries
              ? r.seriesGroups.flatMap((g) =>
                  g.sessions.map((sn) => ({ ...sn, heading: g.label })))
              : r.sessions.map((sn) => ({ ...sn, heading: null }))
            ).map((sn) => ({
              label: [sn.heading, sn.label].filter(Boolean).join(" · "),
              dateLabel: sn.dateLabel,
              topics: topicsForSession(m, (m.meetingOptions || []).find((o) => o.id === sn.id)),
              // WHAT THIS DATE WAS RUN FROM, which is its series' documents and
              // not the meeting's whole shelf. Matched back to the loaded list
              // by url so the bytes are read once however many series share it.
              materials: attachmentsForSession(
                m, (m.meetingOptions || []).find((o) => o.id === sn.id),
              ).map((a) => loaded.find((x) => x.url === a.url)).filter(Boolean),
              people: sn.going.map(slimP),
            }))
          : [
              {
                label: m.title || "Meeting",
                dateLabel: meta.metaLine,
                topics: m.meetingTopics || [],
                materials: loaded,
                people: r.singleGoing.map(slimP),
              },
            ],
        // a series meeting's per-series decliners already print inside their
        // series block - the flat list is for single/multi meetings
        cantAll: r.isSeries ? [] : r.cantAll.map(slimP),
        noResponse: r.noResponse.map(slimP),
      },
      {
        generatedOn: new Date().toLocaleDateString("en-US", {
          timeZone: "America/Los_Angeles",
        }),
      },
    );
    bytes = out.bytes;
  } catch (e) {
    console.error("attendance pdf failed:", e);
    return new NextResponse("Could not build the report", { status: 500 });
  }

  await logFileOpen({ user, pathname: `meeting-attendance/${id}.pdf`, req, label: accessLabel("Meeting attendance", m.title) });
  const slug = (m.title || "meeting")
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="meeting-attendance-${slug}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
