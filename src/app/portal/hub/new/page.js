import Link from "next/link";
import { POST_TAGS, POST_CONTENT_MAX, IMAGE_MAX_BYTES, IMAGE_ACCEPT } from "@/lib/hub";
import { createPost } from "../actions";

export const metadata = {
  title: "New post · MLS Hub",
  robots: { index: false, follow: false },
};

const ERRORS = {
  content: "Post content cant be blank.",
  tag: "Please pick a tag.",
  imageType: "Image must be JPG, PNG, WebP, or GIF.",
  imageSize: `Image must be under ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB.`,
  imageUpload: "Image upload failed. Try again or post without an image.",
};

export default async function NewPostPage({ searchParams }) {
  const params = await searchParams;
  const errorMessage = params?.error ? ERRORS[params.error] : null;

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-light">
        MLS Hub
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        New post
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Share a flyer, a resource, or anything useful for the team.
      </p>

      {errorMessage && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          <p className="font-semibold">Couldn&apos;t post</p>
          <p className="mt-0.5">{errorMessage}</p>
        </div>
      )}

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <form action={createPost} className="space-y-6">
          <div>
            <label
              htmlFor="content"
              className="block text-sm font-medium text-slate-700"
            >
              What do you want to share? <span className="text-rose-600">*</span>
            </label>
            <textarea
              id="content"
              name="content"
              required
              rows={6}
              maxLength={POST_CONTENT_MAX}
              placeholder="Type your message..."
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-slate-500">
              Up to {POST_CONTENT_MAX} characters.
            </p>
          </div>

          <div>
            <label
              htmlFor="image"
              className="block text-sm font-medium text-slate-700"
            >
              Image / flyer <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="image"
              name="image"
              type="file"
              accept={IMAGE_ACCEPT.join(",")}
              className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-light file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand"
            />
            <p className="mt-1 text-xs text-slate-500">
              JPG, PNG, WebP, or GIF. Up to {Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB.
            </p>
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-slate-700">
              Tag <span className="text-rose-600">*</span>
            </legend>
            <p className="mt-1 text-xs text-slate-500">
              Pick one that fits best so people can filter the feed.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {POST_TAGS.map((t, i) => (
                <label
                  key={t}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 transition hover:border-brand-light hover:bg-sky-50"
                >
                  <input
                    type="radio"
                    name="tag"
                    value={t}
                    defaultChecked={i === 0}
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
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-slate-500">
              Use for time-sensitive posts (e.g. a job fair on Saturday).
              The post stays visible but gets an &quot;Expired&quot; badge
              after that date.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
            <Link
              href="/portal/hub"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
            >
              Post
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
