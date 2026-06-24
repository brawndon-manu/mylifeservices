import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isModerator, isElevated, canSeeRoles } from "@/lib/roles";
import {
  POST_TAGS,
  TAG_STYLES,
  isValidTag,
  TIME_WINDOWS,
  isValidWindow,
  windowCutoff,
  timeAgo,
  isExpired,
} from "@/lib/hub";
import AuthorChip from "./_components/AuthorChip";
import ConfirmButton from "@/components/ConfirmButton";
import { toggleLike, togglePin, deletePost } from "./actions";

export const metadata = {
  title: "MLS Hub",
  robots: { index: false, follow: false },
};

export default async function HubPage({ searchParams }) {
  const user = await getCurrentUser();
  const params = await searchParams;

  // sanitize query params - default to "all time", no tag filter, dont
  // hide expired by default.
  const windowVal = isValidWindow(params?.window) ? params.window : "all";
  const tagFilter = isValidTag(params?.tag) ? params.tag : null;
  const pinnedOnly = params?.pinned === "1";

  // build the prisma where clause
  const where = {
    deletedAt: null,
  };
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

  const posts = await prisma.post.findMany({
    where,
    orderBy: [
      // pinned first, newest first
      { pinnedAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    include: {
      author: { select: { id: true, name: true, role: true, email: true } },
      postedBy: { select: { id: true, name: true } },
      _count: { select: { comments: true, likes: true } },
      likes: {
        where: { userId: user.id },
        select: { userId: true },
      },
    },
    take: 50,
  });

  // partition: expired posts drop below active ones (unless pinned)
  const activeOrPinned = posts.filter((p) => p.pinnedAt || !isExpired(p));
  const expiredUnpinned = posts.filter((p) => !p.pinnedAt && isExpired(p));
  const ordered = [...activeOrPinned, ...expiredUnpinned];

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
            MLS Hub
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Share with the team
          </h1>
          <p className="mt-2 text-sm text-muted">
            Post flyers, helpful resources, or things worth knowing. Comment
            and react on anyone&apos;s post.
          </p>
        </div>
        <Link
          href="/portal/hub/new"
          className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          + New post
        </Link>
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
            <option value="">All tags</option>
            {POST_TAGS.map((t) => (
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
            href="/portal/hub"
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
              Nothing here yet. Be the first to post.
            </p>
          </div>
        ) : (
          ordered.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              currentUser={user}
            />
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
  const canEdit = post.authorId === currentUser.id;
  const tagClass =
    TAG_STYLES[post.tag] ?? "bg-surface-3 text-muted";

  return (
    <article className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div>
          <AuthorChip author={post.author} size="md" showRole={canSeeRoles(currentUser.role)} />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{timeAgo(post.createdAt)}</span>
            {post.editedAt && <span>· edited</span>}
            {post.postedBy && isElevated(currentUser.role) && (
              <span className="italic">
                · posted on their behalf by {post.postedBy.name || "staff"}
              </span>
            )}
            {post.pinnedAt && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
                Pinned
              </span>
            )}
            {expired && (
              <span className="rounded bg-surface-3 px-1.5 py-0.5 font-medium text-muted">
                Expired
              </span>
            )}
            {post.expiresAt && !expired && (
              <span className="text-muted">
                expires {new Date(post.expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tagClass}`}
        >
          {post.tag}
        </span>
      </header>

      <Link href={`/portal/hub/${post.id}`} className="mt-3 block">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground line-clamp-6">
          {post.content}
        </p>
        {post.imageUrl && (
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            {/* unoptimized so Vercel Blob URLs work without an Image
                optimization round-trip - saves bandwidth quota. */}
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
      </Link>

      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
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
          href={`/portal/hub/${post.id}`}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted transition hover:bg-surface-3"
        >
          <CommentIcon className="h-4 w-4" />
          <span className="text-xs font-medium">{post._count.comments}</span>
        </Link>
        <div className="ml-auto flex items-center gap-1 text-xs">
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
          {canEdit && (
            <Link
              href={`/portal/hub/${post.id}/edit`}
              className="rounded-md px-2 py-1 font-medium text-muted transition hover:bg-surface-3"
            >
              Edit
            </Link>
          )}
          {canDelete && (
            <form action={deletePost.bind(null, post.id)}>
              <ConfirmButton
                message="Delete this post? This can't be undone."
                className="rounded-md px-2 py-1 font-medium text-rose-600 transition hover:bg-rose-50"
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
