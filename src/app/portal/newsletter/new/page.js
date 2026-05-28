import Link from "next/link";
import {
  NL_CATEGORIES,
  NL_TITLE_MAX,
  NL_BODY_MAX,
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
} from "@/lib/newsletter";
import { submitItem } from "../actions";

export const metadata = {
  title: "Submit to newsletter · MLS Portal",
  robots: { index: false, follow: false },
};

const ERRORS = {
  title: "Please add a short title.",
  body: "Please write the item.",
  category: "Please pick a category.",
  consent:
    "To include a photo you must confirm written consent is on file for everyone pictured.",
  imageType: "Image must be JPG, PNG, WebP, or GIF.",
  imageSize: `Image must be under ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB.`,
  imageUpload: "Image upload failed. Try again or submit without a photo.",
};

export default async function NewNewsletterItemPage({ searchParams }) {
  const params = await searchParams;
  const errorMessage = params?.error ? ERRORS[params.error] : null;

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <Link
        href="/portal/newsletter"
        className="text-sm font-medium text-slate-600 transition hover:text-brand"
      >
        ← Back to Newsletter
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Submit an item
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Share a highlight from the week or something coming up. Management
        reviews it before it goes live on the public page.
      </p>

      {errorMessage && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          <p className="font-semibold">Couldn&apos;t submit</p>
          <p className="mt-0.5">{errorMessage}</p>
        </div>
      )}

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <form action={submitItem} className="space-y-6">
          <fieldset>
            <legend className="block text-sm font-medium text-slate-700">
              Category <span className="text-rose-600">*</span>
            </legend>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {NL_CATEGORIES.map((c, i) => (
                <label
                  key={c.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 transition hover:border-brand-light hover:bg-sky-50"
                >
                  <input
                    type="radio"
                    name="category"
                    value={c.value}
                    defaultChecked={i === 0}
                    required
                    className="h-4 w-4 accent-brand"
                  />
                  <span className="text-sm text-slate-800">{c.label}</span>
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
              maxLength={NL_TITLE_MAX}
              placeholder="e.g. A 10-mile hike to remember"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <div>
            <label
              htmlFor="body"
              className="block text-sm font-medium text-slate-700"
            >
              The story <span className="text-rose-600">*</span>
            </label>
            <textarea
              id="body"
              name="body"
              required
              rows={6}
              maxLength={NL_BODY_MAX}
              placeholder="What happened? Who was involved? Keep it warm and brief."
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-slate-500">
              Up to {NL_BODY_MAX} characters.
            </p>
          </div>

          <div>
            <label
              htmlFor="eventDate"
              className="block text-sm font-medium text-slate-700"
            >
              Date <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="eventDate"
              name="eventDate"
              type="date"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-slate-500">
              When it happened, or when it&apos;s coming up.
            </p>
          </div>

          <div>
            <label
              htmlFor="image"
              className="block text-sm font-medium text-slate-700"
            >
              Photo <span className="text-slate-400">(optional)</span>
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

          {/* consent gate — required whenever a photo is attached. this is
              a PUBLIC page so client imagery needs written consent on file. */}
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="consent"
                className="mt-0.5 h-4 w-4 flex-none accent-brand"
              />
              <span className="text-sm text-amber-900">
                If my photo includes any clients, I confirm{" "}
                <span className="font-semibold">written consent is on file</span>{" "}
                for everyone pictured to appear on a public page. (Required to
                attach a photo.)
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
            <Link
              href="/portal/newsletter"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
            >
              Submit for review
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
