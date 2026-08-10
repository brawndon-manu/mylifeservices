import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { formEmailRoute } from "@/lib/forms";
import { getRecipientOptions } from "@/lib/form-recipients";
import FormFiller from "@/app/portal/forms/[id]/fill/FormFiller";
import { submitPublicFormByEmail } from "./actions";

// PUBLIC, UNLISTED fill page for a form shared via its direct link. the URL is a
// random, unguessable shareSlug (NOT the readable form id), so it's only reachable
// if the link was shared with you - not indexed, not linked anywhere public. lets
// non-portal staff fill + submit the form without a login. anyone already signed in
// gets bounced to the normal portal fill page so they keep the portal look (and
// don't have to re-type their name/email).

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const form = await prisma.form.findUnique({
    where: { shareSlug: slug },
    select: { title: true },
  });
  return {
    title: form ? `${form.title} · My Life Services` : "Form",
    robots: { index: false, follow: false },
  };
}

export default async function PublicFillPage({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;

  const form = await prisma.form.findUnique({
    where: { shareSlug: slug },
    select: { id: true, title: true, fileUrl: true, fillable: true },
  });
  if (!form || !form.fillable) notFound();

  // ARRIVED FROM AN ANNOUNCEMENT that wants this form signed. Carried through
  // so a signature given without logging in still completes that person's
  // acknowledgment - it did not, until 2026-08-10: the public path stored the
  // submission with no announcement on it, so the roster never ticked and even
  // assigning it later recorded nothing.
  //
  // Validated the same way the logged-in page does: the announcement has to be
  // real, still require an ack, and actually point at THIS form. Never trust
  // the query string.
  let announcementId = null;
  if (typeof sp?.announcementId === "string" && sp.announcementId) {
    const a = await prisma.announcement.findUnique({
      where: { id: sp.announcementId },
      select: { formId: true, requireAck: true, deletedAt: true },
    });
    if (a && !a.deletedAt && a.requireAck && a.formId === form.id) {
      announcementId = sp.announcementId;
    }
  }

  // already signed in? use the normal in-portal fill page (by the real form id).
  const user = await getCurrentUser();
  if (user) {
    redirect(
      `/portal/forms/${form.id}/fill${announcementId ? `?announcementId=${announcementId}` : ""}`,
    );
  }

  // the public link only makes sense for a form that can be submitted by email.
  const route = formEmailRoute(form.title);
  if (!route || !route.recipientTitle) notFound();

  const recipients = await getRecipientOptions(route.recipientTitle);
  const reviewTeam = {
    recipientLabel: route.recipientTitle,
    recipients,
    ccNames: (route.cc || []).map((c) => c.name),
  };

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        My Life Services
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {form.title}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Fill it in below, then submit it to a {route.recipientTitle}. Nothing is
        saved here - the completed form is only sent when you submit.
      </p>
      <FormFiller
        fileUrl={form.fileUrl}
        title={form.title}
        formId={form.id}
        reviewTeam={reviewTeam}
        announcementId={announcementId}
        publicMode
        submitAction={submitPublicFormByEmail}
      />
    </section>
  );
}
