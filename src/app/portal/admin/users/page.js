import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, isSuper, canSeeRoles, ROLE_LABELS, roleBadgeClass } from "@/lib/roles";
import { preferredName, legalName } from "@/lib/contacts";

export const metadata = {
  title: "User management",
  robots: { index: false, follow: false },
};

// map of url-friendly sort keys -> { prisma field, nullable }. only keys
// in this map are accepted - anything else falls back to default sort.
const SORTABLE_COLUMNS = {
  email: { field: "email", nullable: false },
  name: { field: "name", nullable: true },
  title: { field: "title", nullable: true },
  hired: { field: "hireDate", nullable: true },
  role: { field: "role", nullable: false },
  status: { field: "deactivatedAt", nullable: true },
  created: { field: "createdAt", nullable: false },
};

// custom role priority for the role-column sort (org-chart order, not alpha).
const ROLE_SORT_ORDER = {
  SUPER: 0,
  ADMIN: 1,
  MANAGER: 2,
  SUPERVISOR: 3,
  IT_ADMIN: 4,
  HR: 5,
  STAFF: 6,
};

function buildOrderBy(sort, dir) {
  if (!sort || !SORTABLE_COLUMNS[sort]) {
    return [
      { deactivatedAt: { sort: "asc", nulls: "first" } },
      { createdAt: "desc" },
    ];
  }
  if (sort === "role") {
    return [{ name: { sort: "asc", nulls: "last" } }];
  }
  const { field, nullable } = SORTABLE_COLUMNS[sort];
  const direction = dir === "desc" ? "desc" : "asc";
  if (nullable) {
    return [{ [field]: { sort: direction, nulls: "last" } }];
  }
  return [{ [field]: direction }];
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function tenureLabel(hireDate, now = new Date()) {
  const months =
    (now.getFullYear() - hireDate.getFullYear()) * 12 +
    (now.getMonth() - hireDate.getMonth());
  if (months < 0) return "starts soon";
  if (months === 0) return "<1mo";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}mo`;
  if (m === 0) return `${y}y`;
  return `${y}y ${m}mo`;
}

function sortByRolePriority(users, dir) {
  const reverse = dir === "desc";
  return [...users].sort((a, b) => {
    const aRank = ROLE_SORT_ORDER[a.role] ?? 99;
    const bRank = ROLE_SORT_ORDER[b.role] ?? 99;
    if (aRank === bRank) return 0;
    return reverse ? bRank - aRank : aRank - bRank;
  });
}

function sortHref(column, currentSort, currentDir) {
  let nextDir = "asc";
  if (currentSort === column) {
    nextDir = currentDir === "asc" ? "desc" : "asc";
  }
  const params = new URLSearchParams({ sort: column, dir: nextDir });
  return `/portal/admin/users?${params.toString()}`;
}

export default async function UsersPage({ searchParams }) {
  const current = await getCurrentUser();
  if (!isElevated(current?.role)) {
    redirect("/portal");
  }

  // privilege roles are Admin/IT/Super only - hide the role column from
  // HR/Manager (they manage users but never see the privilege tier).
  const showRoles = canSeeRoles(current.role);

  const params = await searchParams;
  const justInvited = typeof params?.invited === "string" ? params.invited : null;
  const justUpdated = typeof params?.updated === "string" ? params.updated : null;
  const justDeactivated = typeof params?.deactivated === "string" ? params.deactivated : null;
  const justReactivated = typeof params?.reactivated === "string" ? params.reactivated : null;
  const adminError = typeof params?.error === "string" ? params.error : null;

  const rawSort = typeof params?.sort === "string" ? params.sort : null;
  const rawDir = typeof params?.dir === "string" ? params.dir : null;
  const sort = rawSort && SORTABLE_COLUMNS[rawSort] ? rawSort : null;
  const dir = rawDir === "desc" ? "desc" : "asc";

  let users = await prisma.user.findMany({
    orderBy: buildOrderBy(sort, dir),
    select: {
      id: true,
      email: true,
      name: true,
      preferredFirstName: true,
      preferredLastName: true,
      role: true,
      title: true,
      hireDate: true,
      createdAt: true,
      deactivatedAt: true,
    },
  });

  if (sort === "role") {
    users = sortByRolePriority(users, dir);
  }

  const activeCount = users.filter((u) => !u.deactivatedAt).length;
  const deactivatedCount = users.length - activeCount;

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <Link
        href="/portal/admin"
        className="text-sm font-medium text-muted transition hover:text-brand"
      >
        ← Back to admin dashboard
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            User management
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
            {activeCount} active
            {deactivatedCount > 0 && (
              <>
                {" "}
                · <span className="text-muted">{deactivatedCount} deactivated</span>
              </>
            )}
            . Sign-in is invite-only: only active emails in this list can log in.
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
          admin. This prevents you from accidentally locking yourself out.
        </Banner>
      )}
      {adminError === "notfound" && (
        <Banner kind="error" title="User not found">
          That user may have been deleted. Refresh the list.
        </Banner>
      )}
      {adminError === "forbidden" && (
        <Banner kind="error" title="Not allowed">
          You can&apos;t manage a user whose role is above your own.
        </Banner>
      )}

      <div className="mt-10 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wider text-muted">
            <tr>
              <SortableHeader column="email" sort={sort} dir={dir}>Email</SortableHeader>
              <SortableHeader column="name" sort={sort} dir={dir}>Name</SortableHeader>
              <SortableHeader column="title" sort={sort} dir={dir}>Title</SortableHeader>
              <SortableHeader column="hired" sort={sort} dir={dir}>Hired</SortableHeader>
              {showRoles && (
                <SortableHeader column="role" sort={sort} dir={dir}>Role</SortableHeader>
              )}
              <SortableHeader column="status" sort={sort} dir={dir}>Status</SortableHeader>
              <SortableHeader column="created" sort={sort} dir={dir}>Created</SortableHeader>
              <th className="px-6 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-muted">
            {users.map((u) => {
              const isDeactivated = !!u.deactivatedAt;
              const isSelf = u.id === current.id;
              return (
                <tr key={u.id} className={isDeactivated ? "bg-surface-2 text-faint" : ""}>
                  <td className="whitespace-nowrap px-6 py-3">
                    <span className={isDeactivated ? "line-through" : ""}>{u.email}</span>
                    {isSelf && (
                      <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-brand">
                        you
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3">
                    {preferredName(u) ? (
                      <>
                        <div>{preferredName(u)}</div>
                        {legalName(u) && (
                          <div className="text-xs text-faint">{legalName(u)}</div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-muted">
                    {u.title ?? <span className="text-faint">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3">
                    {u.hireDate ? (
                      <div>
                        <div className="text-muted">{DATE_FMT.format(u.hireDate)}</div>
                        <div className="text-xs text-faint">{tenureLabel(u.hireDate)}</div>
                      </div>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  {showRoles && (
                    <td className="whitespace-nowrap px-6 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          isDeactivated ? "bg-surface-3 text-muted" : roleBadgeClass(u.role)
                        }`}
                      >
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                  )}
                  <td className="whitespace-nowrap px-6 py-3">
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
                  <td className="whitespace-nowrap px-6 py-3 text-muted">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-right">
                    {isSelf && !isSuper(current.role) ? (
                      <span className="text-xs text-faint">Use Settings</span>
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

function SortableHeader({ column, sort, dir, children }) {
  const isActive = sort === column;
  const arrow = isActive ? (dir === "desc" ? "↓" : "↑") : null;
  return (
    <th className="px-6 py-3 font-semibold">
      <Link
        href={sortHref(column, sort, dir)}
        className={`inline-flex items-center gap-1 rounded transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          isActive ? "text-brand" : ""
        }`}
      >
        <span>{children}</span>
        <span aria-hidden="true" className={`text-[10px] ${isActive ? "" : "opacity-0"}`}>
          {arrow ?? "↑"}
        </span>
      </Link>
    </th>
  );
}

function Banner({ kind, title, children }) {
  const styles = {
    success: { wrapper: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: "text-emerald-600", bodyTone: "text-emerald-800", Icon: CheckIcon },
    warning: { wrapper: "border-amber-200 bg-amber-50 text-amber-900", icon: "text-amber-600", bodyTone: "text-amber-800", Icon: InfoIcon },
    error: { wrapper: "border-rose-200 bg-rose-50 text-rose-900", icon: "text-rose-600", bodyTone: "text-rose-800", Icon: ExclamationIcon },
  };
  const { wrapper, icon, bodyTone, Icon } = styles[kind];
  return (
    <div role="status" className={`mt-6 flex items-start gap-3 rounded-md border p-4 text-sm ${wrapper}`}>
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
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}
function CheckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}
function InfoIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 9v5" />
      <path d="M10 6h.01" />
    </svg>
  );
}
function ExclamationIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 6v4" />
      <path d="M10 14h.01" />
    </svg>
  );
}
