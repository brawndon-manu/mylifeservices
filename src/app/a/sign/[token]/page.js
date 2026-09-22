import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyAckToken } from "@/lib/ack-token";
import { firstNameOf, preferredName } from "@/lib/contacts";
import { formEmailRoute } from "@/lib/forms";
import { renderMarkdown, PROSE } from "@/lib/markdown";
import { getRecipientOptions } from "@/lib/form-recipients";
import { attachmentsOf } from "@/lib/announcement-attachments";
import { signFormIds, unsignedFormIds } from "@/lib/announcement-sign";
import SignSequence from "./SignSequence";
import { submitSignedByToken, recordOpenedByToken } from "./actions";

// Sign the form an announcement asks for, from the emailed link, with or
// without a login. Lives outside /portal so the proxy does not bounce it - the
// signed token IS the credential, and it unlocks exactly this one document for
// exactly this one person.
//
// SEVERAL DOCUMENTS, ONE LINK, since 2026-09-21: a post can ask for more than
// one form (announcement-sign.js), and this page walks the reader through the
// ones they still owe, in order. A post with one form reads exactly as before.
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
        attachments: true, formId: true, extraFormIds: true,
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

  // every form the post asks for, in signing order. the first is already
  // loaded; the rest are looked up, and one that is not fillable is skipped
  // rather than dead-ending the link.
  const ids = signFormIds(post);
  const extraRows = ids.length > 1
    ? await prisma.form.findMany({
        where: { id: { in: ids.slice(1) }, fillable: true },
        select: { id: true, title: true, fileUrl: true, fillable: true },
      })
    : [];
  const forms = ids
    .map((fid) => (fid === post.form.id ? post.form : extraRows.find((r) => r.id === fid)))
    .filter(Boolean);

  // what this person has already sent in, per form - so a second visit picks
  // up where they left off rather than asking for a document twice
  const mine = await prisma.formSubmission.findMany({
    where: { announcementId: post.id, userId: user.id },
    select: { formId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const owedIds = unsignedFormIds(
    post,
    mine.map((s) => ({ userId: user.id, formId: s.formId })),
    user.id,
  );
  const todo = forms.filter((f) => owedIds.includes(f.id));
  const done = forms.filter((f) => !owedIds.includes(f.id));
  // already finished? say so rather than letting somebody sign the same thing twice
  const existing = todo.length === 0 ? mine[0] || null : null;

  // who each signed copy goes to: the route's title holders, per form
  const withTeams = await Promise.all(
    todo.map(async (f) => {
      const route = formEmailRoute(f.title);
      const recipients = route?.recipientTitle
        ? await getRecipientOptions(route.recipientTitle)
        : [];
      return {
        id: f.id,
        title: f.title,
        fileUrl: f.fileUrl,
        requireAll: !!route?.requireAll,
        reviewTeam: {
          recipientLabel: route?.recipientTitle || "HR",
          recipients,
          ccNames: (route?.cc || []).map((c) => c.name),
        },
      };
    }),
  );
  const signIds = new Set(forms.map((f) => f.id));
  const others = attachmentsOf(post).filter((a) => !signIds.has(a.formId));
  const bodyHtml = renderMarkdown(post.content);
  const longDate = (d) =>
    new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

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

      {/* THE ANNOUNCEMENT ITSELF, not just its title. This page is where the
          emailed "Review and sign" button lands now, so it has to BE the
          announcement - somebody asked to sign a document is owed what the
          document is about, on the same screen, without a login. `content` was
          already being read here and thrown away. Same renderer and same
          classes as the portal page, so one body cannot read two ways. */}
      {bodyHtml && (
        <div className={`mt-6 max-w-2xl ${PROSE}`} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      )}

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
            {forms.length > 1
              ? `All ${forms.length} documents were submitted, the last on ${longDate(existing.createdAt)}`
              : `Submitted on ${longDate(existing.createdAt)}`}
            . Payroll and HR have the copy - there is nothing else to do.
          </p>
          {/* the portal copy, same as the ack page sends people to. signed in
              you land on the post; signed out you get the login screen, which
              is the intended behaviour. this page is the one that needs no
              login, and they have already finished with it. */}
          <Link
            href={`/portal/announcements/${post.id}`}
            className="mt-3 inline-block text-sm font-medium text-brand hover:text-brand-dark"
          >
            Open it in the portal →
          </Link>
        </div>
      ) : (
        <SignSequence
          forms={withTeams}
          doneTitles={done.map((f) => f.title)}
          signerName={preferredName(user)}
          // the open, once the document is really drawn - see
          // recordOpenedByToken for why this cannot be done on the server
          onOpened={recordOpenedByToken.bind(null, token)}
          submitAction={submitSignedByToken.bind(null, token)}
        />
      )}
    </section>
  );
}
