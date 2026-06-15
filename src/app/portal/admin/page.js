import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, ROLE_LABELS, roleBadgeClass } from "@/lib/roles";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// map of url-friendly sort keys -> { prisma field, nullable }. only keys
// in this map are accepted - anything else falls back to default sort.
// keeps an attacker from passing weird strings into orderBy.
const SORTABLE_COLUMNS = {
  email: { field: "email", nullable: false },
  name: { field: "name", nullable: true },
  title: { field: "title", nullable: true },
  hired: { field: "hireDate", nullable: true },
  role: { field: "role", nullable: false },
  status: { field: "deactivatedAt", nullable: true },
  created: { field: "createdAt", nullable: false },
};

// custom role priority. when sorting by role we want Admin first then
// Manager etc - NOT alphabetical (which would put ADMIN, HR, IT_ADMIN,
// MANAGER, STAFF, SUPERVISOR which makes no sense in an org-chart sort).
// lower number = comes first when sorting asc.
const ROLE_SORT_ORDER = {
  SUPER: 0,
  ADMIN: 1,
  MANAGER: 2,
  SUPERVISOR: 3,
  IT_ADMIN: 4,
  HR: 5,
  STAFF: 6,
};

// build the prisma orderBy clause based on the url's sort + dir params.
// falls back to "active first, then newest" if no valid sort is requested.
function buildOrderBy(sort, dir) {
  if (!sort || !SORTABLE_COLUMNS[sort]) {
    return [
      { deactivatedAt: { sort: "asc", nulls: "first" } },
      { createdAt: "desc" },
    ];
  }
  // role uses a custom priority sort done in js after fetch (prisma
  // cant do org-chart-order natively). here we just give a stable
  // tiebreaker so the within-role ordering is alphabetical.
  if (sort === "role") {
    return [{ name: { sort: "asc", nulls: "last" } }];
  }
  const { field, nullable } = SORTABLE_COLUMNS[sort];
  const direction = dir === "desc" ? "desc" : "asc";
  // for nullable fields, push nulls to the bottom regardless of
  // direction so real data is always on top.
  if (nullable) {
    return [{ [field]: { sort: direction, nulls: "last" } }];
  }
  return [{ [field]: direction }];
}

// format hire date as "Mar 15, 2024" - more readable than 3/15/2024
// in a wide table. consistent en-US locale so dev/prod look the same.
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

// turn hire date into a human tenure string: "3y 2m", "8m", etc.
// shown as a small subtitle under the formatted date.
function tenureLabel(hireDate, now = new Date()) {
  const months =
    (now.getFullYear() - hireDate.getFullYear()) * 12 +
    (now.getMonth() - hireDate.getMonth());
  if (months < 0) return "starts soon"; // hire date in the future
  if (months === 0) return "<1mo";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}mo`;
  if (m === 0) return `${y}y`;
  return `${y}y ${m}mo`;
}

// js-side sort for the role column. uses the org-chart priority order
// defined above. when desc, reverses (Staff first, then HR, etc).
// within-role order is preserved from whatever order they came in
// (we ask prisma to order by name asc for stability).
function sortByRolePriority(users, dir) {
  const reverse = dir === "desc";
  return [...users].sort((a, b) => {
    const aRank = ROLE_SORT_ORDER[a.role] ?? 99;
    const bRank = ROLE_SORT_ORDER[b.role] ?? 99;
    if (aRank === bRank) return 0; // keep prisma's within-role order
    return reverse ? bRank - aRank : aRank - bRank;
  });
}

// build the href for a sortable header. clicking toggles direction if
// you're already sorted by that column, otherwise switches to that
// column starting at asc.
function sortHref(column, currentSort, currentDir) {
  let nextDir = "asc";
  if (currentSort === column) {
    nextDir = currentDir === "asc" ? "desc" : "asc";
  }
  const params = new URLSearchParams({ sort: column, dir: nextDir });
  return `/portal/admin?${params.toString()}`;
}

export default async function AdminPage({ searchParams }) {
  const current = await getCurrentUser();
  if (!isElevated(current?.role)) {
    redirect("/portal");
  }

  const params = await searchParams;
  const justInvited = typeof params?.invited === "string" ? params.invited : null;
  const justUpdated = typeof params?.updated === "string" ? params.updated : null;
  const justDeactivated = typeof params?.deactivated === "string" ? params.deactivated : null;
  const justReactivated = typeof params?.reactivated === "string" ? params.reactivated : null;
  const adminError = typeof params?.error === "string" ? params.error : null;

  // sort state from url (validated against the allowlist above)
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
      role: true,
      title: true,
      hireDate: true,
      createdAt: true,
      deactivatedAt: true,
    },
  });

  // role gets a special in-js sort using the org-chart priority order.
  // prisma cant do this natively for an enum field, so we sort after
  // fetching. dataset is small (~100 users) - no perf concern.
  if (sort === "role") {
    users = sortByRolePriority(users, dir);
  }

  const activeCount = users.filter((u) => !u.deactivatedAt).length;
  const deactivatedCount = users.length - activeCount;

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
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

      {/* Banners - only one shows at a time depending on what just happened */}
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

      {/* overflow-x-auto so the table can scroll horizontally on narrower
          screens (and when the user has long emails). overflow-hidden
          would just clip the rightmost column off, which is what was
          happening to the Edit arrow. */}
      <div className="mt-10 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
            <tr>
              <SortableHeader column="email" sort={sort} dir={dir}>
                Email
              </SortableHeader>
              <SortableHeader column="name" sort={sort} dir={dir}>
                Name
              </SortableHeader>
              <SortableHeader column="title" sort={sort} dir={dir}>
                Title
              </SortableHeader>
              <SortableHeader column="hired" sort={sort} dir={dir}>
                Hired
              </SortableHeader>
              <SortableHeader column="role" sort={sort} dir={dir}>
                Role
              </SortableHeader>
              <SortableHeader column="status" sort={sort} dir={dir}>
                Status
              </SortableHeader>
              <SortableHeader column="created" sort={sort} dir={dir}>
                Created
              </SortableHeader>
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
                  <td className="whitespace-nowrap px-6 py-3">
                    <span className={isDeactivated ? "line-through" : ""}>
                      {u.email}
                    </span>
                    {isSelf && (
                      <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-brand">
                        you
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3">{u.name ?? "—"}</td>
                  <td className="whitespace-nowrap px-6 py-3 text-slate-600">
                    {u.title ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3">
                    {u.hireDate ? (
                      <div>
                        <div className="text-slate-700">
                          {DATE_FMT.format(u.hireDate)}
                        </div>
                        <div className="text-xs text-slate-400">
                          {tenureLabel(u.hireDate)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        isDeactivated
                          ? "bg-slate-200 text-slate-500"
                          : roleBadgeClass(u.role)
                      }`}
                    >
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
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
                  <td className="whitespace-nowrap px-6 py-3 text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-right">
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

// clickable column header. shows arrow when its the active sort column,
// toggles direction on each click.
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
        {/* invisible placeholder when not active so column widths don't
            jump around as you sort. keeps the layout stable. */}
        <span
          aria-hidden="true"
          className={`text-[10px] ${isActive ? "" : "opacity-0"}`}
        >
          {arrow ?? "↑"}
        </span>
      </Link>
    </th>
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
