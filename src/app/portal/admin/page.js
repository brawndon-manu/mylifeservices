import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, isAdminUp } from "@/lib/roles";
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

  return (
    <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
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
            href="/portal/admin/meeting-attendance"
            title="Meeting attendance"
            isNew
            body="RSVPs and roll-call across every Company Meeting: who's going, who hasn't responded, and who showed up."
          />
        )}
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
            href="/portal/site-photos"
            title="Site photos"
            body="Manage the public About/Stories photos: upload, caption, reorder, show or hide."
          />
        )}
      </div>
    </section>
  );
}

function LinkCard({ href, title, body, isNew }) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-surface p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-border-strong hover:shadow-[6px_6px_0_0_rgba(15,23,42,0.9)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:hover:shadow-[6px_6px_0_0_rgba(56,138,221,0.45)]"
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
