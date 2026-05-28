import Link from "next/link";
import {
  FEEDBACK_TYPES,
  FB_TITLE_MAX,
  FB_BODY_MAX,
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
} from "@/lib/feedback";
import { submitFeedback } from "../actions";

export const metadata = {
  title: "Post to Suggestions & Bugs · MLS Portal",
  robots: { index: false, follow: false },
};

const ERRORS = {
  type: "Please pick suggestion or bug.",
  title: "Please add a short title.",
  body: "Please describe it.",
  imageType: "Image must be JPG, PNG, WebP, or GIF.",
  imageSize: `Image must be under ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB.`,
  imageUpload: "Image upload failed. Try again or post without a photo.",
};

export default async function NewFeedbackPage({ searchParams }) {
  const params = await searchParams;
  const errorMessage = params?.error ? ERRORS[params.error] : null;

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <Link
        href="/portal/feedback"
        className="text-sm font-medium text-slate-600 transition hover:text-amber-600"
      >
        ← Back to Suggestions &amp; Bugs
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Post an item
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Share a suggestion or report a bug. Add a screenshot if it helps
        explain.
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
        <form action={submitFeedback} className="space-y-6">
          <fieldset>
            <legend className="block text-sm font-medium text-slate-700">
              Type <span className="text-rose-600">*</span>
            </legend>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {FEEDBACK_TYPES.map((t, i) => (
                <label
                  key={t.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 transition hover:border-amber-300 hover:bg-amber-50"
                >
                  <input
                    type="radio"
                    name="type"
                    value={t.value}
                    defaultChecked={i === 0}
                    required
                    className="h-4 w-4 accent-amber-500"
                  />
                  <span className="text-sm text-slate-800">{t.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-slate-700"
            >
              Title <span className="text-rose-600">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              maxLength={FB_TITLE_MAX}
              placeholder="e.g. Schedule export button doesn't work"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>

          <div>
            <label
              htmlFor="body"
              className="block text-sm font-medium text-slate-700"
            >
              Details <span className="text-rose-600">*</span>
            </label>
            <textarea
              id="body"
              name="body"
              required
              rows={6}
              maxLength={FB_BODY_MAX}
              placeholder="What happened, or what would you suggest? Steps to reproduce a bug help a lot."
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <p className="mt-1 text-xs text-slate-500">
              Up to {FB_BODY_MAX} characters.
            </p>
          </div>

          <div>
            <label
              htmlFor="image"
              className="block text-sm font-medium text-slate-700"
            >
              Screenshot / photo <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="image"
              name="image"
              type="file"
              accept={IMAGE_ACCEPT.join(",")}
              className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-amber-500 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-amber-600"
            />
            <p className="mt-1 text-xs text-slate-500">
              JPG, PNG, WebP, or GIF. Up to {Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
            <Link
              href="/portal/feedback"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
            >
              Post
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
