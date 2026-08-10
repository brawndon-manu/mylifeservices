import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyAckToken } from "@/lib/ack-token";
import { firstNameOf, preferredName } from "@/lib/contacts";
import { formEmailRoute } from "@/lib/forms";
import { getRecipientOptions } from "@/lib/form-recipients";
import FormFiller from "@/app/portal/forms/[id]/fill/FormFiller";
import { attachmentsOf } from "@/lib/announcement-attachments";
import { submitSignedByToken } from "./actions";

// Sign the form an announcement asks for, from the emailed link, with or
// without a login. Lives outside /portal so the proxy does not bounce it - the
// signed token IS the credential, and it unlocks exactly this one document for
// exactly this one person.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review and sign · My Life Services",
  robots: { index: false, follow: false },
};

export default async function SignFromLinkPage({ params }) {
  const { token } = await params;
  const parsed = verifyAckToken(token);
  if (!parsed) notFound();

  const [post, user] = await Promise.all([
    prisma.announcement.findUnique({
      where: { id: parsed.announcementId },
      select: {
        id: true, title: true, content: true, requireAck: true, deletedAt: true,
        attachments: true, formId: true,
        form: { select: { id: true, title: true, fileUrl: true, fillable: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: parsed.userId },
      select: {
        id: true, name: true, preferredFirstName: true, preferredLastName: true,
        email: true, deactivatedAt: true,
      },
    }),
  ]);
  if (!post || post.deletedAt || !post.requireAck || !post.form?.fillable) notFound();
  if (!user || user.deactivatedAt) notFound();

  // already done? say so rather than letting somebody sign the same thing twice
  const existing = await prisma.formSubmission.findFirst({
    where: { announcementId: post.id, userId: user.id },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const route = formEmailRoute(post.form.title);
  const recipients = route?.recipientTitle ? await getRecipientOptions(route.recipientTitle) : [];
  const reviewTeam = {
    recipientLabel: route?.recipientTitle || "HR",
    recipients,
    ccNames: (route?.cc || []).map((c) => c.name),
  };
  const others = attachmentsOf(post).filter((a) => a.formId !== post.form.id);

  return (
    <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        {post.title || "Announcement"}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Review and sign
      </h1>
      <p className="mt-2 text-sm text-muted">
        {firstNameOf(user)}, this is signed as{" "}
        <b className="text-foreground">{preferredName(user)}</b> ({user.email}). Nothing to
        type - the link you came from is what identifies you.
      </p>

      {others.length > 0 && (
        <div className="mt-5 rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            Read this first
          </p>
          <ul className="mt-2 space-y-1.5">
            {others.map((a) => (
              <li key={a.url}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm transition hover:border-brand"
                >
                  <span className="min-w-0 truncate font-medium text-foreground">{a.name}</span>
                  <span className="shrink-0 text-xs text-muted">PDF →</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {existing ? (
        <div className="mt-6 rounded-xl border border-emerald-300/60 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            You already signed this.
          </p>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200/80">
            Submitted on{" "}
            {new Date(existing.createdAt).toLocaleDateString("en-US", {
              month: "long", day: "numeric", year: "numeric",
            })}
            . Payroll and HR have the copy - there is nothing else to do.
          </p>
          <Link
            href={`/a/post/${token}`}
            className="mt-3 inline-block text-sm font-medium text-brand hover:text-brand-dark"
          >
            Back to the announcement →
          </Link>
        </div>
      ) : (
        <FormFiller
          fileUrl={post.form.fileUrl}
          title={post.form.title}
          formId={post.form.id}
          reviewTeam={reviewTeam}
          signMode
          signIntro={`Read the material, then complete and sign "${post.form.title}". Your signed copy goes to HR and is kept on file.`}
          submitAction={submitSignedByToken.bind(null, token)}
        />
      )}
    </section>
  );
}
