import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, isIT, isSupervisorUp, canSeeRoles, ROLE_LABELS } from "@/lib/roles";
import { ANNOUNCEMENT_TAGS, CHANGELOG_TAG } from "@/lib/announcements";
import { IMAGE_MAX_BYTES } from "@/lib/hub";
import { preferredName } from "@/lib/contacts";
import { createPost } from "../actions";
import AnnouncementForm from "../_components/AnnouncementForm";

export const metadata = {
  title: "New announcement · MLS Portal",
  robots: { index: false, follow: false },
};

const ERRORS = {
  content: "Announcement content cant be blank.",
  title: "Changelog posts need a title.",
  tag: "Please pick a type.",
  forbidden: "You dont have permission to post that type.",
  imageType: "Image must be JPG, PNG, WebP, or GIF.",
  imageSize: `Image must be under ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB.`,
  imageUpload: "Image upload failed. Try again or post without an image.",
  postAs: "That person isnt a valid active user. Pick someone else.",
};

export default async function NewAnnouncementPage({ searchParams }) {
  const params = await searchParams;
  const errorMessage = params?.error ? ERRORS[params.error] : null;

  const user = await getCurrentUser();
  // only Supervisor+ can post announcements; everyone else is bounced.
  if (!isSupervisorUp(user.role)) {
    redirect("/portal/announcements");
  }

  // Changelog is IT/Super only; drop it from the type list for everyone else.
  const canChangelog = isIT(user.role);
  const tags = canChangelog
    ? ANNOUNCEMENT_TAGS
    : ANNOUNCEMENT_TAGS.filter((t) => t !== CHANGELOG_TAG);

  const canProxy = isElevated(user.role);
  const showRoles = canSeeRoles(user.role);
  let people = [];
  if (canProxy) {
    const rows = await prisma.user.findMany({
      where: { deactivatedAt: null },
      select: { id: true, name: true, preferredFirstName: true, preferredLastName: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
    people = rows.map((p) => ({
      id: p.id,
      label: `${preferredName(p)}${showRoles ? ` · ${ROLE_LABELS[p.role] ?? p.role}` : ""} · ${p.email}`,
    }));
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Portal
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        New announcement
      </h1>
      <p className="mt-2 text-sm text-muted">
        Share an update with the whole team. Everyone can read, comment, and
        react.
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

      <div className="mt-8 rounded-xl border border-border bg-surface p-6 sm:p-8">
        <AnnouncementForm
          action={createPost}
          mode="create"
          tags={tags}
          canProxy={canProxy}
          people={people}
          showRoles={showRoles}
          meId={user.id}
          meName={preferredName(user)}
          submitLabel="Post"
        />
      </div>
    </section>
  );
}
