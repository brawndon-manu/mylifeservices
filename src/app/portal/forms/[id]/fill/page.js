import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { formEmailRoute } from "@/lib/forms";
import { getRecipientOptions } from "@/lib/form-recipients";
import ShareMenu from "@/components/ShareMenu";
import FormFiller from "./FormFiller";
import { submitFormByEmail } from "../../actions";

export const metadata = {
  title: "Fill form · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function FillFormPage({ params }) {
  const { id } = await params;
  await getCurrentUser();

  const form = await prisma.form.findUnique({
    where: { id },
    select: { id: true, title: true, fileUrl: true, fillable: true, shareSlug: true },
  });
  if (!form) notFound();
  if (!form.fillable) redirect("/portal/forms");

  // if this form has a review route, offer "submit by email": the recipient
  // options (holders of the route's recipientTitle) + the fixed cc names for the
  // on-screen summary. no emails go to the client - the action resolves those.
  const route = formEmailRoute(form.title);
  let reviewTeam = null;
  if (route) {
    const recipients = route.recipientTitle
      ? await getRecipientOptions(route.recipientTitle)
      : [];
    reviewTeam = {
      recipientLabel: route.recipientTitle || null,
      recipients,
      ccNames: (route.cc || []).map((c) => c.name),
    };
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <Link
        href="/portal/forms"
        className="text-sm font-medium text-muted transition hover:text-brand"
      >
        ← Back to Forms
      </Link>
      <div className="mt-3 flex items-start justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {form.title}
        </h1>
        {route && form.shareSlug && <ShareMenu path={`/f/${form.shareSlug}`} label="Share link" />}
      </div>
      {route && (
        <p className="mt-2 text-sm text-muted">
          Use <span className="font-medium text-foreground">Share link</span>{" "}
          to send this form to staff who don&apos;t use the portal - it opens the
          same form, they add their name and email, and submit it to a{" "}
          {route.recipientTitle || "reviewer"}.
        </p>
      )}
      <FormFiller
        fileUrl={form.fileUrl}
        title={form.title}
        formId={form.id}
        reviewTeam={reviewTeam}
        submitAction={submitFormByEmail}
      />
    </section>
  );
}
