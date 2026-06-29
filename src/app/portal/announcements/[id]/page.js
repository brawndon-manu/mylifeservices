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
} from "@/lib/announcements";
import AuthorChip from "../../hub/_components/AuthorChip";
import Avatar from "@/components/Avatar";
import ConfirmButton from "@/components/ConfirmButton";
import SendEmailDialog from "../_components/SendEmailDialog";
import CopyButton from "../_components/CopyButton";
import MeetingTime from "../_components/MeetingTime";
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
  chooseMeetingOption,
} from "../actions";

export const metadata = {
  title: "Announcement · MLS Portal",
  robots: { index: false, follow: false },
};

const ERRORS = {
  comment: "Comment cant be blank.",
  forbidden: "You dont have permission to do that.",
  emailConfig: "Email isnt configured yet. Add the announcements sender to the env.",
  recipients: "Pick at least one group to send to.",
};

// shared markdown body styling for both the changelog + the new announcement
// layout, so they read the same.
const PROSE =
  "text-[15px] leading-relaxed text-foreground [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_li]:marker:text-faint [&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_strong]:font-semibold [&_strong]:text-foreground [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_em]:italic [&_hr]:my-6 [&_hr]:border-border [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_pre]:mt-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-2 [&_pre]:p-3";

export default async function AnnouncementDetailPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const errorMessage = sp?.error ? ERRORS[sp.error] : null;

  const user = await getCurrentUser();

  const post = await prisma.announcement.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, preferredFirstName: true, preferredLastName: true, role: true, email: true, image: true, title: true } },
      postedBy: { select: { id: true, name: true, preferredFirstName: true, preferredLastName: true } },
      likes: { where: { userId: user.id }, select: { userId: true } },
      acks: { where: { userId: user.id }, select: { viaEmail: true, createdAt: true } },
      meetingChoices: { where: { userId: user.id }, select: { optionId: true } },
      _count: { select: { likes: true } },
      comments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, preferredFirstName: true, preferredLastName: true, role: true, email: true } },
        },
      },
    },
  });

  if (!post || post.deletedAt) notFound();

  const expired = isExpired(post);
  const liked = post.likes.length > 0;
  const canDeletePost = post.authorId === user.id || isModerator(user.role);
  const canEditPost = post.authorId === user.id;
  const canPin = isModerator(user.role);
  const tagClass = ANNOUNCEMENT_TAG_STYLES[post.tag] ?? "bg-surface-3 text-muted";
  const changelog = isChangelog(post.tag);
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
  const iMustAck = post.ackEveryone
    ? !isAckExempt(user)
    : (post.ackTitles || []).some(titleMatches) ||
      (post.ackUserIds || []).includes(user.id);
  // roster is visible to anyone who can post (Supervisor+) plus the author.
  const canSeeRoster = isSupervisorUp(user.role) || post.authorId === user.id;
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
  if (post.requireAck && canSeeRoster) {
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
        },
        orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
      }),
      prisma.announcementAck.findMany({
        where: { announcementId: id },
        select: { userId: true, viaEmail: true, createdAt: true },
      }),
    ]);
    const ackMap = new Map(acks.map((a) => [a.userId, a]));
    const acked = expectedUsers
      .filter((u) => ackMap.has(u.id))
      .map((u) => ({ ...u, ack: ackMap.get(u.id) }))
      .sort((a, b) => b.ack.createdAt - a.ack.createdAt);
    const notYet = expectedUsers.filter((u) => !ackMap.has(u.id));
    const total = expectedUsers.length;
    const pct = total ? Math.round((acked.length / total) * 100) : 0;
    roster = { acked, notYet, total, pct };
  }

  // ---- Company Meeting ----
  const meeting = isCompanyMeeting(post.tag);
  const meetingOptions = Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  const myPicks = (post.meetingChoices || []).map((c) => c.optionId);
  // can I pick a session? = in the meeting audience (same membership as ack).
  const iCanPick = post.ackEveryone
    ? !isAckExempt(user)
    : (post.ackTitles || []).some(titleMatches) ||
      (post.ackUserIds || []).includes(user.id);

  let meetingRoster = null;
  if (meeting && meetingOptions.length && canSeeRoster) {
    const [audienceUsers, choices] = await Promise.all([
      prisma.user.findMany({
        where: ackAudienceWhere(post),
        select: { id: true, name: true, preferredFirstName: true, preferredLastName: true },
        orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
      }),
      prisma.announcementMeetingChoice.findMany({
        where: { announcementId: id },
        select: { userId: true, optionId: true },
      }),
    ]);
    const audIds = new Set(audienceUsers.map((u) => u.id));
    const chosenUserIds = new Set(
      choices.filter((c) => audIds.has(c.userId)).map((c) => c.userId),
    );
    const counts = {};
    for (const o of meetingOptions) counts[o.id] = 0;
    for (const c of choices) {
      if (audIds.has(c.userId) && counts[c.optionId] !== undefined) counts[c.optionId]++;
    }
    const notPicked = audienceUsers.filter((u) => !chosenUserIds.has(u.id));
    meetingRoster = {
      counts,
      notPicked,
      total: audienceUsers.length,
      picked: chosenUserIds.size,
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
        href="/portal/announcements"
        className="text-sm font-medium text-muted transition hover:text-brand"
      >
        ← Back to Announcements
      </Link>

      {errorMessage && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          {errorMessage}
        </div>
      )}

      <article
        className={`mt-4 overflow-hidden rounded-xl border border-border shadow-sm ${
          changelog ? "bg-surface p-6 sm:p-8" : "bg-[#eef3fa] dark:bg-[#070912]"
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
            <div className="relative h-52 overflow-hidden sm:h-60">
              {/* soft cloud / dome glow (no grid) */}
              <div
                className="absolute left-1/2 top-[-130px] h-[380px] w-[640px] max-w-[150%] -translate-x-1/2 opacity-60 dark:opacity-100"
                style={{
                  background:
                    "radial-gradient(58% 60% at 50% 50%, rgba(47,111,235,0.50), rgba(47,111,235,0.18) 42%, rgba(47,111,235,0.05) 64%, transparent 78%)",
                }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo/treelogo_dark.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-8 w-28 -translate-x-1/2 opacity-25 dark:opacity-90 dark:brightness-150 dark:drop-shadow-[0_0_30px_rgba(47,111,235,0.9)] sm:w-32"
              />
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-[#eef3fa] dark:to-[#070912]" />
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
              {post.requireAck && (
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

                {(formatHasOnline(post.meetingFormat) || formatHasAddress(post.meetingFormat)) && (
                  <div className="mt-4 space-y-3 rounded-xl border border-border bg-surface p-4">
                    {formatHasOnline(post.meetingFormat) && post.zoomLink && (
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
                  </div>
                )}

                {meetingOptions.length > 0 && (
                  <div className="mt-5">
                    <p className="text-sm font-semibold text-foreground">
                      {post.meetingMultiPick
                        ? "Pick the sessions you'll attend"
                        : "Choose the session you'll attend"}
                    </p>
                    <div className="mt-2 space-y-2">
                      {meetingOptions.map((opt) => {
                        const picked = myPicks.includes(opt.id);
                        return (
                          <form
                            key={opt.id}
                            action={chooseMeetingOption.bind(null, post.id, opt.id)}
                          >
                            <button
                              type="submit"
                              disabled={!iCanPick}
                              className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                                picked
                                  ? "border-brand bg-sky-50 dark:bg-sky-950/30"
                                  : "border-border hover:border-brand-light"
                              } ${iCanPick ? "" : "cursor-default opacity-80"}`}
                            >
                              <span
                                className={`flex h-5 w-5 flex-none items-center justify-center border-2 ${
                                  post.meetingMultiPick ? "rounded" : "rounded-full"
                                } ${picked ? "border-brand bg-brand text-white" : "border-border-strong"}`}
                              >
                                {picked && <CheckMini className="h-3 w-3" />}
                              </span>
                              <span className="flex-1">
                                <span className="block text-sm font-medium text-foreground">
                                  {opt.label}
                                </span>
                                {(opt.at ||
                                  formatDuration(opt.durationFromMin, opt.durationToMin)) && (
                                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                                    {opt.at && <MeetingTime iso={opt.at} setTz={opt.tz} />}
                                    {formatDuration(opt.durationFromMin, opt.durationToMin) && (
                                      <span>
                                        {opt.at ? "· " : ""}
                                        {formatDuration(opt.durationFromMin, opt.durationToMin)}
                                      </span>
                                    )}
                                  </span>
                                )}
                              </span>
                              {picked && (
                                <span className="flex-none text-xs font-medium text-brand">you picked this</span>
                              )}
                            </button>
                          </form>
                        );
                      })}
                    </div>
                    {!iCanPick && (
                      <p className="mt-2 text-xs text-muted">
                        You&apos;re not on the invite list for this meeting.
                      </p>
                    )}
                  </div>
                )}

                {meetingRoster && (
                  <div className="mt-5 rounded-xl border border-border bg-surface p-5">
                    <p className="text-sm font-medium text-foreground">
                      Responses{" "}
                      <span className="text-muted">
                        ({meetingRoster.picked} of {meetingRoster.total} picked)
                      </span>
                    </p>
                    <div className="mt-3 space-y-3">
                      {meetingOptions.map((opt) => {
                        const n = meetingRoster.counts[opt.id] || 0;
                        const pct = meetingRoster.total
                          ? Math.round((n / meetingRoster.total) * 100)
                          : 0;
                        return (
                          <div key={opt.id}>
                            <div className="flex justify-between text-sm text-foreground">
                              <span>{opt.label}</span>
                              <span className="text-muted">{n}</span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3">
                              <div
                                className="h-full rounded-full bg-brand"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 border-t border-border pt-3 text-sm">
                      <span className="text-muted">
                        Haven&apos;t picked ({meetingRoster.notPicked.length}):
                      </span>{" "}
                      {meetingRoster.notPicked.length === 0 ? (
                        <span className="text-foreground">everyone&apos;s in.</span>
                      ) : (
                        <span className="text-foreground">
                          {meetingRoster.notPicked.map((u) => preferredName(u)).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
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
                {expired && (
                  <span className="rounded bg-surface-3 px-1.5 py-0.5 font-medium text-muted">
                    Past due
                  </span>
                )}
                {post.expiresAt && !expired && (
                  <span>due {new Date(post.expiresAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
        )}

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
            {canSend && (
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
              <form action={togglePin.bind(null, post.id)}>
                <button
                  type="submit"
                  className="rounded-md px-2 py-1 font-medium text-muted transition hover:bg-amber-50 hover:text-amber-800"
                >
                  {post.pinnedAt ? "Unpin" : "Pin"}
                </button>
              </form>
            )}
            {canEditPost && (
              <Link
                href={`/portal/announcements/${post.id}/edit`}
                className="rounded-md px-2 py-1 font-medium text-muted transition hover:bg-surface-3"
              >
                Edit
              </Link>
            )}
            {canDeletePost && (
              <form action={deletePost.bind(null, post.id)}>
                <ConfirmButton
                  message="Delete this announcement? This can't be undone."
                  className="rounded-md px-2 py-1 font-medium text-rose-600 transition hover:bg-rose-50"
                >
                  Delete
                </ConfirmButton>
              </form>
            )}
          </div>
        </footer>
      </article>

      {/* acknowledgments */}
      {post.requireAck && (
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
                className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-5 py-4 dark:border-sky-900 dark:bg-sky-950/40"
              >
                <CheckboxIcon className="h-6 w-6 shrink-0 text-brand" />
                <span className="flex-1 text-sm text-brand-dark dark:text-sky-200">
                  Your acknowledgment is requested for this announcement.
                </span>
                <button
                  type="submit"
                  className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
                >
                  I acknowledge I&apos;ve read this
                </button>
              </form>
            ))}

          {/* roster - Supervisor+ and the author */}
          {roster && (
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
                <form action={sendAckEmails.bind(null, post.id)}>
                  <ConfirmButton
                    message={
                      roster.notYet.length
                        ? `Email this announcement to the ${roster.notYet.length} staff who haven't acknowledged yet?`
                        : "Everyone has already acknowledged. Send anyway? (nobody will be emailed.)"
                    }
                    className="inline-flex items-center gap-2 rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-foreground transition hover:bg-surface-3"
                  >
                    <MailIcon className="h-4 w-4" />
                    Send to staff by email
                  </ConfirmButton>
                </form>
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
                        <span className="truncate">{preferredName(u)}</span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                          {u.ack.viaEmail ? (
                            <MailIcon className="h-3.5 w-3.5" />
                          ) : (
                            <MonitorIcon className="h-3.5 w-3.5" />
                          )}
                          {ackDateFmt(u.ack.createdAt)}
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
                      <li key={u.id} className="truncate text-sm text-foreground">
                        {preferredName(u)}
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
          )}
        </div>
      )}

      {/* comments */}
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
                    <AuthorChip author={c.author} size="sm" showRole={canSeeRoles(user.role)} />
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
