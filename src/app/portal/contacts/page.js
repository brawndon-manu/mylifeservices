import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, canSeeRoles, ROLE_LABELS, roleBadgeClass } from "@/lib/roles";
import {
  CONTACT_CATEGORIES,
  isValidCategory,
  rolesForCategory,
  RESOURCE_CATEGORIES,
  formatUSPhone,
} from "@/lib/contacts";
import Avatar from "@/components/Avatar";
import ConfirmButton from "@/components/ConfirmButton";
import { deleteResource } from "./actions";

export const metadata = {
  title: "Team Contacts · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function ContactsPage({ searchParams }) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const elevated = isElevated(user.role);
  // only ADMIN/IT see other people's privilege role; everyone else just
  // sees titles. keeps SUPER discreet.
  const showRoles = canSeeRoles(user.role);

  const cat = isValidCategory(params?.cat) ? params.cat : null;
  const roleFilter = cat ? rolesForCategory(cat) : null;

  const people = await prisma.user.findMany({
    where: {
      deactivatedAt: null,
      ...(roleFilter ? { role: { in: roleFilter } } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      title: true,
      phone: true,
      image: true,
    },
    orderBy: { name: "asc" },
  });

  const resources = await prisma.resource.findMany({
    where: { status: "APPROVED" },
    orderBy: { name: "asc" },
  });
  const pendingResources = elevated
    ? await prisma.resource.count({ where: { status: "PENDING" } })
    : 0;

  // group approved resources by category for collapsible sections.
  // keep the predefined order, then append any unexpected categories.
  const byCategory = new Map();
  for (const r of resources) {
    const c = r.category || "Other";
    if (!byCategory.has(c)) byCategory.set(c, []);
    byCategory.get(c).push(r);
  }
  const orderedCategories = [
    ...RESOURCE_CATEGORIES.filter((c) => byCategory.has(c)),
    ...[...byCategory.keys()].filter((c) => !RESOURCE_CATEGORIES.includes(c)),
  ];

  const banner =
    params?.added === "1"
      ? "Resource added."
      : params?.submitted === "1"
        ? "Thanks! Your resource was sent for approval."
        : params?.deleted === "1"
          ? "Resource removed."
          : null;

  return (
    <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Portal
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Team Contacts
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Find a coworker, put a face to a name, or look up a community
        resource. Update your own photo and phone in{" "}
        <Link href="/portal/settings" className="text-brand underline-offset-2 hover:underline">
          Settings
        </Link>
        .
      </p>

      {banner && (
        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {banner}
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* left rail: filters + community resources */}
        <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Filter
            </p>
            <nav className="mt-3 flex flex-wrap gap-2 lg:flex-col">
              <FilterCard href="/portal/contacts" label="Everyone" active={!cat} />
              {CONTACT_CATEGORIES.map((c) => (
                <FilterCard
                  key={c.value}
                  href={`/portal/contacts?cat=${c.value}`}
                  label={c.label}
                  active={cat === c.value}
                />
              ))}
            </nav>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Resources
              </p>
              {elevated && pendingResources > 0 && (
                <Link
                  href="/portal/contacts/resources/review"
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                >
                  {pendingResources} to review
                </Link>
              )}
            </div>

            <div className="mt-3 space-y-2">
              {resources.length === 0 ? (
                <p className="text-sm text-slate-500">No resources yet.</p>
              ) : (
                orderedCategories.map((cat) => (
                  <details
                    key={cat}
                    className="group rounded-lg border border-slate-200 bg-white"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                      <span>{cat}</span>
                      <span className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          {byCategory.get(cat).length}
                        </span>
                        <ChevronIcon className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-180" />
                      </span>
                    </summary>
                    <div className="space-y-2 border-t border-slate-100 p-2">
                      {byCategory.get(cat).map((r) => (
                        <ResourceCard key={r.id} r={r} elevated={elevated} />
                      ))}
                    </div>
                  </details>
                ))
              )}
            </div>

            <Link
              href="/portal/contacts/resources/new"
              className="mt-3 block rounded-md border border-brand-light bg-sky-50 px-3 py-2 text-center text-sm font-semibold text-brand transition hover:bg-sky-100"
            >
              + Add resource
            </Link>
          </div>
        </aside>

        {/* directory grid */}
        <div>
          {people.length === 0 ? (
            <p className="text-sm text-slate-600">No one in this group.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {people.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/portal/contacts/${p.id}`}
                    className="flex h-full gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-light hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Avatar
                      name={p.name}
                      email={p.email}
                      image={p.image}
                      size={56}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {p.name || p.email}
                        </span>
                        {showRoles && (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${roleBadgeClass(p.role)}`}>
                            {ROLE_LABELS[p.role] ?? p.role}
                          </span>
                        )}
                      </div>
                      {p.title && (
                        <p className="text-sm text-slate-600">{p.title}</p>
                      )}
                      <p className="mt-1 truncate text-sm text-brand">
                        {p.email}
                      </p>
                      {p.phone && (
                        <p className="text-sm text-slate-700">{p.phone}</p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ResourceCard({ r, elevated }) {
  const phone = formatUSPhone(r.phone);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
      <p className="font-semibold text-slate-900">{r.name}</p>
      {r.notes && (
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{r.notes}</p>
      )}
      <div className="mt-1.5 space-y-0.5">
        {phone && (
          <a
            href={`tel:${phone.replace(/[^\d+]/g, "")}`}
            className="block text-slate-700 underline-offset-2 hover:underline"
          >
            {phone}
          </a>
        )}
        {r.email && (
          <a
            href={`mailto:${r.email}`}
            className="block truncate text-brand underline-offset-2 hover:underline"
          >
            {r.email}
          </a>
        )}
        {r.website && (
          <a
            href={r.website}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-brand underline-offset-2 hover:underline"
          >
            {r.website.replace(/^https?:\/\//, "")}
          </a>
        )}
      </div>
      {elevated && (
        <form action={deleteResource.bind(null, r.id)} className="mt-2">
          <ConfirmButton
            message="Remove this resource?"
            className="text-[11px] font-medium text-rose-600 transition hover:text-rose-700"
          >
            Remove
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}

function ChevronIcon({ className }) {
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
      <path d="M6 8l4 4 4-4" />
    </svg>
  );
}

function FilterCard({ href, label, active }) {
  return (
    <Link
      href={href}
      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-brand-light bg-sky-50 text-brand"
          : "border-slate-200 bg-white text-slate-700 hover:border-brand-light hover:text-brand"
      }`}
    >
      {label}
    </Link>
  );
}
