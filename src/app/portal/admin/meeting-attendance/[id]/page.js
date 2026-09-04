import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import { ackAudienceWhere, isCompanyMeeting } from "@/lib/announcements";
import { buildRoster, meetingMeta } from "../roster";
import MeetingBreakdown from "../_components/MeetingBreakdown";
import OfficeFilter from "@/components/OfficeFilter";
import { officeFromSearch } from "@/lib/positions";

export const metadata = {
  title: "Meeting attendance",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function Stat({ tone, label, value }) {
  const valCls = {
    go: "text-emerald-600 dark:text-emerald-400",
    no: "text-rose-600 dark:text-rose-400",
    na: "text-faint",
    amber: "text-amber-600 dark:text-amber-400",
    pres: "text-emerald-600 dark:text-emerald-400",
    abs: "text-rose-600 dark:text-rose-400",
  }[tone];
  return (
    <span className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted">
      {label} <b className={`font-semibold ${valCls}`}>{value}</b>
    </span>
  );
}

export default async function MeetingAttendanceDetailPage({ params, searchParams }) {
  const { id } = await params;
  const user = await getCurrentUser();
  // roster is sensitive - Admin/IT/Super only, same gate as the report + the
  // announcement detail-page roster.
  if (!isAdminUp(user?.role)) {
    redirect("/portal");
  }
  const office = officeFromSearch(await searchParams);

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
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
      meetingAttestationForm: { select: { title: true, fillable: true } },
      meetingReminders: {
        where: { kind: "concluded" },
        select: { optionId: true },
      },
    },
  });
  if (!m || m.deletedAt || !m.publishedAt || !isCompanyMeeting(m.tag)) notFound();

  const [audienceUsers, choices, responses, allActive] = await Promise.all([
    prisma.user.findMany({
      where: ackAudienceWhere(m),
      select: {
        id: true,
        name: true,
        preferredFirstName: true,
        preferredLastName: true,
        title: true,
        image: true,
        email: true,
        phone: true,
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
    prisma.user.findMany({
      where: { deactivatedAt: null },
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
  ]);

  // the roster narrows to one office in JS so the invitee logic below still
  // sees the whole audience - a person from the other office is invited, not
  // an invitee candidate
  const roster = office
    ? audienceUsers.filter((u) => (u.offices || []).includes(office))
    : audienceUsers;
  const r = buildRoster(m, roster, choices, responses);
  const meta = meetingMeta(m, r);

  // invitee-manager data: everyone not already invited + the added-by-hand people.
  const audIds = new Set(audienceUsers.map((u) => u.id));
  const inviteeCandidates = allActive
    .filter((u) => !audIds.has(u.id))
    .map((u) => ({ id: u.id, displayName: preferredName(u), title: u.title || "", image: u.image || null }));
  const addedInvitees = audienceUsers
    .filter((u) => (m.ackUserIds || []).includes(u.id))
    .map((u) => ({ id: u.id, displayName: preferredName(u) }));

  const breakdown = {
    id: m.id,
    concludedOptionIds: (m.meetingReminders || []).map((r) => r.optionId),
    attestationTitle: m.meetingAttestationForm?.fillable ? m.meetingAttestationForm.title : null,
    isSeries: r.isSeries,
    seriesGroups: r.seriesGroups,
    sessions: r.sessions,
    singleGoing: r.singleGoing,
    noResponse: r.noResponse,
    cantAll: r.cantAll,
    toolSessions: r.toolSessions,
    hasSessions: r.hasSessions,
    audience: r.audience,
    inviteeCandidates,
    addedInvitees,
  };

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/portal/admin/meeting-attendance">Back to meeting attendance</BackLink>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/portal/admin/meeting-attendance/${m.id}/pdf${office ? `?office=${office}` : ""}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Download PDF
          </a>
          <Link
            href={`/portal/announcements/${m.id}?from=meetingDetail`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            View announcement →
          </Link>
        </div>
      </div>

      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Meeting attendance
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {m.title || "(untitled meeting)"}
        </h1>
        {m.meetingMandatory && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            Mandatory
          </span>
        )}
        {r.isSeries && (
          <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
            {r.seriesGroups.length} series
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">{meta.metaLine}</p>
      {meta.dueLabel && (
        <p className="mt-2">
          <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
            Response needed by {meta.dueLabel}
          </span>
        </p>
      )}

      <OfficeFilter basePath={`/portal/admin/meeting-attendance/${m.id}`} current={office} />

      <div className="mt-5 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted">Responded</span>
          <span className="font-semibold text-foreground">
            {r.responded} / {r.invited} · {meta.pct}%
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full border border-border bg-background">
          <div
            className={`h-full rounded-full ${r.invited > 0 && r.responded >= r.invited ? "bg-emerald-500" : "bg-brand-light"}`}
            style={{ width: `${meta.pct}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Stat tone="go" label="Attending" value={r.goingCount} />
          {r.isSeries ? (
            <Stat tone="amber" label="Can't attend a series" value={r.seriesCantCount} />
          ) : (
            <Stat tone="no" label="Can't make it" value={r.cantAll.length} />
          )}
          {(meta.isPast || r.present > 0 || r.absent > 0) && (
            <>
              <Stat tone="pres" label="Present" value={r.present} />
              <Stat tone="abs" label="Absent" value={r.absent} />
            </>
          )}
          <Stat tone="na" label="No response" value={r.noResponse.length} />
        </div>
      </div>

      <MeetingBreakdown m={breakdown} />
    </section>
  );
}
