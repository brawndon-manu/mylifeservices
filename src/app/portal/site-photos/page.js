import Image from "next/image";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import ConfirmButton from "@/components/ConfirmButton";
import BackLink from "@/components/BackLink";
import {
  SITE_PHOTO_PAGES,
  sectionsForPage,
  IMAGE_ACCEPT,
  SITE_PHOTO_CAPTION_MAX,
  SITE_PHOTO_ALT_MAX,
} from "@/lib/site-photos";
import {
  addPhoto,
  updatePhoto,
  toggleActive,
  movePhoto,
  deletePhoto,
} from "./actions";

export const metadata = {
  title: "Site Photos",
  robots: { index: false, follow: false },
};

const BANNERS = {
  added: { kind: "ok", text: "Photo added." },
  saved: { kind: "ok", text: "Changes saved." },
  deleted: { kind: "ok", text: "Photo removed." },
  consent: { kind: "err", text: "You must confirm a signed photo release is on file." },
  noImage: { kind: "err", text: "Pick an image file to upload." },
  imageType: { kind: "err", text: "That file type isnt supported (use JPG, PNG, or WebP)." },
  imageSize: { kind: "err", text: "That image is too large." },
  imageUpload: { kind: "err", text: "Upload failed, please try again." },
  section: { kind: "err", text: "Pick where the photo should appear." },
};

export default async function SitePhotosPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdminUp(user.role)) redirect("/portal?error=forbidden");

  const sp = await searchParams;
  const banner = BANNERS[sp?.added ? "added" : sp?.saved ? "saved" : sp?.deleted ? "deleted" : sp?.error];

  const photos = await prisma.sitePhoto.findMany({
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
  });
  const bySection = (value) => photos.filter((p) => p.section === value);

  return (
    <section className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <BackLink href="/portal/admin">Back to admin dashboard</BackLink>
      <p className="mt-3 text-sm text-muted">Portal / Site Photos</p>
      <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight text-foreground">
        Site Photos
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          Admin / IT only
        </span>
      </h1>
      <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
        Manage the photos on the public About page. Upload, caption, reorder,
        and turn photos on or off without touching code. Photos are stored on
        Vercel, not in the public code.
      </p>

      {banner && (
        <div
          className={`mt-6 rounded-md border p-4 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* upload */}
      <div className="mt-8 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Add a photo
        </h2>
        <p className="mt-1 text-sm text-muted">
          Recommended: landscape, at least 1200px wide.
        </p>
        <form action={addPhoto} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-faint">
              Photo
            </label>
            <input
              type="file"
              name="image"
              accept={IMAGE_ACCEPT.join(",")}
              required
              className="mt-2 block w-full text-sm text-muted file:mr-4 file:rounded-md file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-dark"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-faint">
                Caption (shown under the photo)
              </label>
              <input
                name="caption"
                maxLength={SITE_PHOTO_CAPTION_MAX}
                className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-faint">
                Where it appears
              </label>
              <select
                name="section"
                defaultValue="agency-overview"
                className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
              >
                {SITE_PHOTO_PAGES.map((page) => (
                  <optgroup key={page} label={`${page} page`}>
                    {sectionsForPage(page).map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                        {s.multi ? " (slideshow)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-faint">
              Alt text (describes the photo for screen readers)
            </label>
            <input
              name="alt"
              maxLength={SITE_PHOTO_ALT_MAX}
              className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
            />
          </div>
          <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <input type="checkbox" name="consent" required className="mt-1" />
            <span>
              I confirm a <strong>signed photo release</strong> is on file for
              everyone pictured. Required before any client photo goes on the
              public site.
            </span>
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Add photo
          </button>
        </form>
      </div>

      {/* per-section lists, grouped by the public page they live on */}
      {SITE_PHOTO_PAGES.map((page) => (
        <div key={page} className="mt-10">
          <h2 className="border-b border-border pb-2 text-lg font-semibold tracking-tight text-foreground">
            {page} page
          </h2>
          {sectionsForPage(page).map((s) => {
            const items = bySection(s.value);
            return (
              <div key={s.value} className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                    {s.label}
                    {s.multi && " (cycles)"}
                    {s.note && (
                      <span className="ml-2 normal-case font-normal text-faint">
                        {s.note}
                      </span>
                    )}
                  </h3>
                  <span className="text-xs text-faint">
                    {items.length} {items.length === 1 ? "photo" : "photos"}
                    {s.multi && items.length > 1 ? " · order = top to bottom" : ""}
                  </span>
                </div>

            {items.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-border-strong bg-surface-2 p-4 text-sm text-muted">
                No photos here yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {items.map((p, i) => (
                  <li
                    key={p.id}
                    className={`flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-start ${
                      p.active ? "" : "opacity-60"
                    }`}
                  >
                    <div className="relative h-20 w-28 flex-none overflow-hidden rounded-lg border border-border bg-surface-3">
                      <Image
                        src={p.url}
                        alt={p.alt || p.caption || "Site photo"}
                        fill
                        sizes="112px"
                        className="object-cover"
                      />
                    </div>

                    {/* edit caption + alt */}
                    <form
                      action={updatePhoto.bind(null, p.id)}
                      className="flex-1 space-y-2"
                    >
                      <input
                        name="caption"
                        defaultValue={p.caption || ""}
                        placeholder="Caption"
                        maxLength={SITE_PHOTO_CAPTION_MAX}
                        className="w-full rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-foreground"
                      />
                      <input
                        name="alt"
                        defaultValue={p.alt || ""}
                        placeholder="Alt text"
                        maxLength={SITE_PHOTO_ALT_MAX}
                        className="w-full rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-foreground"
                      />
                      <button
                        type="submit"
                        className="text-xs font-semibold text-brand transition hover:text-brand-dark"
                      >
                        Save text
                      </button>
                    </form>

                    {/* controls */}
                    <div className="flex flex-none flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                      <form action={toggleActive.bind(null, p.id)}>
                        <button
                          type="submit"
                          role="switch"
                          aria-checked={p.active}
                          aria-label={p.active ? "Live, click to hide" : "Hidden, click to show"}
                          className="inline-flex items-center gap-2 text-xs font-semibold"
                        >
                          <span
                            className={`relative h-5 w-9 flex-none rounded-full transition-colors ${
                              p.active ? "bg-emerald-500" : "bg-border-strong"
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                                p.active ? "left-[18px]" : "left-0.5"
                              }`}
                            />
                          </span>
                          <span className={p.active ? "text-emerald-700" : "text-muted"}>
                            {p.active ? "Live" : "Hidden"}
                          </span>
                        </button>
                      </form>
                      {s.multi && (
                        <div className="flex items-center gap-1">
                          <form action={movePhoto.bind(null, p.id, "up")}>
                            <button
                              type="submit"
                              disabled={i === 0}
                              aria-label="Move up"
                              className="rounded border border-border-strong px-2 py-1 text-xs text-muted transition hover:bg-surface-2 disabled:opacity-30"
                            >
                              ↑
                            </button>
                          </form>
                          <form action={movePhoto.bind(null, p.id, "down")}>
                            <button
                              type="submit"
                              disabled={i === items.length - 1}
                              aria-label="Move down"
                              className="rounded border border-border-strong px-2 py-1 text-xs text-muted transition hover:bg-surface-2 disabled:opacity-30"
                            >
                              ↓
                            </button>
                          </form>
                        </div>
                      )}
                      <form action={deletePhoto.bind(null, p.id)}>
                        <ConfirmButton
                          message="Delete this photo? This removes it from the site and storage."
                          className="text-xs font-semibold text-rose-600 transition hover:text-rose-700"
                        >
                          Delete
                        </ConfirmButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
