import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, isAdminUp, isIT } from "@/lib/roles";
import { getMaintenanceState } from "@/lib/maintenance";
import { toggleMaintenance } from "./maintenance-actions";
import BackLink from "@/components/BackLink";
import NewBadge from "@/components/NewBadge";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// admin landing - a small dashboard of management tools. gated to the
// oversight tier (proxy already gates /portal/admin/*; re-checked here).
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!isElevated(user?.role)) {
    redirect("/portal");
  }

  // maintenance switch is IT / SUPER only; skip the redis read for others.
  const canMaintain = isIT(user.role);
  const maintenanceOn = canMaintain ? await getMaintenanceState() : false;

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <BackLink href="/portal">Back to Dashboard</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Admin
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Admin dashboard
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        Management tools for the portal.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <LinkCard
          href="/portal/admin/users"
          title="User management"
          body="Invite, edit, deactivate users; set roles, titles, and hire dates."
        />
        <LinkCard
          href="/portal/devices"
          title="Devices"
          body="Company hardware log: what we own, who has it, and what it cost."
        />
        {isAdminUp(user.role) && (
          <LinkCard
            href="/portal/admin/acknowledgments"
            title="Acknowledgments"
            isNew
            body="Read-receipts across every announcement that needs one: who has acknowledged and who still hasn't."
          />
        )}
        {isAdminUp(user.role) && (
          <LinkCard
            href="/portal/admin/meeting-attendance"
            title="Meeting attendance"
            isNew
            body="RSVPs and roll-call across every Company Meeting: who's going, who hasn't responded, and who showed up."
          />
        )}
        <LinkCard
          href="/portal/admin/applications"
          title="Applications"
          isNew
          body="Job applications submitted through the website: preview each one, then open the full application and resume."
        />
        {isAdminUp(user.role) && (
          <LinkCard
            href="/portal/site-photos"
            title="Site photos"
            body="Manage the public About/Stories photos: upload, caption, reorder, show or hide."
          />
        )}
      </div>

      {canMaintain && <MaintenanceControl on={maintenanceOn} />}
    </section>
  );
}

// IT / SUPER only. flips the public site into the maintenance splash. the portal
// stays reachable and staff can still get in with the bypass password.
function MaintenanceControl({ on }) {
  return (
    <div
      className={`mt-10 rounded-xl border p-6 ${
        on
          ? "border-amber-400/60 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-950/30"
          : "border-border bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Site maintenance
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
                on
                  ? "bg-amber-500 text-white"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              }`}
            >
              {on ? "Site is down" : "Site is live"}
            </span>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            {on
              ? "The public site is showing the maintenance page right now. The portal stays open, and staff can still get in with the bypass password."
              : "Turns the public site into a maintenance page. The portal stays open, and staff can still get in with the bypass password. Takes a few seconds to apply."}
          </p>
        </div>

        <form action={toggleMaintenance}>
          <input type="hidden" name="next" value={on ? "off" : "on"} />
          <button
            type="submit"
            className={`inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
              on
                ? "bg-emerald-600 hover:bg-emerald-700 focus-visible:outline-emerald-600"
                : "bg-amber-600 hover:bg-amber-700 focus-visible:outline-amber-600"
            }`}
          >
            {on ? "Bring the site back" : "Take the site down"}
          </button>
        </form>
      </div>
    </div>
  );
}

function LinkCard({ href, title, body, isNew }) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-surface p-6 shadow-sm card-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          {title}
          {isNew && <NewBadge />}
        </h2>
        <span
          aria-hidden="true"
          className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
        >
          →
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
    </Link>
  );
}
