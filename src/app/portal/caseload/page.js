import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { preferredName } from "@/lib/contacts";
import BackLink from "@/components/BackLink";

export const metadata = {
  title: "My caseload",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// WHAT THE SIGNED-IN PERSON IS IN CHARGE OF, off the imported client roster.
//
// Two shapes, and one page can be both at once:
//
//   an ILS staff member sees the clients assigned to them
//   a field supervisor sees their staff, and each staff member's clients
//
// Somebody who supervises staff AND carries their own clients gets both. The
// page reads from the same Client table and User.supervisorId mapping the admin
// screens use, so what a supervisor sees here is exactly what the attestation
// routing believes.
export default async function MyCaseloadPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/portal");

  const [ownClients, team] = await Promise.all([
    prisma.client.findMany({
      where: { staffUserId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, office: true, status: true },
    }),
    prisma.user.findMany({
      where: { supervisorId: user.id, deactivatedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        preferredFirstName: true,
        preferredLastName: true,
        title: true,
        clientsAssigned: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, office: true, status: true },
        },
      },
    }),
  ]);

  const teamClients = team.reduce((t, s) => t + s.clientsAssigned.length, 0);

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href="/portal">Back to Dashboard</BackLink>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        My caseload
      </h1>
      <p className="mt-2 text-sm text-muted">
        {[
          ownClients.length > 0 &&
            `${ownClients.length} client${ownClients.length === 1 ? "" : "s"} assigned to you`,
          team.length > 0 &&
            `${team.length} staff with ${teamClients} client${teamClients === 1 ? "" : "s"} under your supervision`,
        ]
          .filter(Boolean)
          .join(" · ") || "Nothing is assigned to you on the client roster."}
      </p>

      {ownClients.length > 0 && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Your clients
          </h2>
          <ClientList clients={ownClients} />
        </div>
      )}

      {team.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Your staff
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {team.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{preferredName(s)}</p>
                    {s.title && <p className="text-xs text-muted">{s.title}</p>}
                  </div>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
                    {s.clientsAssigned.length}
                  </span>
                </div>
                {s.clientsAssigned.length > 0 ? (
                  <ClientList clients={s.clientsAssigned} compact />
                ) : (
                  <p className="mt-3 text-sm text-muted">
                    No clients on the roster.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ClientList({ clients, compact = false }) {
  return (
    <ul
      className={
        compact
          ? "mt-3 space-y-0.5 text-sm text-muted"
          : "mt-3 grid gap-x-8 gap-y-1 text-sm text-muted sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {clients.map((c) => (
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
  );
}
