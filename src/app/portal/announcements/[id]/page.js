import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import {
  isModerator,
  isElevated,
  canSeeRoles,
  isSupervisorUp,
  isAdminUp,
  isSuper,
} from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { renderMarkdown } from "@/lib/markdown";
import { getStaffByTitle } from "@/lib/staff-audience";
import {
  timeAgo,
  isExpired,
  COMMENT_CONTENT_MAX,
} from "@/lib/hub";
import {
  ANNOUNCEMENT_TAG_STYLES,
  isChangelog,
  isCompanyMeeting,
  MEETING_FORMAT_LABELS,
  formatHasOnline,
  formatHasAddress,
  ackAudienceWhere,
  isAckExempt,
  computeMeetingLocks,
} from "@/lib/announcements";
import AuthorPreview from "../_components/AuthorPreview";
import Avatar from "@/components/Avatar";
import ConfirmButton from "@/components/ConfirmButton";
import SendEmailDialog from "../_components/SendEmailDialog";
import CopyButton from "../_components/CopyButton";
import MeetingTime from "../_components/MeetingTime";
import MeetingResponse from "../_components/MeetingResponse";
import PublishBar from "../_components/PublishBar";
import AckEmailAction from "../_components/AckEmailAction";
import NameHover from "@/components/NameHover";

// shape a db user into the {id,displayName,title,image,email,phone} the hover
// card wants, so a name anywhere on this page can pop the person's contact card.
function nhUser(u) {
  return {
    id: u.id,
    displayName: preferredName(u),
    title: u.title || "",
    image: u.image || null,
    email: u.email || null,
    phone: u.phone || null,
  };
}
import { formatDuration } from "@/lib/meeting-time";
import {
  toggleLike,
  togglePin,
  deletePost,
  addComment,
  deleteComment,
  acknowledge,
  sendAckEmails,
  sendAnnouncementEmail,
  publishAnnouncement,
  discardDraft,
  setMeetingChoices,
  attendMeeting,
  cantMakeMeeting,
  setAttendance,
  setMeetingLink,
  adminAddToSession,
  adminMoveSession,
  adminSetGoing,
  adminSetCantMake,
  adminRemoveFromMeeting,
  adminRecordChoices,
  markAckFor,
} from "../actions";
import {
  PersonKebab,
  AddToSession,
  RecordResponse,
  MarkAckButton,
  OverrideProvider,
  OverrideToggle,
} from "../_components/RosterAdmin";

export const metadata = {
  title: "Announcement · MLS Portal",
  robots: { index: false, follow: false },
};

const ERRORS = {
  comment: "Comment cant be blank.",
  forbidden: "You dont have permission to do that.",
  emailConfig: "Email isnt configured yet. Add the announcements sender to the env.",
  recipients: "Pick at least one group to send to.",
  locked: "That session is closed - it already started or you were marked for it. Ask an admin if you need a change.",
};

// shared markdown body styling for both the changelog + the new announcement
// layout, so they read the same.
const PROSE =
  "text-[15px] leading-relaxed text-foreground [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_li]:marker:text-faint [&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_strong]:font-semibold [&_strong]:text-foreground [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_em]:italic [&_hr]:my-6 [&_hr]:border-border [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_pre]:mt-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-2 [&_pre]:p-3";

// one row in the meeting roster: avatar + display name + job title. shows a
// reason chip (cant-make-it) or, with rollPostId set, present/absent roll-call
// toggles (Phase B) reading user.attended.
function PersonRow({ user, reason, rollPostId, optionId = null, extra = null }) {
  const att = user.attended || null;
  const rollBtn =
    "rounded-md border px-2 py-0.5 text-xs font-medium transition";
  return (
    <div className="flex items-center gap-2.5 py-1">
      <Avatar name={preferredName(user)} image={user.image} size={30} />
      <div className="min-w-0">
        <NameHover user={nhUser(user)} className="block truncate text-sm font-medium text-foreground" />
        {user.title && (
          <div className="truncate text-xs text-muted">{user.title}</div>
        )}
      </div>
      {reason && (
        <span className="ml-2 rounded-md border border-rose-300/40 bg-rose-50 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {reason}
        </span>
      )}
      {(rollPostId || extra) && (
        <span className="ml-auto flex flex-none items-center gap-1.5">
          {rollPostId && (
            <>
              <form action={setAttendance.bind(null, rollPostId, user.id, att === "present" ? "" : "present", optionId)}>
                <button
                  type="submit"
                  className={`${rollBtn} ${
                    att === "present"
                      ? "border-green-500 bg-green-500 text-white"
                      : "border-border-strong text-muted hover:border-green-500 hover:text-green-600"
                  }`}
                >
                  Present
                </button>
              </form>
              <form action={setAttendance.bind(null, rollPostId, user.id, att === "absent" ? "" : "absent", optionId)}>
                <button
                  type="submit"
                  className={`${rollBtn} ${
                    att === "absent"
                      ? "border-rose-500 bg-rose-500 text-white"
                      : "border-border-strong text-muted hover:border-rose-500 hover:text-rose-600"
                  }`}
                >
                  Absent
                </button>
              </form>
            </>
          )}
          {extra}
        </span>
      )}
    </div>
  );
}

export default async function AnnouncementDetailPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const errorMessage = sp?.error ? ERRORS[sp.error] : null;

  // the back link returns you to where you came from. the admin report pages
  // link in with ?from=... so "back" doesn't dump you on the feed.
  const BACKS = {
    ack: { href: "/portal/admin/acknowledgments", label: "← Back to Acknowledgments" },
    meetings: { href: "/portal/admin/meeting-attendance", label: "← Back to Meeting attendance" },
  };
  const back = BACKS[sp?.from] || {
    href: "/portal/announcements",
    label: "← Back to Announcements",
  };

  const user = await getCurrentUser();

  const post = await prisma.announcement.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, preferredFirstName: true, preferredLastName: true, role: true, email: true, image: true, title: true } },
      postedBy: { select: { id: true, name: true, preferredFirstName: true, preferredLastName: true } },
      likes: { where: { userId: user.id }, select: { userId: true } },
      acks: { where: { userId: user.id }, select: { viaEmail: true, createdAt: true } },
      meetingChoices: { where: { userId: user.id }, select: { optionId: true, attended: true } },
      meetingResponses: {
        where: { userId: user.id },
        select: { cantMakeIt: true, reason: true, attended: true },
      },
      _count: { select: { likes: true } },
      comments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, preferredFirstName: true, preferredLastName: true, role: true, email: true, title: true, image: true, phone: true } },
        },
      },
    },
  });

  if (!post || post.deletedAt) notFound();

  // a draft (publishedAt null) is preview-only: visible to its author or a
  // moderator, a 404 to everyone else (it isn't live yet).
  const isDraft = !post.publishedAt;
  if (isDraft && post.authorId !== user.id && !isModerator(user.role)) notFound();

  const expired = isExpired(post);
  const liked = post.likes.length > 0;
  const canDeletePost = post.authorId === user.id || isModerator(user.role);
  // the author edits their own; Super can edit anyone's.
  const canEditPost = post.authorId === user.id || isSuper(user.role);
  // the Zoom link + passcode are admin-only: only Admin/IT/Super can see or manage
  // them. everyone else sees a "Link will be provided soon!" note (they get the
  // link in the reminder email).
  const isAdmin = isAdminUp(user.role);
  const canManageLink = isAdmin;
  const canPin = isModerator(user.role);
  const tagClass = ANNOUNCEMENT_TAG_STYLES[post.tag] ?? "bg-surface-3 text-muted";
  const changelog = isChangelog(post.tag);
  const meeting = isCompanyMeeting(post.tag);
  // every announcement renders markdown now (sanitized). non-changelogs get the
  // new hero layout; changelogs keep their "What's New" treatment.
  const bodyHtml = renderMarkdown(post.content);
  const fullDate = new Date(post.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // ---- acknowledgments ----
  const myAck = post.acks[0] ?? null;
  // am I in this announcement's ack audience? (Everyone = the expected-ack
  // staff set; otherwise my job title has to match one of the targeted titles.)
  const titleMatches = (t) =>
    (user.title || "").toLowerCase().includes(t.toLowerCase());
  // meetings use the RSVP response as the record - no separate acknowledgment.
  const iMustAck =
    !meeting &&
    (post.ackEveryone
      ? !isAckExempt(user)
      : (post.ackTitles || []).some(titleMatches) ||
        (post.ackUserIds || []).includes(user.id));
  // the roster (who's responded / acknowledged / going / attended) is sensitive -
  // Admin/IT/Super only. NOTE: gated on the EFFECTIVE role, and no author
  // exception, so "view as staff" (or any non-admin) never sees it.
  const canSeeRoster = isAdminUp(user.role);
  // Supervisor+ can email the announcement out to a chosen audience.
  const canSend = isSupervisorUp(user.role);
  const staffByTitle = canSend ? await getStaffByTitle() : {};
  // the email "Everyone" = all active users; show the count in the picker.
  const emailEveryoneTotal = canSend
    ? await prisma.user.count({ where: { deactivatedAt: null } })
    : null;
  const fromAddress =
    process.env.ANNOUNCEMENTS_FROM ||
    process.env.AUTH_RESEND_FROM ||
    "announcements@mylifeservicesinc.com";

  let roster = null;
  if (post.requireAck && !meeting && canSeeRoster) {
    // the roster denominator = this announcement's audience (shared helper).
    const [expectedUsers, acks] = await Promise.all([
      prisma.user.findMany({
        where: ackAudienceWhere(post),
        select: {
          id: true,
          name: true,
          preferredFirstName: true,
          preferredLastName: true,
          email: true,
          title: true,
          image: true,
          phone: true,
        },
        orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
      }),
      prisma.announcementAck.findMany({
        where: { announcementId: id },
        select: { userId: true, viaEmail: true, createdAt: true, recordedById: true },
      }),
    ]);
    const ackMap = new Map(acks.map((a) => [a.userId, a]));
    // resolve the names of admins who logged an ack on someone's behalf.
    const recorderIds = [...new Set(acks.map((a) => a.recordedById).filter(Boolean))];
    const recorders = recorderIds.length
      ? await prisma.user.findMany({
          where: { id: { in: recorderIds } },
          select: { id: true, name: true, preferredFirstName: true, preferredLastName: true },
        })
      : [];
    const recorderName = new Map(recorders.map((u) => [u.id, preferredName(u)]));
    const acked = expectedUsers
      .filter((u) => ackMap.has(u.id))
      .map((u) => ({
        ...u,
        ack: ackMap.get(u.id),
        recordedBy: ackMap.get(u.id).recordedById
          ? recorderName.get(ackMap.get(u.id).recordedById) || "an admin"
          : null,
      }))
      .sort((a, b) => b.ack.createdAt - a.ack.createdAt);
    const notYet = expectedUsers.filter((u) => !ackMap.has(u.id));
    const total = expectedUsers.length;
    const pct = total ? Math.round((acked.length / total) * 100) : 0;
    roster = { acked, notYet, total, pct };
  }

  // ---- Company Meeting ----
  const meetingOptions = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  const myPicks = (post.meetingChoices || []).map((c) => c.optionId);
  // can I pick a session? = in the meeting audience (same membership as ack).
  const iCanPick = post.ackEveryone
    ? !isAckExempt(user)
    : (post.ackTitles || []).some(titleMatches) ||
      (post.ackUserIds || []).includes(user.id);

  // my current response (going / cant make it + reason), for the controls.
  const myResponse = post.meetingResponses?.[0] || null;
  // what I can no longer change myself (a started/marked session or series). the
  // server enforces this too; here it just drives the read-only UI.
  const myLocks = meeting
    ? computeMeetingLocks({
        options: meetingOptions,
        myChoices: post.meetingChoices || [],
        meetingAt: post.meetingAt,
        myAttended: myResponse?.attended || null,
        now: Date.now(),
      })
    : { lockedAll: false, lockedSeriesIds: [] };

  // draft -> the author/moderator sees a publish bar. precompute the email
  // recipients ("same as invitees" = the invite/ack audience) for the dialog.
  let publishInfo = null;
  if (isDraft && (post.authorId === user.id || isModerator(user.role))) {
    const hasAudience = meeting || post.requireAck;
    const recipients = hasAudience
      ? await prisma.user.findMany({
          where: ackAudienceWhere(post),
          select: { id: true, name: true, preferredFirstName: true, preferredLastName: true, title: true },
          orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
        })
      : [];
    publishInfo = {
      hasAudience,
      count: recipients.length,
      recipients: recipients.map((u) => ({ id: u.id, name: preferredName(u), title: u.title || "" })),
      allActiveCount: hasAudience
        ? 0
        : await prisma.user.count({ where: { deactivatedAt: null } }),
      meeting,
      reminderLeadMin: post.meetingReminderLeadMin ?? 10,
      nightBefore: post.meetingNightBefore !== false,
    };
  }

  let meetingRoster = null;
  if (meeting && canSeeRoster) {
    const [audienceUsers, choices, responses] = await Promise.all([
      prisma.user.findMany({
        where: ackAudienceWhere(post),
        select: {
          id: true,
          name: true,
          preferredFirstName: true,
          preferredLastName: true,
          title: true,
          image: true,
          email: true,
          phone: true,
        },
        orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
      }),
      prisma.announcementMeetingChoice.findMany({
        where: { announcementId: id },
        select: { userId: true, optionId: true, attended: true },
      }),
      prisma.announcementMeetingResponse.findMany({
        where: { announcementId: id },
        select: { userId: true, cantMakeIt: true, reason: true, attended: true },
      }),
    ]);
    const audIds = new Set(audienceUsers.map((u) => u.id));
    const userById = new Map(audienceUsers.map((u) => [u.id, u]));
    const respByUser = new Map(
      responses.filter((r) => audIds.has(r.userId)).map((r) => [r.userId, r]),
    );
    const isGoing = (uid) => respByUser.has(uid) && !respByUser.get(uid).cantMakeIt;
    // a going person + their attendance mark, for the roll-call controls.
    const goingUser = (uid) => ({
      ...userById.get(uid),
      attended: respByUser.get(uid)?.attended || null,
    });

    // Going, grouped by session (multi-session); single-session has no options.
    // attendance is now per session, so it reads from the choice row, not the
    // meeting-level response.
    const bySession = meetingOptions.map((o) => ({
      option: o,
      users: choices
        .filter((c) => c.optionId === o.id && audIds.has(c.userId) && isGoing(c.userId))
        .map((c) => ({ ...userById.get(c.userId), attended: c.attended || null }))
        .filter((u) => u.id),
    }));
    const singleGoing = meetingOptions.length
      ? []
      : audienceUsers.filter((u) => isGoing(u.id)).map((u) => goingUser(u.id));
    const cantUsers = audienceUsers
      .filter((u) => respByUser.get(u.id)?.cantMakeIt)
      .map((u) => ({ ...u, reason: respByUser.get(u.id).reason }));
    const noResponse = audienceUsers.filter((u) => !respByUser.has(u.id));

    // per-series "can't attend this series" picks (series meetings only).
    const seriesCantMap = {};
    for (const c of choices) {
      if (
        typeof c.optionId === "string" &&
        c.optionId.startsWith("cant:") &&
        audIds.has(c.userId)
      ) {
        const sid = c.optionId.slice(5);
        const u = userById.get(c.userId);
        if (u) (seriesCantMap[sid] ||= []).push({ ...u, reason: respByUser.get(c.userId)?.reason || null });
      }
    }
    const seriesCantList = Object.entries(seriesCantMap)
      .map(([sid, users]) => ({
        label: meetingOptions.find((o) => o.seriesId === sid)?.seriesLabel || "Series",
        users,
      }))
      .filter((x) => x.users.length);

    meetingRoster = {
      bySession,
      singleGoing,
      cantUsers,
      noResponse,
      seriesCantList,
      goingCount: audienceUsers.filter((u) => isGoing(u.id)).length,
      total: audienceUsers.length,
      responded: respByUser.size,
      // for the admin override controls: the real sessions (move / record targets)
      // and a slim audience list (walk-in picker).
      sessions: meetingOptions.map((o) => ({
        id: o.id,
        label: o.label,
        seriesLabel: o.seriesLabel || null,
      })),
      isSeries: meetingOptions.some((o) => o && o.seriesId),
      seriesGroups: (() => {
        const groups = [];
        for (const o of meetingOptions) {
          if (!o || !o.seriesId) continue;
          let g = groups.find((x) => x.id === o.seriesId);
          if (!g) {
            g = { id: o.seriesId, label: o.seriesLabel || "Series", options: [] };
            groups.push(g);
          }
          g.options.push({ id: o.id, label: o.label });
        }
        return groups;
      })(),
      audience: audienceUsers.map((u) => ({
        id: u.id,
        displayName: preferredName(u),
        title: u.title || "",
        image: u.image || null,
      })),
    };
  }

  // "sent=N" banner after the email blast.
  const sentRaw = sp?.sent;
  const sentCount = sentRaw != null ? parseInt(sentRaw, 10) : null;

  const ackDateFmt = (d) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <Link
        href={back.href}
        className="text-sm font-medium text-muted transition hover:text-brand"
      >
        {back.label}
      </Link>

      {errorMessage && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          {errorMessage}
        </div>
      )}

      {sp?.published === "1" && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white">
            ✓
          </span>
          <p className="text-sm font-medium text-foreground">
            Published - it&apos;s live in the feed
            {sentCount ? ` and emailed to ${sentCount} ${sentCount === 1 ? "person" : "people"}` : ""}.
          </p>
        </div>
      )}

      {sp?.reset && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-foreground">Session times updated.</p>
          <p className="mt-1 text-sm text-muted">
            {sp.reset} {sp.reset === "1" ? "person" : "people"} who picked a changed
            session need to RSVP again
            {sp.emailed
              ? ` - emailed ${sp.emailed} ${sp.emailed === "1" ? "person" : "people"}.`
              : "."}
          </p>
        </div>
      )}

      {publishInfo && (
        <div className="mt-4">
          <PublishBar postId={post.id} publish={publishAnnouncement} discard={discardDraft} info={publishInfo} />
        </div>
      )}

      <article
        className={`mt-4 overflow-hidden rounded-xl border border-border shadow-sm ${
          changelog
            ? "bg-surface p-6 sm:p-8"
            : "bg-[#eef3fa] dark:bg-[#070912] night:!bg-background"
        }`}
      >
        {changelog ? (
          /* Discord-style changelog: centered title block + markdown body */
          <div>
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
                What&apos;s New
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {post.title || "Changelog"}
              </h1>
              <div className="mt-4 flex items-center justify-center gap-2">
                <Avatar
                  name={preferredName(post.author)}
                  email={post.author.email}
                  image={post.author.image}
                  size={28}
                />
                <span className="text-sm font-medium text-foreground">
                  {preferredName(post.author)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">
                {fullDate}
                {post.editedAt && " · edited"}
                {post.pinnedAt && " · pinned"}
              </p>
            </div>
            <div className="mx-auto mt-8 h-px max-w-2xl bg-border" />
            <div
              className={`mx-auto mt-6 max-w-2xl ${PROSE}`}
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </div>
        ) : (
          /* new announcement layout: hero with faded logo + title block + body */
          <div>
            {/* hero: soft cloud glow + gradient tree, theme-aware - its own airy
                light look in Light, glowing in Dim/Night; fades into the body
                color below the divider */}
            <div className="relative h-52 overflow-hidden sm:h-60">
              {/* soft cloud / dome glow (dimmer in Light, full in Dim/Night) */}
              <div
                className="absolute left-1/2 top-[-130px] h-[380px] w-[640px] max-w-[150%] -translate-x-1/2 opacity-60 dark:opacity-100"
                style={{
                  background:
                    "radial-gradient(58% 60% at 50% 50%, rgba(47,111,235,0.50), rgba(47,111,235,0.18) 42%, rgba(47,111,235,0.05) 64%, transparent 78%)",
                }}
              />
              {/* tree recolored from the white silhouette via a css mask, so the
                 cyan->blue gradient is one value across every theme (no per-theme
                 image); glows a bit stronger in dark */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-8 h-[84px] w-28 -translate-x-1/2 drop-shadow-[0_5px_14px_rgba(41,111,235,0.28)] dark:brightness-110 dark:drop-shadow-[0_0_30px_rgba(47,130,235,0.85)] sm:h-[96px] sm:w-32"
                style={{
                  background:
                    "linear-gradient(180deg, #3bc4f2 0%, #1f8ec4 45%, #14608a 100%)",
                  WebkitMaskImage: "url(/logo/treelogo_white.png)",
                  maskImage: "url(/logo/treelogo_white.png)",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                }}
              />
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-[#eef3fa] dark:to-[#070912] night:!to-background" />
            </div>

            <div className="relative -mt-10 px-6 text-center sm:px-8">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1f63c9] dark:text-[#58a6ff]">
                {meeting ? "Company Meeting" : "Announcement"}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {post.title || "Announcement"}
              </h1>
              <div className="mt-3 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-sm">
                <span className="font-medium text-foreground">
                  {preferredName(post.author)}
                </span>
                {post.author.title && (
                  <>
                    <span className="text-faint">·</span>
                    <span className="font-serif italic text-[#3f72c4] dark:text-[#8ab4f0]">
                      {post.author.title}
                    </span>
                  </>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">
                {fullDate}
                {post.editedAt && " · edited"}
                {post.pinnedAt && " · pinned"}
              </p>
              {post.requireAck && !meeting && (
                <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-400">
                  Acknowledgment required
                </p>
              )}
              {post.postedBy && isElevated(user.role) && (
                <p className="mt-1 text-xs italic text-muted">
                  posted on their behalf by {preferredName(post.postedBy) || "staff"}
                </p>
              )}
              <div className="mx-auto mt-6 h-px max-w-2xl bg-border" />
            </div>

            <div
              className={`mx-auto mt-6 max-w-2xl px-6 sm:px-8 ${PROSE}`}
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />

            {meeting && (
              <div className="mx-auto mt-6 max-w-2xl px-6 sm:px-8">
                <div className="flex flex-wrap items-center gap-2">
                  {post.meetingKind && (
                    <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                      {post.meetingKind}
                    </span>
                  )}
                  {post.meetingFormat && (
                    <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
                      {MEETING_FORMAT_LABELS[post.meetingFormat]}
                    </span>
                  )}
                  {post.meetingMandatory && (
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
                      Mandatory
                    </span>
                  )}
                </div>

                {(post.meetingAt || formatDuration(post.meetingDurationFromMin, post.meetingDurationToMin)) && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
                    <ClockIcon className="h-4 w-4 text-muted" />
                    {post.meetingAt && (
                      <MeetingTime
                        iso={post.meetingAt.toISOString()}
                        setTz={post.meetingTimezone}
                      />
                    )}
                    {formatDuration(post.meetingDurationFromMin, post.meetingDurationToMin) && (
                      <span className="text-muted">
                        {post.meetingAt ? "· " : ""}
                        {formatDuration(post.meetingDurationFromMin, post.meetingDurationToMin)}
                      </span>
                    )}
                    {post.meetingAt && (
                      <span className="text-xs text-faint">(your time)</span>
                    )}
                  </div>
                )}

                {/* meeting access card. only admins see/manage the Zoom link +
                    passcode; everyone else sees a "provided soon" note (they get
                    the link in the reminder email). */}
                {(formatHasOnline(post.meetingFormat) ||
                  (formatHasAddress(post.meetingFormat) && post.meetingAddress)) && (
                  <div className="mt-4 space-y-3 rounded-xl border border-border bg-surface p-4">
                    {formatHasOnline(post.meetingFormat) && !isAdmin && (
                      <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-2 px-4 py-2.5 text-sm font-medium text-muted">
                        <VideoIcon className="h-4 w-4" /> Link will be provided soon!
                      </div>
                    )}
                    {formatHasOnline(post.meetingFormat) && isAdmin && meetingOptions.length === 0 && !post.zoomLink && post.zoomLinkTbd && (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <VideoIcon className="h-4 w-4" />
                        The Zoom link will be sent before the meeting.
                      </div>
                    )}
                    {formatHasOnline(post.meetingFormat) && isAdmin && meetingOptions.length === 0 && post.zoomLink && (
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={post.zoomLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
                        >
                          <VideoIcon className="h-4 w-4" /> Join meeting
                        </a>
                        <CopyButton
                          text={post.zoomLink}
                          label="Copy link"
                          className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-muted transition hover:text-foreground"
                        />
                        {post.zoomCode && (
                          <span className="ml-auto flex items-center gap-2">
                            <span className="text-sm text-muted">Passcode</span>
                            <span className="rounded bg-surface-2 px-2.5 py-1 font-mono text-sm tracking-widest text-foreground">
                              {post.zoomCode}
                            </span>
                            <CopyButton
                              text={post.zoomCode}
                              label="Copy"
                              className="rounded-md border border-border-strong px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                            />
                          </span>
                        )}
                      </div>
                    )}
                    {formatHasAddress(post.meetingFormat) && post.meetingAddress && (
                      <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                        <PinIcon className="h-4 w-4 text-muted" />
                        <span>{post.meetingAddress}</span>
                        <CopyButton
                          text={post.meetingAddress}
                          label="Copy"
                          className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-muted transition hover:text-foreground"
                        />
                      </div>
                    )}

                    {/* author/admin: add or update the Zoom link + passcode */}
                    {formatHasOnline(post.meetingFormat) && canManageLink && (
                      <details
                        className="rounded-lg border border-border bg-surface-2"
                        open={!post.zoomLink || undefined}
                      >
                        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
                          {post.zoomLink ? "Edit Zoom link / passcode" : "Add the Zoom link"}
                        </summary>
                        <form
                          action={setMeetingLink.bind(null, post.id)}
                          className="space-y-2 px-3 pb-3"
                        >
                          <input
                            name="zoomLink"
                            type="url"
                            defaultValue={post.zoomLink || ""}
                            placeholder="https://zoom.us/j/..."
                            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                          />
                          <input
                            name="zoomCode"
                            type="text"
                            defaultValue={post.zoomCode || ""}
                            placeholder="Passcode (optional)"
                            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                          />
                          <button
                            type="submit"
                            className="rounded-md bg-brand-light px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-brand"
                          >
                            Save link
                          </button>
                        </form>
                      </details>
                    )}
                  </div>
                )}

                {post.meetingResponseDueAt && (
                  <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-3 px-3 py-1 text-xs font-medium text-muted">
                    Response needed by{" "}
                    {new Date(post.meetingResponseDueAt).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                )}

                {/* my response: pick / confirm / change (client component) */}
                {iCanPick && (
                  <MeetingResponse
                    postId={post.id}
                    options={meetingOptions}
                    multiPick={!!post.meetingMultiPick}
                    online={formatHasOnline(post.meetingFormat)}
                    isAdmin={isAdmin}
                    defaultLink={post.zoomLink}
                    defaultCode={post.zoomCode}
                    myPicks={myPicks}
                    myResponse={
                      myResponse
                        ? { cantMakeIt: myResponse.cantMakeIt, reason: myResponse.reason }
                        : null
                    }
                    lockedAll={myLocks.lockedAll}
                    lockedSeriesIds={myLocks.lockedSeriesIds}
                    setChoices={setMeetingChoices}
                    attend={attendMeeting}
                    cantMake={cantMakeMeeting}
                  />
                )}
                {meeting && !iCanPick && (
                  <p className="mt-4 text-xs text-muted">
                    You&apos;re not on the invite list for this meeting.
                  </p>
                )}

                {meetingRoster && (
                  <OverrideProvider>
                  <div className="mt-5 rounded-xl border border-border bg-surface p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        Responses{" "}
                        <span className="text-muted">
                          ({meetingRoster.responded} of {meetingRoster.total} responded
                          {meetingRoster.total
                            ? ` · ${Math.round((meetingRoster.responded / meetingRoster.total) * 100)}%`
                            : ""}
                          )
                        </span>
                      </p>
                      <OverrideToggle />
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{
                          width: `${meetingRoster.total ? Math.round((meetingRoster.responded / meetingRoster.total) * 100) : 0}%`,
                        }}
                      />
                    </div>

                    {/* Going */}
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Going{" "}
                        <span className="ml-1 rounded-full bg-surface-3 px-2 py-0.5 text-xs text-foreground">
                          {meetingRoster.goingCount}
                        </span>
                      </p>
                      {meetingOptions.length > 0 ? (
                        meetingRoster.bySession.map(({ option, users }) => {
                          const present = users.filter((u) => u.attended === "present").length;
                          const absent = users.filter((u) => u.attended === "absent").length;
                          return (
                            <div key={option.id} className="mt-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium text-foreground">
                                  {option.seriesLabel ? `${option.seriesLabel}: ` : ""}
                                  {option.label}
                                </span>
                                <span className="text-xs text-muted">
                                  {users.length} going
                                  {present || absent ? ` · ${present} present · ${absent} absent` : ""}
                                </span>
                              </div>
                              {users.length === 0 ? (
                                <p className="py-1 text-xs text-faint">nobody yet</p>
                              ) : (
                                users.map((u) => (
                                  <PersonRow
                                    key={u.id}
                                    user={u}
                                    rollPostId={post.id}
                                    optionId={option.id}
                                    extra={
                                      <PersonKebab
                                        postId={post.id}
                                        userId={u.id}
                                        currentOptionId={option.id}
                                        moveTargets={meetingRoster.sessions.filter((s) => s.id !== option.id)}
                                        move={adminMoveSession}
                                        remove={adminRemoveFromMeeting}
                                      />
                                    }
                                  />
                                ))
                              )}
                              <div className="pt-1">
                                <AddToSession
                                  postId={post.id}
                                  optionId={option.id}
                                  candidates={meetingRoster.audience.filter(
                                    (a) => !users.some((u) => u.id === a.id),
                                  )}
                                  add={adminAddToSession}
                                />
                              </div>
                            </div>
                          );
                        })
                      ) : meetingRoster.singleGoing.length === 0 ? (
                        <p className="py-1 text-xs text-faint">nobody yet</p>
                      ) : (
                        meetingRoster.singleGoing.map((u) => (
                          <PersonRow
                            key={u.id}
                            user={u}
                            rollPostId={post.id}
                            extra={
                              <PersonKebab
                                postId={post.id}
                                userId={u.id}
                                currentOptionId={null}
                                moveTargets={[]}
                                move={adminMoveSession}
                                remove={adminRemoveFromMeeting}
                              />
                            }
                          />
                        ))
                      )}
                    </div>

                    {/* Can't make it */}
                    {meetingRoster.cantUsers.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                          Can&apos;t make it{" "}
                          <span className="ml-1 rounded-full bg-surface-3 px-2 py-0.5 text-xs text-foreground">
                            {meetingRoster.cantUsers.length}
                          </span>
                        </p>
                        {meetingRoster.cantUsers.map((u) => (
                          <PersonRow key={u.id} user={u} reason={u.reason} />
                        ))}
                      </div>
                    )}

                    {/* Can't attend specific series (partial declines) */}
                    {meetingRoster.seriesCantList?.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                          Can&apos;t attend a series
                        </p>
                        {meetingRoster.seriesCantList.map((s) => (
                          <div key={s.label} className="mt-2">
                            <p className="text-sm font-medium text-foreground">
                              {s.label}{" "}
                              <span className="text-xs text-muted">
                                {`· ${s.users.length} can't attend`}
                              </span>
                            </p>
                            {s.users.map((u) => (
                              <PersonRow key={u.id} user={u} reason={u.reason} />
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* No response */}
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                        No response yet{" "}
                        <span className="ml-1 rounded-full bg-surface-3 px-2 py-0.5 text-xs text-foreground">
                          {meetingRoster.noResponse.length}
                        </span>
                      </p>
                      {meetingRoster.noResponse.length === 0 ? (
                        <p className="py-1 text-sm text-foreground">everyone responded.</p>
                      ) : (
                        meetingRoster.noResponse.map((u) => (
                          <PersonRow
                            key={u.id}
                            user={u}
                            extra={
                              <RecordResponse
                                postId={post.id}
                                userId={u.id}
                                sessions={meetingRoster.sessions}
                                hasSessions={meetingOptions.length > 0}
                                isSeries={meetingRoster.isSeries}
                                seriesGroups={meetingRoster.seriesGroups}
                                addToSession={adminAddToSession}
                                setGoing={adminSetGoing}
                                cantMake={adminSetCantMake}
                                record={adminRecordChoices}
                              />
                            }
                          />
                        ))
                      )}
                    </div>
                  </div>
                  </OverrideProvider>
                )}
              </div>
            )}

            {post.imageUrl && (
              <div className="mx-auto mt-5 max-w-2xl px-6 sm:px-8">
                <div className="overflow-hidden rounded-lg border border-border">
                  <Image
                    src={post.imageUrl}
                    alt=""
                    width={1600}
                    height={1200}
                    unoptimized
                    className="h-auto w-full object-cover"
                  />
                </div>
              </div>
            )}

            <div className="mx-auto mt-5 max-w-2xl px-6 sm:px-8">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className={`rounded-full px-2.5 py-0.5 font-medium ${tagClass}`}>
                  {post.tag}
                </span>
                {!meeting && expired && (
                  <span className="rounded bg-surface-3 px-1.5 py-0.5 font-medium text-muted">
                    Past due
                  </span>
                )}
                {!meeting && post.expiresAt && !expired && (
                  <span>due {new Date(post.expiresAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {!isDraft && (
        <footer
          className={`mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-sm ${
            changelog ? "" : "px-6 pb-5 sm:px-8"
          }`}
        >
          <form action={toggleLike.bind(null, post.id)}>
            <button
              type="submit"
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition hover:bg-rose-50 ${
                liked ? "text-rose-600" : "text-muted"
              }`}
            >
              <HeartIcon filled={liked} className="h-4 w-4" />
              <span className="text-xs font-medium">{post._count.likes}</span>
            </button>
          </form>
          <div className="ml-auto flex items-center gap-1 text-xs">
            {canSend && !isDraft && (
              <SendEmailDialog
                action={sendAnnouncementEmail.bind(null, post.id)}
                title={post.title || "Announcement"}
                requireAck={post.requireAck}
                fromAddress={fromAddress}
                staffByTitle={staffByTitle}
                everyoneTotal={emailEveryoneTotal}
                defaultEveryone={post.ackEveryone}
                defaultTitles={post.ackTitles || []}
                defaultUserIds={post.ackUserIds || []}
              />
            )}
            {canPin && (
              <form action={togglePin.bind(null, post.id)} className="flex">
                <button
                  type="submit"
                  className="inline-flex items-center rounded-md px-2 py-1 font-medium text-muted transition hover:bg-amber-50 hover:text-amber-800"
                >
                  {post.pinnedAt ? "Unpin" : "Pin"}
                </button>
              </form>
            )}
            {canEditPost && (
              <Link
                href={`/portal/announcements/${post.id}/edit`}
                className="inline-flex items-center rounded-md px-2 py-1 font-medium text-muted transition hover:bg-surface-3"
              >
                Edit
              </Link>
            )}
            {canDeletePost && (
              <form action={deletePost.bind(null, post.id)} className="flex">
                <ConfirmButton
                  message="Delete this announcement? This can't be undone."
                  className="inline-flex items-center rounded-md px-2 py-1 font-medium text-rose-600 transition hover:bg-rose-50"
                >
                  Delete
                </ConfirmButton>
              </form>
            )}
          </div>
        </footer>
        )}
        {/* the footer normally provides bottom padding; add it back on a draft */}
        {isDraft && <div aria-hidden className="h-8" />}
      </article>

      {/* acknowledgments - non-meeting only (meetings use the RSVP response) */}
      {post.requireAck && !meeting && (
        <div className="mt-6 space-y-4">
          {sentCount != null && (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
              {sentCount > 0
                ? `Emailed ${sentCount} ${sentCount === 1 ? "person" : "people"} who hadn't acknowledged yet.`
                : "Everyone on the list has already acknowledged - no emails sent."}
            </div>
          )}

          {/* staff "I read this" box - only for the expected list */}
          {iMustAck &&
            (myAck ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                <HeartlessCheck className="h-5 w-5 shrink-0" />
                <span>
                  You acknowledged this on{" "}
                  {new Date(myAck.createdAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {myAck.viaEmail && " (via email)"}.
                </span>
              </div>
            ) : (
              <form
                action={acknowledge.bind(null, post.id)}
                className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4 dark:border-sky-900 dark:bg-sky-950/40"
              >
                <div className="flex items-start gap-3">
                  <CheckboxIcon className="h-6 w-6 shrink-0 text-brand" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-brand-dark dark:text-sky-100">
                      Your acknowledgment is requested for this announcement.
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-brand-dark/80 dark:text-sky-200/80">
                      By clicking below, you acknowledge that you have read and
                      understood the contents of this announcement.
                    </p>
                  </div>
                </div>
                <button
                  type="submit"
                  className="mt-3 w-full rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand sm:w-auto"
                >
                  Acknowledge that I&apos;ve read this
                </button>
              </form>
            ))}

          {/* roster - Supervisor+ and the author */}
          {roster && (
            <OverrideProvider>
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-foreground">
                    {roster.acked.length}
                  </span>
                  <span className="text-sm text-muted">
                    of {roster.total} acknowledged · {roster.pct}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <OverrideToggle />
                  {!isDraft && (
                    <AckEmailAction
                      postId={post.id}
                      send={sendAckEmails}
                      notYetCount={roster.notYet.length}
                      isMeeting={meeting}
                    />
                  )}
                </div>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${roster.pct}%` }}
                />
              </div>
              {post.ackEmailSentAt && (
                <p className="mt-2 text-xs text-muted">
                  Last emailed{" "}
                  {new Date(post.ackEmailSentAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                  . Re-sending only emails staff who haven&apos;t acknowledged.
                </p>
              )}

              <div className="mt-4 grid gap-5 border-t border-border pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    Acknowledged ({roster.acked.length})
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {roster.acked.length === 0 && (
                      <li className="text-sm text-muted">No one yet.</li>
                    )}
                    {roster.acked.map((u) => (
                      <li
                        key={u.id}
                        className="flex items-center justify-between gap-2 text-sm text-foreground"
                      >
                        <NameHover user={nhUser(u)} className="truncate" />
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                          {u.ack.viaEmail ? (
                            <MailIcon className="h-3.5 w-3.5" />
                          ) : (
                            <MonitorIcon className="h-3.5 w-3.5" />
                          )}
                          {ackDateFmt(u.ack.createdAt)}
                          {u.recordedBy && (
                            <span className="italic text-faint">· by {u.recordedBy}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted">
                    Not yet ({roster.notYet.length})
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {roster.notYet.length === 0 && (
                      <li className="text-sm text-muted">Everyone&apos;s in.</li>
                    )}
                    {roster.notYet.map((u) => (
                      <li key={u.id} className="flex items-center gap-2 text-sm text-foreground">
                        <NameHover user={nhUser(u)} className="truncate" />
                        <MarkAckButton postId={post.id} userId={u.id} markAck={markAckFor} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
                <MailIcon className="h-3.5 w-3.5" /> via email
                <span className="mx-1">·</span>
                <MonitorIcon className="h-3.5 w-3.5" /> in the portal
              </p>
            </div>
            </OverrideProvider>
          )}
        </div>
      )}

      {/* comments - hidden on a draft preview (no commenting before it's posted) */}
      {!isDraft && (
        <div className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {post.comments.length}{" "}
          {post.comments.length === 1 ? "comment" : "comments"}
        </h2>

        <div className="mt-4 space-y-3">
          {post.comments.map((c) => {
            const canDeleteThis = c.authorId === user.id || isModerator(user.role);
            return (
              <div key={c.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <AuthorPreview author={c.author} size="sm" showRole={canSeeRoles(user.role)} />
                    <div className="mt-0.5 text-xs text-muted">
                      {timeAgo(c.createdAt)}
                      {c.editedAt && <span> · edited</span>}
                    </div>
                  </div>
                  {canDeleteThis && (
                    <form action={deleteComment.bind(null, c.id)}>
                      <ConfirmButton
                        message="Delete this comment?"
                        className="text-xs font-medium text-rose-600 transition hover:text-rose-700"
                      >
                        Delete
                      </ConfirmButton>
                    </form>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {c.content}
                </p>
              </div>
            );
          })}
        </div>

        <form
          action={addComment.bind(null, post.id)}
          className="mt-5 rounded-xl border border-border bg-surface p-4"
        >
          <label htmlFor="content" className="block text-sm font-medium text-muted">
            Add a comment
          </label>
          <textarea
            id="content"
            name="content"
            required
            rows={3}
            maxLength={COMMENT_CONTENT_MAX}
            placeholder="Share your thoughts..."
            className="mt-2 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-brand-light px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
            >
              Comment
            </button>
          </div>
        </form>
        </div>
      )}
    </section>
  );
}

function HeartIcon({ filled, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 17s-6-3.5-6-8a3.5 3.5 0 0 1 6-2.45A3.5 3.5 0 0 1 16 9c0 4.5-6 8-6 8z" />
    </svg>
  );
}

function HeartlessCheck({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  );
}

function CheckboxIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

function MailIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function MonitorIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

function VideoIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3" />
    </svg>
  );
}

function PinIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function CheckMini({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10l4 4 8-9" />
    </svg>
  );
}

function ClockIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
