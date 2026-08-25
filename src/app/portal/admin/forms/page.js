import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import { fmtPosted } from "../acknowledgments/roster";

export const metadata = {
  title: "Form submissions",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FormSubmissionsPage() {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) redirect("/portal");

  const [forms, counts, unassignedCounts] = await Promise.all([
    prisma.form.findMany({
      select: { id: true, title: true, category: true, fillable: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    }),
    prisma.formSubmission.groupBy({
      by: ["formId"],
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.formSubmission.groupBy({
      by: ["formId"],
      where: { attribution: "unassigned" },
      _count: { _all: true },
    }),
  ]);

  const countByForm = new Map(counts.map((c) => [c.formId, c]));
  const unassignedByForm = new Map(
    unassignedCounts.map((c) => [c.formId, c._count._all]),
  );

  const cards = forms.map((f) => {
    const c = countByForm.get(f.id);
    return {
      ...f,
      total: c?._count._all || 0,
      lastLabel: c?._max.createdAt ? fmtPosted(c._max.createdAt) : null,
      unassigned: unassignedByForm.get(f.id) || 0,
    };
  });

  const totalSubmissions = cards.reduce((n, c) => n + c.total, 0);
  const needsAssignment = cards.reduce((n, c) => n + c.unassigned, 0);

  return (
    <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/portal/admin">Back to Admin</BackLink>
        {/* file downloads, not pages - Link would try to client-navigate */}
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/portal/admin/forms/csv"
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Download CSV
          </a>
          <a
            href="/portal/admin/forms/pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Download report PDF
          </a>
          <a
            href="/portal/admin/forms/signed-pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand"
          >
            Download signed PDFs
          </a>
        </div>
      </div>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Admin</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Form submissions
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        One card per form in the library. A card opens the form&apos;s record:
        who signed it, when, and the downloads.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <span className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-muted">
          <b className="text-foreground">{totalSubmissions}</b> submission{totalSubmissions === 1 ? "" : "s"} on file
        </span>
        {needsAssignment > 0 && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <b>{needsAssignment}</b> need{needsAssignment === 1 ? "s" : ""} assignment
          </span>
        )}
      </div>

      {cards.length === 0 ? (
        <p className="mt-10 rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          No forms in the library yet.
        </p>
      ) : (
        <div className="mt-8 grid gap-3.5 sm:grid-cols-2">
          {cards.map((f) => (
            <Link
              key={f.id}
              href={`/portal/admin/forms/${f.id}`}
              className="group block rounded-xl border border-border bg-surface p-5 shadow-sm card-lift"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-base font-semibold tracking-tight text-foreground transition group-hover:text-brand dark:group-hover:text-brand-light">
                  {f.title}
                </p>
                {f.unassigned > 0 && (
                  <span className="flex-none rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    {f.unassigned} to assign
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">{f.category}</p>
              <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
                {f.total === 0 ? (
                  <span className="text-sm text-faint">No submissions yet</span>
                ) : (
                  <>
                    <span className="text-sm text-muted">
                      <b className="text-lg font-semibold text-foreground">{f.total}</b> signed
                    </span>
                    <span className="text-xs text-muted">last {f.lastLabel}</span>
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
