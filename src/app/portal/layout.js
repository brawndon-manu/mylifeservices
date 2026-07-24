import Link from "next/link";
import Image from "next/image";
import { signOut } from "@/auth";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, isIT, isAdminUp, roleBadgeClass, ROLE_LABELS } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import PreviewBar from "./_components/PreviewBar";

// the portal has its own Light / Dim / Night themes, so tell Dark Reader (and
// similar dark-mode extensions) to leave these pages alone. Dark Reader rewrites
// the DOM continuously, which breaks React hydration - forms still submit but
// client onClick handlers (like the roster's Manual override toggle) go dead.
export const metadata = {
  other: { "darkreader-lock": "true" },
};

async function handleSignOut() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function PortalLayout({ children }) {
  // pull fresh user from db instead of trusting the jwt - means changes
  // via /portal/settings (display name etc.) show up immediately without
  // needing a sign-out/sign-in dance.
  const user = await getCurrentUser();
  const role = user?.role;
  // unread notifications count for the nav bell (oversight tier only).
  const unread =
    user && isElevated(role)
      ? await prisma.notification.count({ where: { userId: user.id, read: false } })
      : 0;

  return (
    <div className="min-h-screen bg-background">
      {user && isIT(user.realRole) && (
        <PreviewBar
          realRole={user.realRole}
          effectiveRole={role}
          previewing={user.previewing}
        />
      )}
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-4 px-6 py-4">
          <div className="flex flex-col gap-2">
            {/* portal brand: logo + "Employee portal", links to the dashboard */}
            <Link
              href="/portal"
              className="flex items-center gap-2.5 rounded text-foreground transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Image
                src="/logo/treelogov2.png"
                alt=""
                width={2428}
                height={1820}
                priority
                className="h-8 w-auto rounded-md"
              />
              <span className="font-semibold tracking-tight">Employee portal</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-muted">
            <Link
              href="/portal"
              className="rounded transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Dashboard
            </Link>
            <Link
              href="/portal/hub"
              className="rounded transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Hub
            </Link>
            <Link
              href="/portal/newsletter"
              className="rounded transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Newsletter
            </Link>
            <Link
              href="/portal/contacts"
              className="rounded transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Contacts
            </Link>
            <Link
              href="/portal/settings"
              className="rounded transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Settings
            </Link>
            {isElevated(role) && (
              <Link
                href="/portal/admin"
                className="rounded transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Admin
              </Link>
            )}
            </nav>
          </div>
          <div className="flex flex-col items-end gap-2">
            {/* top row (aligned with the brand): bell, email + role, sign out */}
            <div className="flex items-center gap-4 text-sm">
              {isElevated(role) && (
                <Link
                  href="/portal/notifications"
                  aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
                  className="relative rounded p-1 text-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  {unread > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[11px] font-bold leading-[18px] text-white">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
              )}
              <span className="text-muted">
                {user?.email}
                {isAdminUp(role) && (
                  <span className={`ml-1 rounded px-2 py-0.5 text-xs font-medium ${roleBadgeClass(role)}`}>
                    {ROLE_LABELS[role] ?? role}
                  </span>
                )}
              </span>
              <form action={handleSignOut}>
                <button
                  type="submit"
                  className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  Sign out
                </button>
              </form>
            </div>
            {/* under it (aligned with the nav row): back to website */}
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded text-sm font-medium text-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span aria-hidden="true">←</span> Back to website
            </Link>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
