import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, isAdminUp, isIT } from "@/lib/roles";
import { RECREATION_CATEGORIES } from "@/lib/contacts";
import BackLink from "@/components/BackLink";
import ResourceBrowser from "../resources/ResourceBrowser";

export const metadata = {
  title: "Recreational Resources · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function RecreationPage({ searchParams }) {
  const user = await getCurrentUser();
  const elevated = isElevated(user.role);
  const canPick = isAdminUp(user.role);
  const canManage = isIT(user.role); // edit + remove are IT/Super only
  const params = await searchParams;

  // recreation group only - the community services live on /portal/resources.
  const resources = await prisma.resource.findMany({
    where: { status: "APPROVED", category: { in: RECREATION_CATEGORIES } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      subtype: true,
      orgName: true,
      phone: true,
      email: true,
      website: true,
      appointmentLink: true,
      contactInstructions: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      serviceArea: true,
      lat: true,
      lng: true,
      hours: true,
      schedule: true,
      whoItServes: true,
      appointmentRequired: true,
      details: true,
      operationalStatus: true,
      staffPick: true,
      lastVerifiedAt: true,
      verifiedBy: { select: { name: true } },
      notes: true,
      internalNotes: true,
      source: true,
    },
  });

  // internalNotes + source are staff-eyes-only; don't ship them to non-managers.
  const safeResources = canManage
    ? resources
    : resources.map(({ internalNotes, source, ...r }) => r);
  const pendingResources = elevated
    ? await prisma.resource.count({
        where: { status: "PENDING", category: { in: RECREATION_CATEGORIES } },
      })
    : 0;

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
      <BackLink href="/portal">Back to Dashboard</BackLink>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
            Portal
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Recreational Resources
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Outdoor and recreation spots the team can take participants to: hikes,
            parks, beaches, and more, with accessibility and safety notes.
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
            href="/portal/contacts/resources/new?group=recreation"
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

      <ResourceBrowser
        resources={safeResources}
        canManage={canManage}
        canPick={canPick}
        categoryOrder={RECREATION_CATEGORIES}
        allCards
        initialCategory={
          RECREATION_CATEGORIES.includes(params?.cat) ? params.cat : ""
        }
      />
    </section>
  );
}
