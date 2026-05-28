import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isSupervisorPlus } from "@/lib/roles";
import { clientDisplayName, CLIENT_FIRST_MAX } from "@/lib/clients";
import ConfirmButton from "@/components/ConfirmButton";
import { editClient, deleteClient } from "../../../actions";

export const metadata = {
  title: "Edit client · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function EditClientPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const viewer = await getCurrentUser();

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });
  if (!client) notFound();

  const elevated = isSupervisorPlus(viewer.role);
  const owns = client.assignedToId === viewer.id;
  if (!elevated && !owns) {
    redirect("/portal/contacts?error=forbidden");
  }

  // staff list for the reassign dropdown (supervisor+ only)
  let staffOptions = [];
  if (elevated) {
    staffOptions = await prisma.user.findMany({
      where: { deactivatedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
  }

  const backHref = client.assignedToId
    ? `/portal/contacts/${client.assignedToId}`
    : "/portal/contacts";
  const nameError = sp?.error === "clientName";

  const editBound = editClient.bind(null, id);

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <Link
        href={backHref}
        className="text-sm font-medium text-slate-600 transition hover:text-brand"
      >
        ← Back
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Edit client
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Currently: <span className="font-medium">{clientDisplayName(client)}</span>
        {client.assignedTo && (
          <> · {client.assignedTo.name || client.assignedTo.email}</>
        )}
      </p>

      {nameError && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          First name and a last initial are required.
        </div>
      )}

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <form action={editBound} className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="firstName"
                className="block text-sm font-medium text-slate-700"
              >
                First name <span className="text-rose-600">*</span>
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                required
                maxLength={CLIENT_FIRST_MAX}
                defaultValue={client.firstName}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div className="w-32">
              <label
                htmlFor="lastInitial"
                className="block text-sm font-medium text-slate-700"
              >
                Last initial <span className="text-rose-600">*</span>
              </label>
              <input
                id="lastInitial"
                name="lastInitial"
                type="text"
                required
                maxLength={1}
                defaultValue={client.lastInitial}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-slate-500">
            Privacy: first name + last initial only.
          </p>

          <div>
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-slate-700"
            >
              Notes <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={client.notes ?? ""}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {elevated && (
            <div>
              <label
                htmlFor="assignedToId"
                className="block text-sm font-medium text-slate-700"
              >
                Assigned to
              </label>
              <select
                id="assignedToId"
                name="assignedToId"
                defaultValue={client.assignedToId ?? ""}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                <option value="">Unassigned</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.email}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Reassign this client to a different staff member.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
            <Link
              href={backHref}
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
            >
              Save changes
            </button>
          </div>
        </form>
      </div>

      {/* delete */}
      <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-6">
        <h2 className="text-sm font-semibold text-rose-900">Remove client</h2>
        <p className="mt-1 text-sm text-rose-800">
          Deletes this client record entirely. This can&apos;t be undone.
        </p>
        <form action={deleteClient.bind(null, id)} className="mt-4">
          <ConfirmButton
            message={`Delete ${clientDisplayName(client)}? This can't be undone.`}
            className="rounded-md border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100"
          >
            Delete client
          </ConfirmButton>
        </form>
      </div>
    </section>
  );
}
