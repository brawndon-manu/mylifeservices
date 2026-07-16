import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, isAdminUp } from "@/lib/roles";
import {
  deviceTypeLabel,
  deviceStatusLabel,
  deviceStatusChip,
  formatCents,
} from "@/lib/devices";
import BackLink from "@/components/BackLink";

export const metadata = {
  title: "Device Management · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function DevicesPage({ searchParams }) {
  const user = await getCurrentUser();
  // view = oversight tier (HR/Manager/Admin/IT/Super); editing = Admin and up
  if (!isElevated(user.role)) redirect("/portal");
  const canEdit = isAdminUp(user.role);

  const params = await searchParams;
  const devices = await prisma.device.findMany({
    orderBy: { createdAt: "desc" },
  });

  const total = devices.reduce((sum, d) => sum + (d.priceCents ?? 0), 0);

  const banner =
    params?.added === "1"
      ? "Device added."
      : params?.updated === "1"
        ? "Device updated."
        : params?.deleted === "1"
          ? "Device removed."
          : null;

  return (
    <section className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <BackLink href="/portal/admin">Back to admin dashboard</BackLink>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
            Management
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Device Management
          </h1>
          <p className="mt-2 text-sm text-muted">
            Log of company hardware: what we own, who has it, and what it
            cost.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/portal/devices/new"
            className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
          >
            + Add device
          </Link>
        )}
      </div>

      {banner && (
        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {banner}
        </div>
      )}

      {devices.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-6 rounded-xl border border-border bg-surface p-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">
              Devices
            </p>
            <p className="mt-0.5 text-lg font-semibold text-foreground">
              {devices.length}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">
              Total value
            </p>
            <p className="mt-0.5 text-lg font-semibold text-foreground">
              {formatCents(total) ?? "—"}
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {devices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center text-sm text-muted">
            No devices logged yet. Add the first one.
          </div>
        ) : (
          devices.map((d) => {
            const card = (
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {d.name}
                    </span>
                    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium text-muted">
                      {deviceTypeLabel(d.type)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${deviceStatusChip(d.status)}`}
                    >
                      {deviceStatusLabel(d.status)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted">
                    {d.assignedTo && <span>{d.assignedTo}</span>}
                    {d.serialNumber && (
                      <span className="font-mono text-xs text-muted">
                        SN: {d.serialNumber}
                      </span>
                    )}
                  </div>
                  {d.notes && (
                    <p className="mt-1 text-sm text-muted">{d.notes}</p>
                  )}
                </div>
                <div className="text-right">
                  {d.priceCents != null && (
                    <p className="font-semibold text-foreground">
                      {formatCents(d.priceCents)}
                    </p>
                  )}
                  {canEdit && (
                    <span className="text-xs font-medium text-brand-light">
                      Edit →
                    </span>
                  )}
                </div>
              </div>
            );
            // editors get a clickable card to the edit page; view-only
            // (HR/Manager) get a plain, non-interactive card.
            return canEdit ? (
              <Link
                key={d.id}
                href={`/portal/devices/${d.id}/edit`}
                className="block rounded-xl border border-border bg-surface p-4 shadow-sm card-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {card}
              </Link>
            ) : (
              <div
                key={d.id}
                className="block rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                {card}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
