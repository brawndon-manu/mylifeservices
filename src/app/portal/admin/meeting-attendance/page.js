import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import BackLink from "@/components/BackLink";
import { ackAudienceWhere, COMPANY_MEETING_TAG } from "@/lib/announcements";
import { buildRoster, meetingMeta } from "./roster";
import AttendanceBoard from "./_components/AttendanceBoard";

export const metadata = {
  title: "Meeting attendance",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MeetingAttendancePage() {
  const user = await getCurrentUser();
  // roster is sensitive (who's going / who didn't show) - Admin/IT/Super only,
  // same gate as each meeting's detail-page roster.
  if (!isAdminUp(user?.role)) {
    redirect("/portal");
  }

  const meetings = await prisma.announcement.findMany({
    where: { tag: COMPANY_MEETING_TAG, deletedAt: null, publishedAt: { not: null } },
    select: {
      id: true,
      title: true,
      meetingFormat: true,
      meetingMandatory: true,
      meetingAt: true,
      meetingOptions: true,
      meetingResponseDueAt: true,
      meetingResponseDueTz: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
    },
  });

  const enriched = await Promise.all(
    meetings.map(async (m) => {
      const [audienceUsers, choices, responses] = await Promise.all([
        prisma.user.findMany({
          where: ackAudienceWhere(m),
          select: {
            id: true,
            name: true,
            preferredFirstName: true,
            preferredLastName: true,
            title: true,
            image: true,
          },
          orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
        }),
        prisma.announcementMeetingChoice.findMany({
          where: { announcementId: m.id },
          select: { userId: true, optionId: true, attended: true },
        }),
        prisma.announcementMeetingResponse.findMany({
          where: { announcementId: m.id },
          select: { userId: true, cantMakeIt: true, reason: true, attended: true },
        }),
      ]);
      const r = buildRoster(m, audienceUsers, choices, responses);
      const meta = meetingMeta(m, r);

      // the main card is read-only summary now (faces + counts). the full
      // drill-down + roll-call live on the dedicated page (/[id]).
      return {
        id: m.id,
        title: m.title || "(untitled meeting)",
        mandatory: m.meetingMandatory,
        isSeries: r.isSeries,
        seriesCount: r.seriesGroups.length,
        responded: r.responded,
        invited: r.invited,
        pct: meta.pct,
        metaLine: meta.metaLine,
        dueLabel: meta.dueLabel,
        sortKey: meta.sortKey,
        isPast: meta.isPast,
        summary: r.summary,
      };
    }),
  );

  const upcoming = enriched.filter((r) => !r.isPast).sort((a, b) => a.sortKey - b.sortKey);
  const past = enriched.filter((r) => r.isPast).sort((a, b) => b.sortKey - a.sortKey);
  const avg = enriched.length
    ? Math.round(enriched.reduce((s, r) => s + r.pct, 0) / enriched.length)
    : 0;

  return (
    <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin">Back to admin dashboard</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Admin
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Meeting attendance
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        RSVP and roll-call rollups for every Company Meeting. Click a meeting to
        open its full breakdown and take roll-call. Times shown in Pacific.
      </p>

      <AttendanceBoard
        upcoming={upcoming}
        past={past}
        counts={{
          total: enriched.length,
          upcoming: upcoming.length,
          past: past.length,
          avg,
        }}
      />
    </section>
  );
}
