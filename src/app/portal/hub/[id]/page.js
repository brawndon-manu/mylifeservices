import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isModerator, isElevated, canSeeRoles } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import {
  TAG_STYLES,
  timeAgo,
  isExpired,
  COMMENT_CONTENT_MAX,
} from "@/lib/hub";
import AuthorChip from "../_components/AuthorChip";
import ConfirmButton from "@/components/ConfirmButton";
import {
  toggleLike,
  togglePin,
  deletePost,
  addComment,
  deleteComment,
} from "../actions";

export const metadata = {
  title: "Post · MLS Hub",
  robots: { index: false, follow: false },
};

const ERRORS = {
  comment: "Comment cant be blank.",
  forbidden: "You dont have permission to do that.",
};

export default async function PostDetailPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const errorMessage = sp?.error ? ERRORS[sp.error] : null;

  const user = await getCurrentUser();

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, preferredFirstName: true, preferredLastName: true, role: true, email: true, title: true, image: true, phone: true } },
      postedBy: { select: { id: true, name: true, preferredFirstName: true, preferredLastName: true } },
      likes: { where: { userId: user.id }, select: { userId: true } },
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

  const expired = isExpired(post);
  const liked = post.likes.length > 0;
  const canDeletePost =
    post.authorId === user.id || isModerator(user.role);
  const canEditPost = post.authorId === user.id;
  const canPin = isModerator(user.role);
  const tagClass = TAG_STYLES[post.tag] ?? "bg-surface-3 text-muted";

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <Link
        href="/portal/hub"
        className="text-sm font-medium text-muted transition hover:text-brand"
      >
        ← Back to Hub
      </Link>

      {errorMessage && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          {errorMessage}
        </div>
      )}

      <article className="mt-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <header className="flex items-start justify-between gap-3">
          <div>
            <AuthorChip author={post.author} size="md" showRole={canSeeRoles(user.role)} />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{timeAgo(post.createdAt)}</span>
              {post.editedAt && <span>· edited</span>}
              {post.postedBy && isElevated(user.role) && (
                <span className="italic">
                  · posted on their behalf by {preferredName(post.postedBy) || "staff"}
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
                <span>
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

        <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-foreground">
          {post.content}
        </p>

        {post.imageUrl && (
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <Image
              src={post.imageUrl}
              alt=""
              width={1600}
              height={1200}
              unoptimized
              className="h-auto w-full object-cover"
            />
          </div>
        )}

        <footer className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-sm">
          <form action={toggleLike.bind(null, post.id)}>
            <button
              type="submit"
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition hover:bg-rose-50 ${
                liked ? "text-rose-600" : "text-muted"
              }`}
            >
              <HeartIcon filled={liked} className="h-4 w-4" />
              <span className="text-xs font-medium">
                {post._count.likes}
              </span>
            </button>
          </form>
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
            {canEditPost && (
              <Link
                href={`/portal/hub/${post.id}/edit`}
                className="rounded-md px-2 py-1 font-medium text-muted transition hover:bg-surface-3"
              >
                Edit
              </Link>
            )}
            {canDeletePost && (
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

      {/* comments */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {post.comments.length}{" "}
          {post.comments.length === 1 ? "comment" : "comments"}
        </h2>

        <div className="mt-4 space-y-3">
          {post.comments.map((c) => {
            const canDeleteThis =
              c.authorId === user.id || isModerator(user.role);
            return (
              <div
                key={c.id}
                className="rounded-lg border border-border bg-surface p-4"
              >
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
          <label
            htmlFor="content"
            className="block text-sm font-medium text-muted"
          >
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
