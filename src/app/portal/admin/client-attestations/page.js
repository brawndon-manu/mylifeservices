import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageClientAttestations } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { companyDate } from "@/lib/company-time";
import BackLink from "@/components/BackLink";

export const metadata = {
  title: "Client attestations",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// ONE CARD PER MONTH. The job runs monthly, so the month is the unit - the same
// way the timesheets list is one card per pay period.
export default async function ClientAttestationsPage() {
  const user = await getCurrentUser();
  if (!canManageClientAttestations(user?.role)) redirect("/portal");

  const batches = await prisma.clientAttestationBatch.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: {
        select: { name: true, preferredFirstName: true, preferredLastName: true },
      },
      attestations: {
        select: { id: true, signedAt: true, sentAt: true, supervisorUserId: true, formUrl: true },
      },
    },
  });

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin">Back to Admin</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Admin
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Client attestations
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/portal/admin/client-attestations/caseloads"
            className="rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-2"
          >
            Caseloads
          </Link>
          <Link
            href="/portal/admin/client-attestations/new"
            className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
          >
            Upload this month&apos;s schedule
          </Link>
        </div>
      </div>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
        Upload the QSP Client Schedules export for the month. Every client&apos;s
        schedule becomes its own form with a supervisor sign-off block under it -
        confirming the client was given their schedule, wants to continue with
        their current staff, and that staff have been showing up as scheduled.
      </p>

      {batches.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border-strong bg-surface-2 p-10 text-center">
          <p className="text-sm font-medium text-foreground">
            No months uploaded yet.
          </p>
          <p className="mt-1 text-sm text-muted">
            Pull Client Schedules from QSP for the whole month, then upload the
            PDF here.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {batches.map((b) => {
            const total = b.attestations.length;
            const signed = b.attestations.filter((a) => a.signedAt).length;
            const unrouted = b.attestations.filter((a) => !a.supervisorUserId).length;
            const noForm = b.attestations.filter((a) => !a.formUrl).length;
            return (
              <li
                key={b.id}
                className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
              >
                <Link
                  href={`/portal/admin/client-attestations/${b.id}`}
                  className="group block p-5 card-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold tracking-tight text-foreground">
                        {b.monthLabel}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Uploaded {companyDate(b.createdAt)} by{" "}
                        {preferredName(b.uploadedBy) || "someone"}
                      </p>
                    </div>
                    <span
                      aria-hidden="true"
                      className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                    >
                      →
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                    <Stat label="Clients" value={total} />
                    <Stat label="Signed" value={`${signed} of ${total}`} />
                    <Stat
                      label="No supervisor yet"
                      value={unrouted}
                      tone={unrouted ? "warn" : "ok"}
                    />
                    {noForm > 0 && (
                      <Stat label="Form failed" value={noForm} tone="warn" />
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-faint">
        {label}
      </p>
      <p
        className={`mt-0.5 font-semibold ${
          tone === "warn"
            ? "text-amber-700 dark:text-amber-400"
            : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
