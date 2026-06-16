import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";
import { RESOURCE_CATEGORIES, formatUSPhone } from "@/lib/contacts";
import ConfirmButton from "@/components/ConfirmButton";
import { deleteResource } from "../contacts/actions";

export const metadata = {
  title: "Resources · MLS Portal",
  robots: { index: false, follow: false },
};

// per-resource embedded map (free Embed API) + a directions link, both built
// from the resource's address. no key -> no embedded map, just the link.
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
function mapSrc(address) {
  if (!MAPS_KEY || !address) return null;
  return `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${encodeURIComponent(address)}`;
}
function directionsHref(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export default async function ResourcesPage({ searchParams }) {
  const user = await getCurrentUser();
  const elevated = isElevated(user.role);
  const params = await searchParams;

  const resources = await prisma.resource.findMany({
    where: { status: "APPROVED" },
    orderBy: { name: "asc" },
  });
  const pendingResources = elevated
    ? await prisma.resource.count({ where: { status: "PENDING" } })
    : 0;

  // group by category, keeping the predefined order (Housing, Food banks, ...)
  // then any unexpected categories at the end.
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
            Portal
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Community Resources
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Housing, food banks, and other community services the team can share
            with participants and families.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {elevated && pendingResources > 0 && (
            <Link
              href="/portal/contacts/resources/review"
              className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800"
            >
              {pendingResources} to review
            </Link>
          )}
          <Link
            href="/portal/contacts/resources/new"
            className="rounded-md border border-brand-light bg-sky-50 px-3 py-2 text-sm font-semibold text-brand transition hover:bg-sky-100"
          >
            + Add resource
          </Link>
        </div>
      </div>

      {banner && (
        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {banner}
        </div>
      )}

      {resources.length === 0 ? (
        <p className="mt-10 text-sm text-slate-600">
          No resources yet. Add the first one.
        </p>
      ) : (
        <div className="mt-10 space-y-12">
          {orderedCategories.map((cat) => (
            <div key={cat}>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                {cat}{" "}
                <span className="ml-1 text-sm font-normal text-slate-400">
                  ({byCategory.get(cat).length})
                </span>
              </h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {byCategory.get(cat).map((r) => (
                  <ResourceCard key={r.id} r={r} elevated={elevated} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ResourceCard({ r, elevated }) {
  const phone = formatUSPhone(r.phone);
  const src = mapSrc(r.address);
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="p-4">
        <p className="font-semibold text-slate-900">{r.name}</p>
        {r.notes && (
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{r.notes}</p>
        )}
        <div className="mt-2 space-y-0.5 text-sm">
          {r.address && <p className="text-slate-700">{r.address}</p>}
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
      </div>

      {src && (
        <div className="border-t border-slate-100">
          <iframe
            title={`Map of ${r.name}`}
            src={src}
            className="block aspect-[16/9] w-full"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <a
            href={directionsHref(r.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="block border-t border-slate-100 px-4 py-2 text-center text-sm font-medium text-brand-dark transition hover:text-brand"
          >
            Get directions
          </a>
        </div>
      )}

      {elevated && (
        <form
          action={deleteResource.bind(null, r.id)}
          className="border-t border-slate-100 px-4 py-2"
        >
          <ConfirmButton
            message="Remove this resource?"
            className="text-[11px] font-medium text-rose-600 transition hover:text-rose-700"
          >
            Remove
          </ConfirmButton>
        </form>
      )}
    </li>
  );
}
