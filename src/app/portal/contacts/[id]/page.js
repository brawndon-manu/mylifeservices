import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isSupervisorPlus, ROLE_LABELS } from "@/lib/roles";
import { clientDisplayName, CLIENT_FIRST_MAX } from "@/lib/clients";
import Avatar from "@/components/Avatar";
import ConfirmButton from "@/components/ConfirmButton";
import { addClient, reassignClient, deleteClient } from "../actions";

export const metadata = {
  title: "Contact · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function ContactDetailPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const viewer = await getCurrentUser();

  const person = await prisma.user.findFirst({
    where: { id, deactivatedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      title: true,
      phone: true,
      image: true,
      workingHours: true,
    },
  });
  if (!person) notFound();

  // caseload is need-to-know: supervisor+ OR the person viewing their own.
  const canManage = isSupervisorPlus(viewer.role);
  const canSeeCaseload = canManage || viewer.id === person.id;

  let clients = [];
  let staffOptions = [];
  if (canSeeCaseload) {
    clients = await prisma.client.findMany({
      where: { assignedToId: person.id },
      orderBy: [{ firstName: "asc" }],
    });
  }
  if (canManage) {
    // active staff for the reassign dropdown
    staffOptions = await prisma.user.findMany({
      where: { deactivatedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
  }

  const clientNameError = sp?.error === "clientName";

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <Link
        href="/portal/contacts"
        className="text-sm font-medium text-slate-600 transition hover:text-brand"
      >
        ← Back to Team Contacts
      </Link>

      {/* profile header */}
      <div className="mt-4 flex items-start gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <Avatar
          name={person.name}
          email={person.email}
          image={person.image}
          size={80}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {person.name || person.email}
            </h1>
            <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-brand">
              {ROLE_LABELS[person.role] ?? person.role}
            </span>
          </div>
          {person.title && (
            <p className="text-sm text-slate-600">{person.title}</p>
          )}
          <div className="mt-3 space-y-1 text-sm">
            <a
              href={`mailto:${person.email}`}
              className="block text-brand underline-offset-2 hover:underline"
            >
              {person.email}
            </a>
            {person.phone && (
              <a
                href={`tel:${person.phone.replace(/[^\d+]/g, "")}`}
                className="block text-slate-700 underline-offset-2 hover:underline"
              >
                {person.phone}
              </a>
            )}
            {person.workingHours && (
              <p className="text-slate-700">
                <span className="font-medium text-slate-500">Hours:</span>{" "}
                {person.workingHours}
              </p>
            )}
          </div>
          {viewer.id === person.id && (
            <Link
              href="/portal/settings"
              className="mt-3 inline-block text-xs font-medium text-slate-500 underline-offset-2 hover:text-brand hover:underline"
            >
              Edit your photo, phone &amp; hours in Settings →
            </Link>
          )}
        </div>
      </div>

      {/* caseload - need-to-know only */}
      {canSeeCaseload && (
        <div className="mt-8">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Caseload
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {clients.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Clients {viewer.id === person.id ? "you support" : "this person supports"}.
            Visible only to supervisors, management, and the person themselves.
          </p>

          <ul className="mt-4 space-y-2">
            {clients.length === 0 ? (
              <li className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                No clients assigned.
              </li>
            ) : (
              clients.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-900">
                      {clientDisplayName(c)}
                    </p>
                    {canManage && (
                      <form action={deleteClient.bind(null, c.id)}>
                        <ConfirmButton
                          message={`Remove ${clientDisplayName(c)} from the caseload?`}
                          className="text-xs font-medium text-rose-600 transition hover:text-rose-700"
                        >
                          Remove
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                  {c.notes && (
                    <p className="mt-1 text-sm text-slate-600">{c.notes}</p>
                  )}
                  {canManage && (
                    <form
                      action={reassignClient.bind(null, c.id)}
                      className="mt-2 flex items-center gap-2"
                    >
                      <label className="text-xs text-slate-500">
                        Reassign:
                      </label>
                      <select
                        name="assignedToId"
                        defaultValue={person.id}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      >
                        <option value="">Unassigned</option>
                        {staffOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name || s.email}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 transition hover:border-brand hover:text-brand"
                      >
                        Move
                      </button>
                    </form>
                  )}
                </li>
              ))
            )}
          </ul>

          {/* add client - supervisor+ */}
          {canManage && (
            <form
              action={addClient.bind(null, person.id)}
              className="mt-4 rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="text-sm font-medium text-slate-700">
                Add a client to this caseload
              </p>
              {clientNameError && (
                <p className="mt-1 text-xs text-rose-700">
                  First name and a last initial are required.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  type="text"
                  name="firstName"
                  required
                  maxLength={CLIENT_FIRST_MAX}
                  placeholder="First name"
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <input
                  type="text"
                  name="lastInitial"
                  required
                  maxLength={1}
                  placeholder="Last initial"
                  className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <input
                type="text"
                name="notes"
                placeholder="Notes (optional)"
                className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  className="rounded-md bg-brand-light px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand"
                >
                  Add client
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Privacy: first name + last initial only. No full names,
                addresses, or DOB.
              </p>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
