import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { preferredName } from "@/lib/contacts";
import { companyDateTime } from "@/lib/company-time";
import { accessLabel } from "@/lib/access-labels";
import { logFileOpen } from "@/lib/file-log";
import { submissionLabel } from "@/lib/file-describe";
import { submissionOpenTo } from "@/lib/submission-access";

export const metadata = {
  title: "Sent to you",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// ONE STORED FORM, FOR THE PEOPLE IT WAS SENT TO. a form about a person served
// (the incident report) is emailed as a link to here instead of as a pdf. the
// page says who sent it, when and to whom, carries the note that used to ride
// in the email, and opens the report. the note is part of the record, so a
// visit here is written down like an open of the pdf.
export default async function SentFormPage({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/portal/forms/submissions/${id}`)}`);

  const sub = await prisma.formSubmission.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      sentTo: true,
      note: true,
      createdAt: true,
      submitterName: true,
      user: { select: { name: true, preferredFirstName: true, preferredLastName: true, email: true } },
      form: { select: { title: true } },
    },
  });
  if (!sub) notFound();

  // for the log line: the visitor's address and browser, same as a file route
  const req = { headers: await headers() };
  const pathname = `form-submissions/${id}/page`;
  const label = accessLabel(submissionLabel(sub), "note and details");
  if (!submissionOpenTo(user, sub)) {
    await logFileOpen({ user, pathname, req, action: "denied", label });
    notFound();
  }
  await logFileOpen({ user, pathname, req, label });

  const sender = preferredName(sub.user) || sub.submitterName;
  const sentTo = (sub.sentTo || []).filter(Boolean);

  return (
    <section className="portal-shell mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Sent to you</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {sub.form?.title || "Form"}
      </h1>

      <dl className="mt-6 grid max-w-2xl grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2.5 text-sm">
        <dt className="text-faint">Sent by</dt>
        <dd className="text-foreground">
          {sender} <span className="text-faint">· {companyDateTime(sub.createdAt)}</span>
        </dd>
        {sentTo.length > 0 && (
          <>
            <dt className="text-faint">Sent to</dt>
            <dd className="text-foreground [overflow-wrap:anywhere]">{sentTo.join(", ")}</dd>
          </>
        )}
      </dl>

      {sub.note && (
        <div className="mt-6 max-w-2xl rounded-xl border border-border bg-surface px-5 py-4 shadow-sm">
          <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-faint">Note from {sender}</h2>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{sub.note}</p>
        </div>
      )}

      <a
        href={`/portal/forms/submissions/${id}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-block rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
      >
        Open the report
      </a>
      <p className="mt-3 text-[12.5px] text-faint">The report opens as a PDF. Every open is written down.</p>
    </section>
  );
}
