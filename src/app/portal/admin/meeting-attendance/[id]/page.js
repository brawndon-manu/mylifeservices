import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import MeetingRecordEditor from "../_components/MeetingRecordEditor";
import { attachmentsOf, topicsForSession } from "@/lib/announcements";
import { ackAudienceWhere, isCompanyMeeting, recordNoteOf } from "@/lib/announcements";
import { buildRoster, meetingMeta, fmtSession } from "../roster";
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
      meetingBackfilled: true,
      meetingRecordSource: true,
      meetingTopics: true,
      attachments: true,
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
      // a record of a past meeting keeps the people who have since left
      where: ackAudienceWhere(m, { includeInactive: !!m.meetingBackfilled }),
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
  const recordNote = recordNoteOf(m);
  const materials = attachmentsOf(m);
  // restricted forms are never attachable - see announcement-attach-server
  const libraryDocs = await prisma.form.findMany({
    where: { minRole: null },
    select: { id: true, title: true, category: true },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });

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
          {/* A RECORD HAS NO POST WORTH OPENING. It was never written to be
              read - no body, nobody it went to - so the link would land on an
              empty page. Live meetings keep it. */}
          {!m.meetingBackfilled && (
            <Link
              href={`/portal/announcements/${m.id}?from=meetingDetail`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
            >
              View announcement →
            </Link>
          )}
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
        {/* every name below was typed in by an admin, not chosen by the person */}
        {recordNote && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {recordNote}
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

      {(m.meetingTopics?.length > 0 || materials.length > 0) && (
        <div className="mt-5 rounded-xl border border-border bg-surface p-4">
          {(sessionList.length > 1
            ? sessionList.some((x) => x.topics.length)
            : m.meetingTopics?.length > 0) && (
            <>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
                What was covered
              </h2>
              {sessionList.length > 1 ? (
                <div className="mt-2 space-y-3">
                  {sessionList.filter((x) => x.topics.length).map((x) => (
                    <div key={x.key}>
                      <p className="text-[13px] font-semibold text-foreground">
                        {x.label} <span className="font-normal text-muted">{x.dateLabel}</span>
                      </p>
                      <ul className="mt-1 space-y-1">
                        {x.topics.map((t) => (
                          <li key={t} className="flex gap-2 text-sm text-foreground">
                            <span aria-hidden="true" className="text-faint">-</span>
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="mt-2 space-y-1">
                  {m.meetingTopics.map((t) => (
                    <li key={t} className="flex gap-2 text-sm text-foreground">
                      <span aria-hidden="true" className="text-faint">-</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {materials.length > 0 && (
            <div className={m.meetingTopics?.length > 0 ? "mt-4 border-t border-border pt-4" : ""}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
                Materials used
              </h2>
              <ul className="mt-2 space-y-1">
                {materials.map((a) => (
                  <li key={a.url} className="text-sm text-foreground">
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="hover:text-brand hover:underline">
                      {a.name}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                Carried inside the attendance report in full.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <MeetingRecordEditor
          postId={m.id}
          title={m.title || ""}
          topics={m.meetingTopics || []}
          sessions={sessionList}
          attachments={materials}
          recordSource={m.meetingRecordSource || ""}
          backfilled={!!m.meetingBackfilled}
          docs={libraryDocs}
        />
      </div>

      <div className="mt-5 rounded-xl border border-border bg-surface p-4">
        {/* nobody responded to a record and nobody wrote down who was
            invited, so a percentage here would be invented */}
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted">{m.meetingBackfilled ? "On the record" : "Responded"}</span>
          <span className="font-semibold text-foreground">
            {m.meetingBackfilled
              ? `${r.invited} ${r.invited === 1 ? "person" : "people"}`
              : `${r.responded} / ${r.invited} · ${meta.pct}%`}
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
