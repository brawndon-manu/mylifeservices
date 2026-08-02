import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import Avatar from "@/components/Avatar";
import { fuzzyGuesses } from "./match";
import { assignFormSubmission, unassignFormSubmission } from "./actions";
import AssignPicker from "./_components/AssignPicker";

export const metadata = {
  title: "Form submissions",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PERIODS = {
  "30": "Last 30 days",
  "90": "Last 90 days",
  year: "This year",
  all: "All time",
};

const ATTRIBUTION = {
  "signed-in": { label: "Signed in", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  "email-match": { label: "Email match", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  assigned: { label: "Assigned", cls: "bg-sky-100 text-brand" },
  unassigned: { label: "Needs assignment", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
};

function periodStart(period) {
  const now = new Date();
  if (period === "30") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (period === "90") return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function FormSubmissionsPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) redirect("/portal");
  const sp = await searchParams;

  const formFilter = typeof sp?.form === "string" ? sp.form : "";
  const statusFilter = typeof sp?.status === "string" ? sp.status : "all";
  const period = typeof sp?.period === "string" && PERIODS[sp.period] ? sp.period : "all";
  const q = typeof sp?.q === "string" ? sp.q.trim() : "";

  const where = {};
  if (formFilter) where.formId = formFilter;
  if (statusFilter === "unassigned") where.attribution = "unassigned";
  else if (statusFilter === "attributed") where.attribution = { in: ["signed-in", "email-match", "assigned"] };
  const since = periodStart(period);
  if (since) where.createdAt = { gte: since };
  if (q) {
    where.OR = [
      { submitterName: { contains: q, mode: "insensitive" } },
      { submitterEmail: { contains: q, mode: "insensitive" } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { user: { preferredFirstName: { contains: q, mode: "insensitive" } } },
      { user: { preferredLastName: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [submissions, forms, activeUsers] = await Promise.all([
    prisma.formSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        form: { select: { id: true, title: true } },
        user: { select: { id: true, name: true, preferredFirstName: true, preferredLastName: true, title: true, image: true, email: true } },
      },
    }),
    prisma.form.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.user.findMany({
      where: { deactivatedAt: null },
      select: { id: true, name: true, preferredFirstName: true, preferredLastName: true, title: true, image: true },
      orderBy: [{ preferredFirstName: "asc" }, { name: "asc" }],
    }),
  ]);

  const candidates = activeUsers.map((u) => ({
    id: u.id,
    displayName: preferredName(u),
    title: u.title || "",
    image: u.image || null,
  }));

  const needsAssignment = submissions.filter((s) => s.attribution === "unassigned").length;

  const qs = (overrides) => {
    const params = new URLSearchParams();
    const next = { form: formFilter, status: statusFilter, period, q, ...overrides };
    for (const [k, v] of Object.entries(next)) {
      if (v && v !== "all") params.set(k, v);
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin">Back to Admin</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Admin</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Form submissions
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        Every signed form on file: who submitted it, how it was attributed, and a
        gated download. Reconcile the no-login ones by assigning them to the right
        person.
      </p>

      {needsAssignment > 0 && (
        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {needsAssignment} submission{needsAssignment === 1 ? "" : "s"} still need{needsAssignment === 1 ? "s" : ""} assignment.
        </div>
      )}

      <form className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-2 p-4">
        <div>
          <label htmlFor="form" className="block text-xs font-medium text-muted">Form</label>
          <select
            id="form"
            name="form"
            defaultValue={formFilter}
            className="mt-1 rounded-md border border-border-strong bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-brand focus:outline-none"
          >
            <option value="">All forms</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>{f.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="block text-xs font-medium text-muted">Status</label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className="mt-1 rounded-md border border-border-strong bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-brand focus:outline-none"
          >
            <option value="all">All</option>
            <option value="unassigned">Needs assignment</option>
            <option value="attributed">Attributed</option>
          </select>
        </div>
        <div>
          <label htmlFor="period" className="block text-xs font-medium text-muted">Period</label>
          <select
            id="period"
            name="period"
            defaultValue={period}
            className="mt-1 rounded-md border border-border-strong bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-brand focus:outline-none"
          >
            {Object.entries(PERIODS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="q" className="block text-xs font-medium text-muted">Search person</label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q}
            placeholder="Name or email…"
            className="mt-1 w-full rounded-md border border-border-strong bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand-light px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand"
        >
          Filter
        </button>
        {(formFilter || statusFilter !== "all" || period !== "all" || q) && (
          <a href="/portal/admin/forms" className="text-sm font-medium text-muted transition hover:text-foreground">
            Clear
          </a>
        )}
      </form>

      {submissions.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border-strong bg-surface-2 p-10 text-center">
          <p className="text-sm font-medium text-foreground">No submissions match.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {submissions.map((s) => {
            const attr = ATTRIBUTION[s.attribution] || ATTRIBUTION.unassigned;
            const suggestions =
              s.attribution === "unassigned" ? fuzzyGuesses(s.submitterName, candidates) : [];
            return (
              <li key={s.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{s.form.title}</p>
                    <p className="mt-1 text-xs text-muted">{fmtDate(s.createdAt)}</p>
                  </div>
                  <span className={`flex-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${attr.cls}`}>
                    {attr.label}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {s.user ? (
                      <>
                        <Avatar name={preferredName(s.user)} image={s.user.image} size={28} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{preferredName(s.user)}</p>
                          <p className="truncate text-xs text-muted">{s.user.email}</p>
                        </div>
                      </>
                    ) : (
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{s.submitterName}</p>
                        <p className="truncate text-xs text-muted">{s.submitterEmail} · typed at submission</p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-none items-center gap-2">
                    {s.attribution === "unassigned" && (
                      <AssignPicker
                        submissionId={s.id}
                        candidates={candidates}
                        suggestions={suggestions}
                        assign={assignFormSubmission}
                      />
                    )}
                    {s.attribution === "email-match" && (
                      <form action={unassignFormSubmission.bind(null, s.id)}>
                        <button
                          type="submit"
                          className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-muted transition hover:text-foreground"
                        >
                          Not them?
                        </button>
                      </form>
                    )}
                    <a
                      href={`/portal/admin/forms/${s.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-muted transition hover:text-foreground"
                    >
                      Download
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
