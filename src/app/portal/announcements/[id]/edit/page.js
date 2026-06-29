import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isIT } from "@/lib/roles";
import { ANNOUNCEMENT_TAGS, CHANGELOG_TAG } from "@/lib/announcements";
import {
  getStaffByTitle,
  getAckStaffByTitle,
  getAudienceTotals,
} from "@/lib/staff-audience";
import { editPost } from "../../actions";
import AnnouncementForm from "../../_components/AnnouncementForm";

export const metadata = {
  title: "Edit announcement · MLS Portal",
  robots: { index: false, follow: false },
};

const ERRORS = {
  content: "Announcement content cant be blank.",
  title: "Give your announcement a title.",
  tag: "Please pick a type.",
  forbidden: "You dont have permission to do that.",
  ackAudience:
    "Pick who needs to acknowledge this (Everyone or specific titles/people).",
};

export default async function EditAnnouncementPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const errorMessage = sp?.error ? ERRORS[sp.error] : null;

  const user = await getCurrentUser();
  const post = await prisma.announcement.findUnique({
    where: { id },
    select: {
      id: true,
      authorId: true,
      title: true,
      content: true,
      tag: true,
      expiresAt: true,
      requireAck: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
      deletedAt: true,
    },
  });
  if (!post || post.deletedAt) notFound();

  // only the author can edit. moderators can delete but not rewrite.
  if (post.authorId !== user.id) {
    redirect(`/portal/announcements/${id}?error=forbidden`);
  }

  // Changelog stays IT/Super only; always keep the post's current type in the
  // list so the radio reflects reality even if the editor couldn't pick it new.
  const canChangelog = isIT(user.role);
  const tags = ANNOUNCEMENT_TAGS.filter(
    (t) => t !== CHANGELOG_TAG || canChangelog || post.tag === t,
  );
  const [ackStaffByTitle, emailStaffByTitle, { ackEveryone, allActive }] =
    await Promise.all([
      getAckStaffByTitle(),
      getStaffByTitle(),
      getAudienceTotals(),
    ]);

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <Link
        href={`/portal/announcements/${id}`}
        className="text-sm font-medium text-muted transition hover:text-brand"
      >
        ← Back to announcement
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Edit announcement
      </h1>

      {errorMessage && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          {errorMessage}
        </div>
      )}

      <div className="mt-8 rounded-xl border border-border bg-surface p-6 sm:p-8">
        <AnnouncementForm
          action={editPost.bind(null, id)}
          mode="edit"
          defaults={post}
          tags={tags}
          ackStaffByTitle={ackStaffByTitle}
          emailStaffByTitle={emailStaffByTitle}
          ackEveryoneTotal={ackEveryone}
          emailEveryoneTotal={allActive}
          cancelHref={`/portal/announcements/${id}`}
          submitLabel="Save changes"
        />
      </div>
    </section>
  );
}
