import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageClientAttestations } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { companyDate } from "@/lib/company-time";
import BackLink from "@/components/BackLink";

export const metadata = {
  title: "Client attestations by caseload",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// THE MONTH BY CASELOAD: the same rows as the batch screen, arranged as the
// hierarchy - field supervisor, their staff, each staff member's clients - with
// where every signature stands.
export default async function BatchByCaseloadPage({ params }) {
  const user = await getCurrentUser();
  if (!canManageClientAttestations(user?.role)) redirect("/portal");
  const { id } = await params;

  const batch = await prisma.clientAttestationBatch.findUnique({
    where: { id },
    include: {
      attestations: {
        orderBy: { clientName: "asc" },
        include: {
          staffUser: {
            select: {
              id: true,
              name: true,
              preferredFirstName: true,
              preferredLastName: true,
              title: true,
            },
          },
          supervisor: {
            select: { id: true, name: true, preferredFirstName: true, preferredLastName: true },
          },
        },
      },
    },
  });
  if (!batch) notFound();

  // staff -> clients, then supervisor -> staff. Rows with no matched staff sit
  // in their own block at the end rather than vanishing.
  const byStaff = new Map();
  const unassigned = [];
  for (const a of batch.attestations) {
    if (!a.staffUser) {
      unassigned.push(a);
      continue;
    }
    const k = a.staffUser.id;
    if (!byStaff.has(k)) byStaff.set(k, { staff: a.staffUser, supervisor: a.supervisor, rows: [] });
    const g = byStaff.get(k);
    g.rows.push(a);
    if (!g.supervisor && a.supervisor) g.supervisor = a.supervisor;
  }

  const bySupervisor = new Map();
  const noSupervisor = [];
  for (const g of byStaff.values()) {
    if (g.supervisor) {
      const k = g.supervisor.id;
      if (!bySupervisor.has(k)) bySupervisor.set(k, { supervisor: g.supervisor, groups: [] });
      bySupervisor.get(k).groups.push(g);
    } else {
      noSupervisor.push(g);
    }
  }
  const blocks = [...bySupervisor.values()].sort((a, b) =>
    preferredName(a.supervisor).localeCompare(preferredName(b.supervisor)),
  );
  for (const b of blocks)
    b.groups.sort((a, z) => preferredName(a.staff).localeCompare(preferredName(z.staff)));
  noSupervisor.sort((a, z) => preferredName(a.staff).localeCompare(preferredName(z.staff)));

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href={`/portal/admin/client-attestations/${batch.id}`}>
        Back to {batch.monthLabel}
      </BackLink>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {batch.monthLabel} by caseload
        </h1>
        <Link
          href="/portal/admin/client-attestations/caseloads"
          className="text-sm font-semibold text-brand hover:underline"
        >
          Assignments →
        </Link>
      </div>

      <div className="mt-8 space-y-8">
        {blocks.map((b) => (
          <SupervisorBlock
            key={b.supervisor.id}
            title={preferredName(b.supervisor)}
            groups={b.groups}
            batchId={batch.id}
          />
        ))}
        {noSupervisor.length > 0 && (
          <SupervisorBlock
            title="No field supervisor set"
            tone="warn"
            groups={noSupervisor}
            batchId={batch.id}
          />
        )}
        {unassigned.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              No staff matched
            </h2>
            <ul className="mt-3 grid gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {unassigned.map((a) => (
                <ClientLine key={a.id} a={a} batchId={batch.id} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function SupervisorBlock({ title, tone, groups, batchId }) {
  const rows = groups.flatMap((g) => g.rows);
  const signed = rows.filter((a) => a.signedAt).length;
  return (
    <div
      className={`rounded-2xl border p-5 ${
        tone === "warn"
          ? "border-amber-400/60 bg-amber-50/50 dark:border-amber-400/30 dark:bg-amber-950/20"
          : "border-border bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="text-sm text-muted">
          {groups.length} staff · {rows.length} clients · {signed} signed
        </p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <div key={g.staff.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{preferredName(g.staff)}</p>
                {g.staff.title && <p className="text-xs text-muted">{g.staff.title}</p>}
              </div>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
                {g.rows.filter((a) => a.signedAt).length}/{g.rows.length}
              </span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {g.rows.map((a) => (
                <ClientLine key={a.id} a={a} batchId={batchId} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientLine({ a, batchId }) {
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span className="min-w-0 truncate text-muted">
        {a.formUrl ? (
          <a
            href={`/portal/admin/client-attestations/${batchId}/form/${a.id}`}
            className="hover:text-brand hover:underline"
          >
            {a.clientName}
          </a>
        ) : (
          a.clientName
        )}
      </span>
      {a.signedAt ? (
        <span
          title={`Signed ${companyDate(a.signedAt)}`}
          className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
        >
          Signed
        </span>
      ) : a.clientSignedAt ? (
        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
          Client signed
        </span>
      ) : a.sentAt ? (
        <span className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
          Sent
        </span>
      ) : (
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-faint">
          Not sent
        </span>
      )}
    </li>
  );
}
