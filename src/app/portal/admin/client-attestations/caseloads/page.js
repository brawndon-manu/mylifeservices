import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageClientAttestations } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { titleHasSegment } from "@/lib/positions";
import BackLink from "@/components/BackLink";
import { uploadClientRoster, setStaffSupervisor } from "../actions";

export const metadata = {
  title: "Caseloads",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const ERRORS = {
  nofile: "Pick the roster file first.",
  parse: "That file couldn't be read as a spreadsheet (.xlsx).",
  columns:
    "That spreadsheet doesn't have the Client Name and Case Worker columns. The columns found are listed below.",
  empty: "No client rows found in that file.",
};

// THE HIERARCHY: Field Supervisor > Staff > Clients.
//
// The staff-to-client half comes off HR's roster import; the supervisor half is
// set here, per staff member, and everything routed by supervisor follows it.
export default async function CaseloadsPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!canManageClientAttestations(user?.role)) redirect("/portal");
  const sp = await searchParams;
  const error = sp?.error ? ERRORS[sp.error] || "Something went wrong." : null;
  const why = typeof sp?.why === "string" ? sp.why : null;

  const [clients, users] = await Promise.all([
    prisma.client.findMany({
      orderBy: { name: "asc" },
      include: {
        staffUser: {
          select: {
            id: true,
            name: true,
            preferredFirstName: true,
            preferredLastName: true,
            title: true,
            supervisorId: true,
            supervisor: {
              select: { id: true, name: true, preferredFirstName: true, preferredLastName: true },
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { deactivatedAt: null },
      select: {
        id: true,
        name: true,
        preferredFirstName: true,
        preferredLastName: true,
        title: true,
      },
    }),
  ]);

  const supervisors = users
    .filter((u) => titleHasSegment(u.title, "Field Supervisor"))
    .map((u) => ({ id: u.id, name: preferredName(u) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // staff -> clients, from the roster
  const byStaff = new Map();
  const unassigned = [];
  for (const c of clients) {
    if (!c.staffUser) {
      unassigned.push(c);
      continue;
    }
    const k = c.staffUser.id;
    if (!byStaff.has(k)) byStaff.set(k, { staff: c.staffUser, clients: [] });
    byStaff.get(k).clients.push(c);
  }

  // supervisor -> staff groups
  const bySupervisor = new Map();
  const noSupervisor = [];
  for (const g of byStaff.values()) {
    if (g.staff.supervisor) {
      const k = g.staff.supervisor.id;
      if (!bySupervisor.has(k))
        bySupervisor.set(k, { supervisor: g.staff.supervisor, groups: [] });
      bySupervisor.get(k).groups.push(g);
    } else {
      noSupervisor.push(g);
    }
  }
  const supervisorBlocks = [...bySupervisor.values()].sort((a, b) =>
    preferredName(a.supervisor).localeCompare(preferredName(b.supervisor)),
  );
  for (const b of supervisorBlocks)
    b.groups.sort((a, z) => preferredName(a.staff).localeCompare(preferredName(z.staff)));
  noSupervisor.sort((a, z) => preferredName(a.staff).localeCompare(preferredName(z.staff)));

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin/client-attestations">
        Back to Client attestations
      </BackLink>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Caseloads
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
        Which staff have which clients, imported from the QSP client roster, and
        which field supervisor each staff member reports to.
      </p>

      {error && (
        <div className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-950/30">
          <p className="text-sm font-medium text-rose-900 dark:text-rose-200">{error}</p>
          {why && <p className="mt-1 text-sm text-rose-800 dark:text-rose-300">{why}</p>}
        </div>
      )}

      <form
        action={uploadClientRoster}
        className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-5"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="file" className="block text-sm font-semibold text-foreground">
            Client roster (.xlsx)
          </label>
          <p className="mt-1 text-xs text-muted">
            The export with Client Name, Office, Case Worker, and Status columns.
            Importing replaces the current list. Client emails in the file are
            not stored.
          </p>
          <input
            id="file"
            name="file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="mt-3 block w-full text-sm text-muted file:mr-4 file:rounded-md file:border-0 file:bg-brand-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
        >
          Import roster
        </button>
      </form>

      {clients.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border-strong bg-surface-2 p-10 text-center">
          <p className="text-sm font-medium text-foreground">No roster imported yet.</p>
        </div>
      ) : (
        <div className="mt-10 space-y-8">
          {supervisorBlocks.map((b) => (
            <SupervisorBlock
              key={b.supervisor.id}
              title={preferredName(b.supervisor)}
              groups={b.groups}
              supervisors={supervisors}
            />
          ))}
          {noSupervisor.length > 0 && (
            <SupervisorBlock
              title="No field supervisor set"
              tone="warn"
              groups={noSupervisor}
              supervisors={supervisors}
            />
          )}
          {unassigned.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                No staff matched
              </h2>
              <p className="mt-1 text-sm text-muted">
                The roster names a case worker with no matching portal account,
                or no case worker at all.
              </p>
              <ul className="mt-3 grid gap-x-8 gap-y-1 text-sm text-muted sm:grid-cols-2 lg:grid-cols-3">
                {unassigned.map((c) => (
                  <li key={c.id}>
                    {c.name}
                    {c.caseWorkerName && (
                      <span className="text-faint"> · {c.caseWorkerName}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SupervisorBlock({ title, tone, groups, supervisors }) {
  const total = groups.reduce((t, g) => t + g.clients.length, 0);
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
          {groups.length} staff · {total} clients
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
                {g.clients.length}
              </span>
            </div>
            <form
              action={setStaffSupervisor.bind(null, g.staff.id)}
              className="mt-3 flex items-center gap-2"
            >
              <label className="text-xs font-medium text-faint" htmlFor={`sup-${g.staff.id}`}>
                Supervisor
              </label>
              <select
                id={`sup-${g.staff.id}`}
                name="supervisorId"
                defaultValue={g.staff.supervisorId || ""}
                className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-xs text-foreground"
              >
                <option value="">None</option>
                {supervisors
                  .filter((s) => s.id !== g.staff.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <button
                type="submit"
                className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-muted transition hover:text-foreground"
              >
                Save
              </button>
            </form>
            <ul className="mt-3 space-y-0.5 text-sm text-muted">
              {g.clients.map((c) => (
                <li key={c.id} className="truncate">
                  {c.name}
                  {c.status && c.status !== "Active" && (
                    <span className="ml-1.5 text-xs text-amber-700 dark:text-amber-400">
                      {c.status}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
