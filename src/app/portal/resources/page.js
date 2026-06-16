import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, isAdminUp, isIT } from "@/lib/roles";
import ResourceBrowser from "./ResourceBrowser";

export const metadata = {
  title: "Resources · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function ResourcesPage({ searchParams }) {
  const user = await getCurrentUser();
  const elevated = isElevated(user.role);
  const canPick = isAdminUp(user.role);
  const canManage = isIT(user.role); // edit + remove are IT/Super only
  const params = await searchParams;

  const resources = await prisma.resource.findMany({
    where: { status: "APPROVED" },
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
      address: true,
      city: true,
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
      notes: true,
    },
  });
  const pendingResources = elevated
    ? await prisma.resource.count({ where: { status: "PENDING" } })
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

      <ResourceBrowser
        resources={resources}
        canManage={canManage}
        canPick={canPick}
      />
    </section>
  );
}
