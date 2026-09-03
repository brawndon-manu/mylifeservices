import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { monthLabelOf } from "@/lib/timesheet/budget-capture";
import BackLink from "@/components/BackLink";
import { uploadBudgetCapture, deleteBudgetMonth } from "./actions";

export const metadata = { title: "Audit", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const BUDGET_ERRORS = {
  nofile: "Pick the Budget Capture Report file first.",
  notitle:
    "That file doesn't carry the Budget Capture Report title line, so its month can't be read.",
  crossmonth:
    "That report spans more than one calendar month. Authorized hours are monthly - export it for one month.",
  empty: "No client rows with authorized hours were found in that file.",
  unreadable: "That file couldn't be read as a QSP .xls export.",
};

export default async function AuditPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  const sp = await searchParams;
  const budgetSaved =
    typeof sp?.budget === "string" && /^\d{4}-\d{2}$/.test(sp.budget)
      ? { month: monthLabelOf(sp.budget), clients: Number(sp.clients) || 0, skipped: Number(sp.skipped) || 0 }
      : null;
  const budgetError = sp?.budgeterr ? BUDGET_ERRORS[sp.budgeterr] || "Something went wrong." : null;

  // which months already have authorized hours on file
  const budgetMonths = await prisma.clientAuthorization.groupBy({
    by: ["monthKey"],
    _count: true,
    _max: { createdAt: true },
    orderBy: { monthKey: "desc" },
  });

  // A PAY PERIOD, NOT AN UPLOAD OF ITS OWN, 2026-08-27. Mánu: "i want to be
  // able to upload all of this info just to the timesheets page ... i also want
  // to do it by timesheet pay period." The service notes arrive with every
  // other export now, so this lists the periods that have them.
  //
  // SELECTED WITHOUT `notes`. That column holds every note of the period -
  // about a megabyte for a fortnight - and a list of a year of them would pull
  // twenty-six megabytes to print twenty-six dates. The schema says so beside
  // the field.
  const batches = await prisma.timesheetBatch.findMany({
    // a period appears here through its payroll upload's service notes, or as
    // an audit copy - fresh exports uploaded for this page alone, superseding
    // nothing on the payroll side
    where: {
      program: "MLS",
      OR: [{ serviceNotes: { isNot: null } }, { auditOnly: true }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, periodFrom: true, periodTo: true, auditOnly: true,
      notesName: true, serviceNotesName: true, createdAt: true,
      serviceNotes: { select: { noteCount: true, pdfCount: true, serviceCount: true } },
      uploadedBy: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
    },
  });

  return (
    <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin">Back to Admin</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">Admin</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Audit</h1>
        <Link
          href="/portal/admin/audit/new"
          className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
        >
          Upload an audit copy
        </Link>
      </div>

      <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
        What was billed for a shift, against what the clock recorded and what the service note
        documents. Every document arrives together on the pay period, so a period appears here
        once its service notes have been uploaded under Timesheets.
      </p>

      {budgetError && (
        <div className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-950/30">
          <p className="text-sm font-medium text-rose-900 dark:text-rose-200">{budgetError}</p>
        </div>
      )}
      {budgetSaved && (
        <div className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/40 dark:bg-emerald-950/30">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
            Authorized hours for {budgetSaved.month} are on file: {budgetSaved.clients} clients.
            {budgetSaved.skipped > 0 &&
              ` ${budgetSaved.skipped} rows carried no readable hours and were left out.`}
          </p>
        </div>
      )}

      {/* THE MONTH'S AUTHORIZED HOURS. One figure per client per month, read
          off the Budget Capture Report - the client report on each period
          measures billable hours against this. */}
      <div className="mt-8 rounded-xl border border-border bg-surface p-5">
        <form action={uploadBudgetCapture} className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="budget-file" className="block text-sm font-semibold text-foreground">
              Client authorized hours (Budget Capture Report .xls)
            </label>
            <p className="mt-1 text-xs text-muted">
              QSP &gt; Reports &gt; Budget Capture Report, exported for one calendar month. The
              month is read off the document; uploading a month again replaces it.
            </p>
            <input
              id="budget-file"
              name="file"
              type="file"
              accept=".xls,application/vnd.ms-excel"
              required
              className="mt-3 block w-full text-sm text-muted file:mr-4 file:rounded-md file:border-0 file:bg-brand-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-brand-light px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
          >
            Upload
          </button>
        </form>
        {budgetMonths.length > 0 && (
          <ul className="mt-4 space-y-1.5 border-t border-border pt-3">
            {budgetMonths.map((m) => (
              <li key={m.monthKey} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-medium text-foreground">{monthLabelOf(m.monthKey)}</span>
                <span className="text-muted">{m._count} clients with authorized hours</span>
                <form action={deleteBudgetMonth}>
                  <input type="hidden" name="monthKey" value={m.monthKey} />
                  <button
                    type="submit"
                    className="text-xs font-medium text-muted underline decoration-border-strong underline-offset-2 transition hover:text-rose-600"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      {batches.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border-strong bg-surface-2 p-10 text-center">
          <p className="text-sm font-medium text-foreground">No pay period has service notes yet.</p>
          <p className="mt-1 text-sm text-muted">
            Upload a period under Timesheets with the Employee Detailed Daily Service Notes and
            Employee Service Notes exports. Both are needed: Field Supervisors write into one
            and Independent Living Instructors into the other.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {batches.map((b) => (
            <li key={b.id}>
              <Link
                href={`/portal/admin/audit/${b.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition hover:border-brand"
              >
                <span>
                  <span className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground">
                    {b.periodFrom} to {b.periodTo}
                    {b.auditOnly && (
                      <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
                        Audit copy
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {b.serviceNotes?.noteCount || 0} notes
                    {/* which reports they came off, because a period holding
                        only one of the two under-reports what was documented */}
                    {b.serviceNotes?.pdfCount && b.serviceNotes?.serviceCount
                      ? ` · ${b.serviceNotes.pdfCount} from the PDF, ${b.serviceNotes.serviceCount} from the .xls`
                      : b.serviceNotes?.serviceCount
                        ? " · the .xls only"
                        : b.serviceNotes
                          ? " · the PDF only"
                          : " · no service notes uploaded"}
                    {b.uploadedBy ? ` · uploaded by ${preferredName(b.uploadedBy)}` : ""}
                  </span>
                </span>
                <span className="text-sm font-semibold text-brand">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
