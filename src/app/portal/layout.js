import Link from "next/link";
import Image from "next/image";
import { signOut } from "@/auth";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, isIT, isAdminUp, canEnterAdmin, roleBadgeClass, ROLE_LABELS } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import PreviewBar from "./_components/PreviewBar";
import PortalMenu from "./_components/PortalMenu";
import PortalTabBar from "./_components/PortalTabBar";
import PortalPushNav from "./_components/PortalPushNav";
import PortalSidebar from "./_components/PortalSidebar";
import PortalToolbar from "./_components/PortalToolbar";

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
    // portal-shell: the portal's token layer + system font stack (globals.css).
    // no-focus-zoom: see globals.css. Every form in the portal is text-sm, and
    // under 16px iOS zooms in on focus and does not come back.
    <div className="portal-shell no-focus-zoom min-h-screen bg-background">
      {user && isIT(user.realRole) && (
        <PreviewBar
          realRole={user.realRole}
          effectiveRole={role}
          previewing={user.previewing}
        />
      )}

      {/* --- phones and tablets: brand, bell, menu. the desktop header row is
          gone - lg and up runs the sidebar + toolbar shell instead. the split
          stays at lg for the same reason it was there before: the tab bar and
          this bar cover everything below it. --- */}
      <div className="relative border-b border-border bg-background lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
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
          <div className="flex items-center gap-2">
            {/* the bell stays in the bar rather than going into the menu. a
                count nobody can see until they open something is not a
                notification. */}
            {isElevated(role) && (
              <Link
                href="/portal/notifications"
                aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
                className="relative flex h-11 w-11 items-center justify-center rounded-lg text-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unread > 0 && (
                  <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[11px] font-bold leading-[18px] text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            )}
            <PortalMenu
              elevated={canEnterAdmin(role)}
              email={user?.email}
              roleLabel={isAdminUp(role) ? ROLE_LABELS[role] ?? role : null}
              roleBadgeClass={roleBadgeClass(role)}
              signOut={handleSignOut}
            />
          </div>
        </div>
      </div>

      {/* --- lg and up: sidebar rail + toolbar over the content column --- */}
      <div className="lg:flex">
        <PortalSidebar
          elevated={canEnterAdmin(role)}
          name={user?.name || user?.email}
          subline={isAdminUp(role) ? ROLE_LABELS[role] ?? role : user?.title || null}
          signOut={handleSignOut}
        />
        <div className="min-w-0 flex-1">
          <PortalToolbar elevated={isElevated(role)} unread={unread} />
          {/* the tab bar is fixed, so the last thing on every page would sit
              under it without this. The bar floats: it stands 64px tall, 8px
              above the safe-area inset, and this clears all of that plus air.
              Measured from the same inset the bar uses, so the two cannot
              drift apart. Cleared again at lg, where there is no bar. */}
          {/* WRAPS THE CONTENT, NOT THE CHROME. `PortalPushNav` renders its
              children untouched and only listens - the chrome around it stays
              where it is through a navigation, which is the whole look. */}
          <div className="pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:pb-0">
            <PortalPushNav>{children}</PortalPushNav>
          </div>
        </div>
      </div>
      <PortalTabBar elevated={canEnterAdmin(role)} />
    </div>
  );
}
