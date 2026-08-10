import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyAckToken } from "@/lib/ack-token";
import { firstNameOf, preferredName } from "@/lib/contacts";
import { renderMarkdown } from "@/lib/markdown";
import { attachmentsOf } from "@/lib/announcement-attachments";

// The announcement itself, readable without a login.
//
// "Go to the announcement" in the email pointed at /portal/announcements/<id>,
// and the proxy gates /portal on being signed in - so anyone reading their mail
// on a phone they have never signed in on hit a login wall. /f/ and /r/ links
// were already exempt for exactly this reason; this is the same idea for a post.
//
// Read-only on purpose. The signed token identifies one person and unlocks one
// announcement: enough to read it and to sign what it asks for, and nothing else.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Announcement · My Life Services",
  robots: { index: false, follow: false },
};

export default async function PublicPostPage({ params }) {
  const { token } = await params;
  const parsed = verifyAckToken(token);
  if (!parsed) notFound();

  const [post, user, ack] = await Promise.all([
    prisma.announcement.findUnique({
      where: { id: parsed.announcementId },
      select: {
        id: true, title: true, content: true, tag: true, createdAt: true,
        requireAck: true, deletedAt: true, publishedAt: true, attachments: true,
        formId: true,
        form: { select: { id: true, title: true, fillable: true } },
        author: { select: { name: true, preferredFirstName: true, preferredLastName: true, title: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: parsed.userId },
      select: { id: true, name: true, preferredFirstName: true, preferredLastName: true, deactivatedAt: true },
    }),
    prisma.announcementAck.findUnique({
      where: { announcementId_userId: { announcementId: parsed.announcementId, userId: parsed.userId } },
      select: { createdAt: true },
    }).catch(() => null),
  ]);
  if (!post || post.deletedAt || !post.publishedAt) notFound();
  if (!user || user.deactivatedAt) notFound();

  const signed = post.formId
    ? await prisma.formSubmission.findFirst({
        where: { announcementId: post.id, userId: user.id },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const docs = attachmentsOf(post);
  const needsSignature = !!post.formId && post.form?.fillable;

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        {post.tag}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {post.title || "Announcement"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {preferredName(post.author)}
        {post.author?.title ? ` · ${post.author.title}` : ""} ·{" "}
        {new Date(post.createdAt).toLocaleDateString("en-US", {
          month: "long", day: "numeric", year: "numeric",
        })}
      </p>

      <article
        className="prose prose-sm mt-6 max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
      />

      {docs.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            {docs.length === 1 ? "Attached document" : "Attached documents"}
          </p>
          <ul className="mt-2 space-y-1.5">
            {docs.map((a) => (
              <li key={a.url}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 transition hover:border-brand"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">{a.name}</span>
                  <span className="shrink-0 text-xs text-muted">PDF →</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* OPENED AND SIGNED ARE DIFFERENT THINGS, and the page says which is
          outstanding. Mánu 2026-08-10: the acknowledgment tells you they at
          least opened it; the signature is what finishes it. */}
      {needsSignature && (
        <div
          className={`mt-6 rounded-xl border p-5 ${
            signed
              ? "border-emerald-300/60 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30"
              : "border-amber-400/60 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30"
          }`}
        >
          {signed ? (
            <>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                Signed - thank you, {firstNameOf(user)}.
              </p>
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200/80">
                You signed &ldquo;{post.form.title}&rdquo; on{" "}
                {new Date(signed.createdAt).toLocaleDateString("en-US", {
                  month: "long", day: "numeric", year: "numeric",
                })}
                . Nothing else to do.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {ack ? "You have read this, but it still needs your signature." : "This needs your signature."}
              </p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/80">
                Submitting &ldquo;{post.form.title}&rdquo; is what completes it.
              </p>
              <Link
                href={`/a/sign/${token}`}
                className="mt-3 inline-flex items-center justify-center rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
              >
                Review and sign →
              </Link>
            </>
          )}
        </div>
      )}

      <p className="mt-8 text-xs text-muted">
        This link is just for you. Signed in already?{" "}
        <Link href={`/portal/announcements/${post.id}`} className="font-medium text-brand hover:text-brand-dark">
          Open it in the portal
        </Link>
        .
      </p>
    </section>
  );
}
