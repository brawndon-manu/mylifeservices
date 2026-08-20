import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyAckToken } from "@/lib/ack-token";
import { firstNameOf, preferredName } from "@/lib/contacts";
import { attachmentsOf } from "@/lib/announcement-attachments";
import FormFiller from "@/app/portal/forms/[id]/fill/FormFiller";
import { submitAttestationByToken } from "./actions";

// Sign the attestation a meeting asked for once it concluded, from the emailed
// link, with or without a login. Outside /portal so the proxy does not bounce
// it: the signed token IS the credential and it unlocks exactly this one
// document for exactly this one person.
//
// Sibling of /a/sign, and deliberately not the same route. That one is for the
// form an announcement wants acknowledged, which is completed by mailing it to a
// review team. This one is filed against the meeting and goes nowhere else.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review and sign · My Life Services",
  robots: { index: false, follow: false },
};

export default async function AttestFromLinkPage({ params }) {
  const { token } = await params;
  const parsed = verifyAckToken(token);
  if (!parsed) notFound();

  const [post, user] = await Promise.all([
    prisma.announcement.findUnique({
      where: { id: parsed.announcementId },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        attachments: true,
        meetingConcludedAt: true,
        meetingAttestationForm: {
          select: { id: true, title: true, fileUrl: true, fillable: true },
        },
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
  // not concluded = nobody has been asked for this yet, so the link is dead
  if (!post || post.deletedAt || !post.meetingConcludedAt) notFound();
  const form = post.meetingAttestationForm;
  if (!form?.fillable) notFound();
  if (!user || user.deactivatedAt) notFound();

  const existing = await prisma.formSubmission.findFirst({
    where: { announcementId: post.id, userId: user.id, formId: form.id },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  // the reading material the meeting carried, minus the attestation itself
  const others = attachmentsOf(post).filter((a) => a.formId !== form.id);

  return (
    <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        {post.title || "Company meeting"}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Review and sign
      </h1>
      <p className="mt-2 text-sm text-muted">
        {firstNameOf(user)}, this is signed as{" "}
        <b className="text-foreground">{preferredName(user)}</b> ({user.email}).
        Nothing to type, the link you came from is what identifies you.
      </p>

      {others.length > 0 && (
        <div className="mt-5 rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            What this session covered
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
            . Nothing else is needed from you.
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <FormFiller
            fileUrl={form.fileUrl}
            title={form.title}
            formId={form.id}
            announcementId={post.id}
            announcementTitle={post.title}
            signMode
            signLabel="Sign and submit"
            signIntro="Fill in anything that applies to you, sign at the bottom, then submit. A copy is filed against this meeting."
            submitAction={submitAttestationByToken.bind(null, token)}
          />
        </div>
      )}
    </section>
  );
}
