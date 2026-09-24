import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { formNumber } from "@/lib/clock-amendment/rules";
import { periodRange, shortDay } from "@/lib/document-dates";

// MY DOCUMENTS - everything this person signed or holds, in one place: their
// signed timesheets, their approved clock addenda, the forms they signed and
// their certificates. it is where an expired email link sends them, and the
// copy of their own records they can open any time. every row opens through
// /portal/documents/[kind]/[id], which checks the row is theirs.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "My documents · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function MyDocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/portal/documents");

  // rehearsal and demo rows are the office's own tests, never somebody's record
  const [sheets, dpSheets, addenda, forms, certificates] = await Promise.all([
    prisma.timesheet.findMany({
      where: { userId: user.id, signedPdfUrl: { not: null }, batch: { testOnly: false } },
      select: { id: true, signedAt: true, approvedAt: true, batch: { select: { periodFrom: true, periodTo: true } } },
      orderBy: { signedAt: "desc" },
    }),
    prisma.dayProgramSheet.findMany({
      where: { userId: user.id, signedPdfUrl: { not: null } },
      select: { id: true, signedAt: true, approvedAt: true, batch: { select: { periodFrom: true, periodTo: true } } },
      orderBy: { signedAt: "desc" },
    }),
    prisma.clockAmendment.findMany({
      where: { staffId: user.id, approvedAt: { not: null }, testOnly: false },
      select: { id: true, createdAt: true, shiftDate: true, approvedAt: true },
      orderBy: { approvedAt: "desc" },
    }),
    prisma.formSubmission.findMany({
      where: { userId: user.id },
      select: { id: true, createdAt: true, form: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.certificate.findMany({
      where: { userId: user.id },
      select: { id: true, issuedOn: true, batch: { select: { title: true, issuedOn: true } } },
    }),
  ]);

  const timesheetRows = [
    ...sheets.map((t) => ({ kind: "timesheet", id: t.id, at: t.signedAt, title: periodRange(t.batch.periodFrom, t.batch.periodTo), approved: !!t.approvedAt })),
    ...dpSheets.map((t) => ({ kind: "day-program", id: t.id, at: t.signedAt, title: `${periodRange(t.batch.periodFrom, t.batch.periodTo)} · Day Program`, approved: !!t.approvedAt })),
  ]
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    // one row per pay period: a re-upload that replaced a signed sheet leaves
    // the old signed copy behind, and two identical rows read as a mistake. the
    // newest signed copy is theirs; the replaced one stays with the office.
    .filter((r, i, all) => all.findIndex((x) => x.kind === r.kind && x.title === r.title) === i)
    .map((r) => ({ ...r, line: `Signed ${shortDay(r.at)}` }));

  const sections = [
    { heading: "Timesheets", rows: timesheetRows },
    {
      heading: "Clock addenda",
      rows: addenda.map((a) => ({ kind: "addendum", id: a.id, title: `${formNumber(a)} · shift on ${a.shiftDate}`, line: `Approved ${shortDay(a.approvedAt)}` })),
    },
    {
      heading: "Forms",
      rows: forms.map((f) => ({ kind: "form", id: f.id, title: f.form?.title || "Form", line: `Signed ${shortDay(f.createdAt)}` })),
    },
    {
      heading: "Certificates",
      rows: certificates.map((c) => ({ kind: "certificate", id: c.id, title: c.batch?.title || "Certificate", line: `Issued ${shortDay(c.issuedOn || c.batch?.issuedOn)}` })),
    },
  ].filter((s) => s.rows.length);

  return (
    <section className="portal-shell mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Your records</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">My documents</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Everything you have signed with My Life Services, kept here for you. Open any of them whenever you need a copy.
      </p>

      {sections.map((s) => (
        <div key={s.heading}>
          <h2 className="mt-9 mb-3 text-[13px] font-bold uppercase tracking-wider text-faint">{s.heading}</h2>
          <ul className="grid gap-2.5">
            {s.rows.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <a
                  href={`/portal/documents/${r.kind}/${r.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card-lift flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-sm"
                >
                  <FileText aria-hidden="true" className="h-8 w-8 flex-none text-faint" strokeWidth={1.5} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-foreground">{r.title}</span>
                    <span className="block text-[12.5px] text-muted">{r.line}</span>
                  </span>
                  {r.approved && (
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-700 dark:text-emerald-400">
                      Approved
                    </span>
                  )}
                  <span className="rounded-md border border-border-strong px-3 py-1.5 text-[13px] font-semibold text-brand">Open</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
