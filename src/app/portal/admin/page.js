import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, ROLE_LABELS } from "@/lib/roles";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage({ searchParams }) {
  // fresh role check from db - so if someone gets demoted mid-session,
  // they cant just keep an old jwt and stay on this page. proxy.js still
  // gates first based on the jwt, this is the secondary defense.
  const current = await getCurrentUser();
  if (!isElevated(current?.role)) {
    redirect("/portal");
  }

  // success/error flags from invite/edit/deactivate flows. each redirect
  // sets a different param so we can show a specific banner.
  const params = await searchParams;
  const justInvited = typeof params?.invited === "string" ? params.invited : null;
  const justUpdated = typeof params?.updated === "string" ? params.updated : null;
  const justDeactivated = typeof params?.deactivated === "string" ? params.deactivated : null;
  const justReactivated = typeof params?.reactivated === "string" ? params.reactivated : null;
  const adminError = typeof params?.error === "string" ? params.error : null;

  const users = await prisma.user.findMany({
    // active users at top, then deactivated at bottom. newest first
    // within each tier so freshly-added folks are easy to find.
    orderBy: [
      { deactivatedAt: { sort: "asc", nulls: "first" } },
      { createdAt: "desc" },
    ],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      title: true,
      createdAt: true,
      deactivatedAt: true,
    },
  });

  const activeCount = users.filter((u) => !u.deactivatedAt).length;
  const deactivatedCount = users.length - activeCount;

  return (
    <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-light">
        IT Admin
      </p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            User management
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-700">
            {activeCount} active
            {deactivatedCount > 0 && (
              <>
                {" "}
                · <span className="text-slate-500">{deactivatedCount} deactivated</span>
              </>
            )}
            . Sign-in is invite-only — only active emails in this list can log in.
          </p>
        </div>
        <Link
          href="/portal/admin/users/new"
          className="inline-flex items-center gap-2 rounded-md bg-brand-light px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <PlusIcon className="h-4 w-4" />
          Invite user
        </Link>
      </div>

      {/* Banners — only one shows at a time depending on what just happened */}
      {justInvited && (
        <Banner kind="success" title="User added">
          <span className="font-mono">{justInvited}</span> can now sign
          in at <span className="font-mono">/login</span>.
        </Banner>
      )}
      {justUpdated && (
        <Banner kind="success" title="Changes saved">
          User updated.
        </Banner>
      )}
      {justDeactivated && (
        <Banner kind="warning" title="User deactivated">
          <span className="font-mono">{justDeactivated}</span> can no longer
          sign in. Their data is preserved.
        </Banner>
      )}
      {justReactivated && (
        <Banner kind="success" title="User reactivated">
          <span className="font-mono">{justReactivated}</span> can sign in again.
        </Banner>
      )}
      {adminError === "self" && (
        <Banner kind="error" title="Can&apos;t edit yourself here">
          To change your own role or deactivate your account, ask another
          IT_ADMIN. This prevents you from accidentally locking yourself out.
        </Banner>
      )}
      {adminError === "notfound" && (
        <Banner kind="error" title="User not found">
          That user may have been deleted. Refresh the list.
        </Banner>
      )}

      <div className="mt-10 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
            <tr>
              <th className="px-6 py-3 font-semibold">Email</th>
              <th className="px-6 py-3 font-semibold">Name</th>
              <th className="px-6 py-3 font-semibold">Title</th>
              <th className="px-6 py-3 font-semibold">Role</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-semibold">Created</th>
              <th className="px-6 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700">
            {users.map((u) => {
              const isDeactivated = !!u.deactivatedAt;
              const isSelf = u.id === current.id;
              return (
                <tr
                  key={u.id}
                  className={isDeactivated ? "bg-slate-50 text-slate-400" : ""}
                >
                  <td className="px-6 py-3">
                    <span className={isDeactivated ? "line-through" : ""}>
                      {u.email}
                    </span>
                    {isSelf && (
                      <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-brand">
                        you
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3">{u.name ?? "—"}</td>
                  <td className="px-6 py-3 text-slate-600">
                    {u.title ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        isDeactivated
                          ? "bg-slate-200 text-slate-500"
                          : "bg-sky-100 text-brand"
                      }`}
                    >
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {isDeactivated ? (
                      <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                        Deactivated
                      </span>
                    ) : (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {isSelf ? (
                      <span className="text-xs text-slate-400">
                        Use Settings
                      </span>
                    ) : (
                      <Link
                        href={`/portal/admin/users/${u.id}/edit`}
                        className="text-sm font-medium text-brand-light transition hover:text-brand"
                      >
                        Edit →
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// shared banner component for the various success/warning/error messages
function Banner({ kind, title, children }) {
  const styles = {
    success: {
      wrapper: "border-emerald-200 bg-emerald-50 text-emerald-900",
      icon: "text-emerald-600",
      bodyTone: "text-emerald-800",
      Icon: CheckIcon,
    },
    warning: {
      wrapper: "border-amber-200 bg-amber-50 text-amber-900",
      icon: "text-amber-600",
      bodyTone: "text-amber-800",
      Icon: InfoIcon,
    },
    error: {
      wrapper: "border-rose-200 bg-rose-50 text-rose-900",
      icon: "text-rose-600",
      bodyTone: "text-rose-800",
      Icon: ExclamationIcon,
    },
  };
  const { wrapper, icon, bodyTone, Icon } = styles[kind];

  return (
    <div
      role="status"
      className={`mt-6 flex items-start gap-3 rounded-md border p-4 text-sm ${wrapper}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 flex-none ${icon}`} />
      <div>
        <p className="font-semibold">{title}</p>
        <p className={`mt-0.5 ${bodyTone}`}>{children}</p>
      </div>
    </div>
  );
}

function PlusIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

function InfoIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" />
      <path d="M10 9v5" />
      <path d="M10 6h.01" />
    </svg>
  );
}

function ExclamationIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" />
      <path d="M10 6v4" />
      <path d="M10 14h.01" />
    </svg>
  );
}
