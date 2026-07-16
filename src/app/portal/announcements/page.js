import Link from "next/link";
import Image from "next/image";
import { renderMarkdown } from "@/lib/markdown";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isModerator, isElevated, isSupervisorUp, canSeeRoles, isSuper } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import {
  TIME_WINDOWS,
  isValidWindow,
  windowCutoff,
  timeAgo,
  isExpired,
} from "@/lib/hub";
import {
  ANNOUNCEMENT_TAGS,
  ANNOUNCEMENT_TAG_STYLES,
  isValidAnnouncementTag,
  isChangelog,
  isCompanyMeeting,
  isEvent,
  eventAudienceLabel,
  isAckExempt,
  canSeeAnnouncement,
} from "@/lib/announcements";
import AuthorPreview from "./_components/AuthorPreview";
import ConfirmButton from "@/components/ConfirmButton";
import BackLink from "@/components/BackLink";
import { toggleLike, togglePin, deletePost } from "./actions";

export const metadata = {
  title: "Announcements · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function AnnouncementsPage({ searchParams }) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const canPost = isSupervisorUp(user.role);

  const windowVal = isValidWindow(params?.window) ? params.window : "all";
  const tagFilter = isValidAnnouncementTag(params?.tag) ? params.tag : null;
  const pinnedOnly = params?.pinned === "1";

  // only published posts in the feed - drafts (publishedAt null) live in preview
  // until the author publishes them.
  const where = { deletedAt: null, publishedAt: { not: null } };
  const cutoff = windowCutoff(windowVal);
  if (cutoff) {
    where.createdAt = { gte: cutoff };
  }
  if (tagFilter) {
    where.tag = tagFilter;
  }
  if (pinnedOnly) {
    where.pinnedAt = { not: null };
  }

  const posts = await prisma.announcement.findMany({
    where,
    orderBy: [
      { pinnedAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    include: {
      author: { select: { id: true, name: true, preferredFirstName: true, preferredLastName: true, role: true, email: true, title: true, image: true, phone: true } },
      postedBy: { select: { id: true, name: true, preferredFirstName: true, preferredLastName: true } },
      _count: { select: { comments: true, likes: true } },
      likes: {
        where: { userId: user.id },
        select: { userId: true },
      },
      acks: {
        where: { userId: user.id },
        select: { userId: true },
      },
    },
    take: 50,
  });

  // visibility gate: meetings + ack-required posts only show to their invited
  // audience (admins + the author always see them); everything else is public.
  const visible = posts.filter((p) => canSeeAnnouncement(p, user));
  const activeOrPinned = visible.filter((p) => p.pinnedAt || !isExpired(p));
  const expiredUnpinned = visible.filter((p) => !p.pinnedAt && isExpired(p));
  const ordered = [...activeOrPinned, ...expiredUnpinned];

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <BackLink href="/portal">Back to Dashboard</BackLink>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
            Portal
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Announcements
          </h1>
          <p className="mt-2 text-sm text-muted">
            Company updates, events, meetings, and changelog notes. Comment and
            react on any post, and RSVP or acknowledge when it&apos;s asked.
          </p>
        </div>
        {canPost && (
          <Link
            href="/portal/announcements/new"
            className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            + New announcement
          </Link>
        )}
      </div>

      {/* filter bar */}
      <form
        method="GET"
        className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 text-sm"
      >
        <label className="flex items-center gap-2">
          <span className="text-muted">Time:</span>
          <select
            name="window"
            defaultValue={windowVal}
            className="rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-foreground"
          >
            {TIME_WINDOWS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted">Tag:</span>
          <select
            name="tag"
            defaultValue={tagFilter ?? ""}
            className="rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-foreground"
          >
            <option value="">All types</option>
            {ANNOUNCEMENT_TAGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="pinned"
            value="1"
            defaultChecked={pinnedOnly}
            className="h-4 w-4 accent-brand"
          />
          <span className="text-muted">Pinned only</span>
        </label>
        <button
          type="submit"
          className="rounded-md border border-border-strong px-3 py-1 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
        >
          Apply
        </button>
        {(windowVal !== "all" || tagFilter || pinnedOnly) && (
          <Link
            href="/portal/announcements"
            className="text-xs font-medium text-muted underline-offset-2 hover:text-muted hover:underline"
          >
            Reset
          </Link>
        )}
      </form>

      {/* feed */}
      <div className="mt-6 space-y-5">
        {ordered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center">
            <p className="text-sm text-muted">
              {canPost
                ? "Nothing here yet. Post the first announcement."
                : "No announcements yet. Check back soon."}
            </p>
          </div>
        ) : (
          ordered.map((p) => (
            <PostCard key={p.id} post={p} currentUser={user} />
          ))
        )}
      </div>
    </section>
  );
}

function PostCard({ post, currentUser }) {
  const expired = isExpired(post);
  const liked = post.likes.length > 0;
  const canDelete =
    post.authorId === currentUser.id || isModerator(currentUser.role);
  const canPin = isModerator(currentUser.role);
  const canEdit = post.authorId === currentUser.id || isSuper(currentUser.role);
  const iAcked = post.acks?.length > 0;
  const iMustAck = !isAckExempt(currentUser);
  const tagClass = ANNOUNCEMENT_TAG_STYLES[post.tag] ?? "bg-surface-3 text-muted";
  const changelog = isChangelog(post.tag);
  const meeting = isCompanyMeeting(post.tag);
  const event = isEvent(post.tag);
  const eventWhen = event && post.eventAt
    ? `${new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: post.eventTimezone || "America/Los_Angeles" }).format(post.eventAt)} · ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: post.eventTimezone || "America/Los_Angeles" }).format(post.eventAt)}`
    : null;
  const eventWhere = event ? post.eventLocationName || post.eventAddress : null;
  // changelog preview: render the markdown body and estimate a reading time
  // (~200 words/min). plain announcements render a faded markdown preview too.
  const changelogHtml = changelog ? renderMarkdown(post.content) : null;
  const previewHtml = !changelog ? renderMarkdown(post.content) : null;
  const readMins = changelog
    ? Math.max(1, Math.round((post.content || "").split(/\s+/).filter(Boolean).length / 200))
    : 0;

  return (
    <article className="group relative rounded-xl border border-border bg-surface p-5 shadow-sm card-lift">
      <header className="flex items-start justify-between gap-3">
        <div>
          <AuthorPreview author={post.author} size="md" showRole={canSeeRoles(currentUser.role)} />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{timeAgo(post.createdAt)}</span>
            {post.editedAt && <span>· edited</span>}
            {post.postedBy && isElevated(currentUser.role) && (
              <span className="italic">
                · posted on their behalf by {preferredName(post.postedBy) || "staff"}
              </span>
            )}
            {post.pinnedAt && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
                Pinned
              </span>
            )}
            {!meeting && expired && (
              <span className="rounded bg-surface-3 px-1.5 py-0.5 font-medium text-muted">
                Past due
              </span>
            )}
            {!meeting && post.expiresAt && !expired && (
              <span className="text-muted">
                due {new Date(post.expiresAt).toLocaleDateString()}
              </span>
            )}
            {!meeting && post.requireAck &&
              (iAcked ? (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  Acknowledged
                </span>
              ) : iMustAck ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                  Acknowledgment needed
                </span>
              ) : (
                <span className="rounded bg-surface-3 px-1.5 py-0.5 font-medium text-muted">
                  Acknowledgment requested
                </span>
              ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tagClass}`}>
            {post.tag}
          </span>
          {event && post.eventAudience && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                post.eventAudience === "client"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                  : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
              }`}
            >
              {eventAudienceLabel(post.eventAudience)}
            </span>
          )}
        </div>
      </header>

      {changelog ? (
        <div className="mt-3">
          <Link
            href={`/portal/announcements/${post.id}`}
            className="block text-lg font-semibold text-foreground transition before:absolute before:inset-0 group-hover:text-brand"
          >
            {post.title || "Changelog"}
          </Link>
          {/* faded rich preview of the changelog body */}
          <div
            className="mt-2 max-h-40 overflow-hidden text-sm leading-relaxed text-muted [-webkit-mask-image:linear-gradient(to_bottom,#000_55%,transparent)] [mask-image:linear-gradient(to_bottom,#000_55%,transparent)] [&_a]:text-brand [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-medium [&_h1]:text-foreground [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-foreground [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-foreground [&_li]:marker:text-faint [&_ol]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-1.5 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:mt-1.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: changelogHtml }}
          />
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs text-muted">{readMins} min read</span>
            <span className="text-sm font-medium text-brand transition group-hover:text-brand-dark">
              Read the changelog →
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Link
            href={`/portal/announcements/${post.id}`}
            className="block text-lg font-semibold text-foreground transition before:absolute before:inset-0 group-hover:text-brand"
          >
            {post.title || "Announcement"}
          </Link>
          {event && (eventWhen || eventWhere) && (
            <div className="relative z-10 mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border bg-background px-3 py-2 text-xs">
              {eventWhen && (
                <span className="font-medium text-foreground">
                  <span className="mr-1 text-faint">When</span>
                  {eventWhen}
                </span>
              )}
              {eventWhere && (
                <span className="font-medium text-foreground">
                  <span className="mr-1 text-faint">Where</span>
                  {eventWhere}
                </span>
              )}
            </div>
          )}
          <div
            className="mt-2 max-h-28 overflow-hidden text-sm leading-relaxed text-muted [-webkit-mask-image:linear-gradient(to_bottom,#000_55%,transparent)] [mask-image:linear-gradient(to_bottom,#000_55%,transparent)] [&_a]:text-brand [&_h1]:mt-2 [&_h1]:text-base [&_h1]:font-medium [&_h1]:text-foreground [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-foreground [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-foreground [&_li]:marker:text-faint [&_ol]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-1.5 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:mt-1.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
          {post.imageUrl && (
            <div className="mt-3 overflow-hidden rounded-lg border border-border">
              <Image
                src={post.imageUrl}
                alt=""
                width={1200}
                height={800}
                unoptimized
                className="h-auto w-full object-cover"
              />
            </div>
          )}
        </div>
      )}

      <footer className="relative z-10 mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
        <form action={toggleLike.bind(null, post.id)}>
          <button
            type="submit"
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition hover:bg-rose-50 ${
              liked ? "text-rose-600" : "text-muted"
            }`}
            aria-label={liked ? "Unlike" : "Like"}
          >
            <HeartIcon filled={liked} className="h-4 w-4" />
            <span className="text-xs font-medium">{post._count.likes}</span>
          </button>
        </form>
        <Link
          href={`/portal/announcements/${post.id}`}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted transition hover:bg-surface-3"
        >
          <CommentIcon className="h-4 w-4" />
          <span className="text-xs font-medium">{post._count.comments}</span>
        </Link>
        <div className="ml-auto flex items-center gap-1 text-xs">
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
          {canEdit && (
            <Link
              href={`/portal/announcements/${post.id}/edit`}
              className="inline-flex items-center rounded-md px-2 py-1 font-medium text-muted transition hover:bg-surface-3"
            >
              Edit
            </Link>
          )}
          {canDelete && (
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
    </article>
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

function CommentIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 5h14v9H7l-4 3V5z" />
    </svg>
  );
}
