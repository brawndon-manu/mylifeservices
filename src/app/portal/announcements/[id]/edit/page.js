import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isIT, isElevated, canSeeRoles, ROLE_LABELS, isSuper } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { ANNOUNCEMENT_TAGS, CHANGELOG_TAG } from "@/lib/announcements";
import { formEmailRoute } from "@/lib/forms";
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
  postAs: "That person isnt a valid active user. Pick someone else.",
  ackAudience:
    "Pick who needs to acknowledge this (Everyone or specific titles/people).",
  meetingAudience:
    "Pick who's invited to this meeting (Everyone or specific titles/people).",
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
      postedById: true,
      title: true,
      content: true,
      tag: true,
      expiresAt: true,
      imageUrl: true,
      attachments: true,
      requireAck: true,
      ackEveryone: true,
      ackTitles: true,
      ackUserIds: true,
      formId: true,
      deletedAt: true,
      publishedAt: true,
      // meeting fields - so editing a draft/meeting reloads everything the author
      // entered (format, link, sessions/series, reminders, etc.), pre-filled.
      meetingKind: true,
      meetingFormat: true,
      meetingMandatory: true,
      zoomLink: true,
      zoomCode: true,
      zoomLinkTbd: true,
      meetingAddress: true,
      meetingOptions: true,
      meetingMultiPick: true,
      meetingAt: true,
      meetingTimezone: true,
      meetingDurationFromMin: true,
      meetingDurationToMin: true,
      meetingResponseDueAt: true,
      meetingResponseDueTz: true,
      meetingReminderLeadMin: true,
      meetingNightBefore: true,
      // the post-meeting attestation. HAS to be listed: this page selects meeting
      // fields one by one, and anything missing comes back undefined, shows as
      // unset in the form, and is then SAVED as unset. Leaving these out did not
      // just hide the attestation, it wiped it on the next edit.
      meetingAttestationFormId: true,
      meetingAttestationSubject: true,
      meetingAttestationBody: true,
      // event fields - so editing an Event reloads audience / date / location.
      eventAudience: true,
      eventAt: true,
      eventTimezone: true,
      eventEndAt: true,
      eventLocationName: true,
      eventAddress: true,
    },
  });
  if (!post || post.deletedAt) notFound();

  // editing a draft sends you back to the preview (still unpublished); a published
  // post just saves. the button copy reflects that.
  const isDraft = !post.publishedAt;

  // the author can edit; Super can edit anyone's; for a draft posted on someone's
  // behalf, the person who actually posted it (postedBy) can edit too.
  if (
    post.authorId !== user.id &&
    !isSuper(user.role) &&
    !(isDraft && post.postedById === user.id)
  ) {
    redirect(`/portal/announcements/${id}?error=forbidden`);
  }

  // Changelog stays IT/Super only; always keep the post's current type in the
  // list so the radio reflects reality even if the editor couldn't pick it new.
  const canChangelog = isIT(user.role);
  const tags = ANNOUNCEMENT_TAGS.filter(
    (t) => t !== CHANGELOG_TAG || canChangelog || post.tag === t,
  );
  // proxy "post as" - same as create, but only while it's still a draft.
  const canProxy = isElevated(user.role) && isDraft;
  const showRoles = canSeeRoles(user.role);
  const [ackStaffByTitle, emailStaffByTitle, { ackEveryone, allActive }, allForms, docs] =
    await Promise.all([
      getAckStaffByTitle(),
      getStaffByTitle(),
      getAudienceTotals(),
      prisma.form.findMany({
        where: { fillable: true },
        select: { id: true, title: true },
        orderBy: { title: "asc" },
      }),
      // ATTACHABLE is a wider set than ack-eligible: the training deck is not
      // fillable and has nowhere to submit to, but it is exactly the kind of
      // thing a post needs to carry.
      prisma.form.findMany({
        select: { id: true, title: true, category: true, fillable: true },
        orderBy: [{ category: "asc" }, { title: "asc" }],
      }),
    ]);
  const forms = allForms.filter((f) => !!formEmailRoute(f.title)?.recipientTitle);
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
          isDraft={isDraft}
          defaults={post}
          tags={tags}
          canProxy={canProxy}
          people={people}
          showRoles={showRoles}
          meId={user.id}
          meName={preferredName(user)}
          ackStaffByTitle={ackStaffByTitle}
          emailStaffByTitle={emailStaffByTitle}
          ackEveryoneTotal={ackEveryone}
          emailEveryoneTotal={allActive}
          forms={forms}
          attestationForms={allForms}
          docs={docs}
          cancelHref={`/portal/announcements/${id}`}
          submitLabel={isDraft ? "Save changes and preview" : "Save changes"}
        />
      </div>
    </section>
  );
}
