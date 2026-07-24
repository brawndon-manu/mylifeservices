import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, isManagerUp, canSeeRoles } from "@/lib/roles";
import {
  CONTACT_CATEGORIES,
  isValidCategory,
  titleForCategory,
  preferredName,
  legalName,
  RESOURCE_CATEGORIES,
  formatUSPhone,
} from "@/lib/contacts";
import ConfirmButton from "@/components/ConfirmButton";
import BackLink from "@/components/BackLink";
import ContactsDirectory from "./ContactsDirectory";
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
  const titleFilter = cat ? titleForCategory(cat) : null;

  const people = await prisma.user.findMany({
    where: {
      deactivatedAt: null,
      // filter by job title (the User.title string holds one or more positions
      // joined by " / ", so a contains-match catches multi-title people too).
      ...(titleFilter
        ? { title: { contains: titleFilter, mode: "insensitive" } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      preferredFirstName: true,
      preferredLastName: true,
      hideLegalName: true,
      email: true,
      role: true,
      title: true,
      phone: true,
      image: true,
    },
    orderBy: { name: "asc" },
  });

  // build the client cards. the legal name is included ONLY for cards this
  // viewer is allowed to see it on (not hidden, or viewer is admin/management,
  // or it's their own card) - so a hidden legal name is never sent to the
  // client. role badge only when the viewer can see roles.
  const canSeeLegal = (p) =>
    !p.hideLegalName || isManagerUp(user.role) || p.id === user.id;
  const cards = people
    .map((p) => ({
      id: p.id,
      name: preferredName(p),
      legal: canSeeLegal(p) ? legalName(p) : null,
      email: p.email,
      title: p.title,
      phone: p.phone,
      image: p.image,
      role: showRoles ? p.role : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // community group only - recreation resources live on /portal/recreation.
  const resources = await prisma.resource.findMany({
    where: {
      status: "APPROVED",
      OR: [{ category: { in: RESOURCE_CATEGORIES } }, { category: null }],
    },
    orderBy: { name: "asc" },
  });
  const pendingResources = elevated
    ? await prisma.resource.count({
        where: {
          status: "PENDING",
          OR: [{ category: { in: RESOURCE_CATEGORIES } }, { category: null }],
        },
      })
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
    <section className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <BackLink href="/portal">Back to Dashboard</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Portal
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Team Contacts
      </h1>
      <p className="mt-2 text-sm text-muted">
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
        <aside className="space-y-8 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
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
                <p className="text-sm text-muted">No resources yet.</p>
              ) : (
                orderedCategories.map((cat) => (
                  <details
                    key={cat}
                    className="group rounded-lg border border-border bg-surface"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                      <span>{cat}</span>
                      <span className="flex items-center gap-2">
                        <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          {byCategory.get(cat).length}
                        </span>
                        <ChevronIcon className="h-3.5 w-3.5 text-faint transition-transform group-open:rotate-180" />
                      </span>
                    </summary>
                    <div className="space-y-2 border-t border-border p-2">
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

        {/* directory grid - own scroll on desktop so the left rail stays put */}
        <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <ContactsDirectory cards={cards} />
        </div>
      </div>
    </section>
  );
}

function ResourceCard({ r, elevated }) {
  const phone = formatUSPhone(r.phone);
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm shadow-sm">
      <p className="font-semibold text-foreground">{r.name}</p>
      {r.notes && (
        <p className="mt-1 text-xs leading-relaxed text-muted">{r.notes}</p>
      )}
      <div className="mt-1.5 space-y-0.5">
        {phone && (
          <a
            href={`tel:${phone.replace(/[^\d+]/g, "")}`}
            className="block text-muted underline-offset-2 hover:underline"
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
          : "border-border bg-surface text-muted hover:border-brand-light hover:text-brand"
      }`}
    >
      {label}
    </Link>
  );
}
