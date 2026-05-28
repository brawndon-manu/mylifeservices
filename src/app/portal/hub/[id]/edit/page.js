import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { POST_TAGS, POST_CONTENT_MAX } from "@/lib/hub";
import { editPost } from "../../actions";

export const metadata = {
  title: "Edit post · MLS Hub",
  robots: { index: false, follow: false },
};

const ERRORS = {
  content: "Post content cant be blank.",
  tag: "Please pick a tag.",
};

export default async function EditPostPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const errorMessage = sp?.error ? ERRORS[sp.error] : null;

  const user = await getCurrentUser();
  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      authorId: true,
      content: true,
      tag: true,
      expiresAt: true,
      deletedAt: true,
    },
  });
  if (!post || post.deletedAt) notFound();

  // only the author can edit. moderators can delete but not rewrite.
  if (post.authorId !== user.id) {
    redirect(`/portal/hub/${id}?error=forbidden`);
  }

  const editBound = editPost.bind(null, id);
  const expiresStr = post.expiresAt
    ? new Date(post.expiresAt).toISOString().split("T")[0]
    : "";

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <Link
        href={`/portal/hub/${id}`}
        className="text-sm font-medium text-slate-600 transition hover:text-brand"
      >
        ← Back to post
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Edit post
      </h1>

      {errorMessage && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          {errorMessage}
        </div>
      )}

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <form action={editBound} className="space-y-6">
          <div>
            <label
              htmlFor="content"
              className="block text-sm font-medium text-slate-700"
            >
              Content <span className="text-rose-600">*</span>
            </label>
            <textarea
              id="content"
              name="content"
              required
              rows={6}
              defaultValue={post.content}
              maxLength={POST_CONTENT_MAX}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-slate-500">
              Up to {POST_CONTENT_MAX} characters. Image cant be changed
              after posting — delete and repost if you need to swap it.
            </p>
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-slate-700">
              Tag <span className="text-rose-600">*</span>
            </legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {POST_TAGS.map((t) => (
                <label
                  key={t}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 transition hover:border-brand-light hover:bg-sky-50"
                >
                  <input
                    type="radio"
                    name="tag"
                    value={t}
                    defaultChecked={post.tag === t}
                    required
                    className="h-4 w-4 accent-brand"
                  />
                  <span className="text-sm text-slate-800">{t}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="expiresAt"
              className="block text-sm font-medium text-slate-700"
            >
              Expires on <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="expiresAt"
              name="expiresAt"
              type="date"
              defaultValue={expiresStr}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-slate-500">
              Clear the field to make the post never expire.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
            <Link
              href={`/portal/hub/${id}`}
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
            >
              Save changes
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
