import Link from "next/link";
import { signOut } from "@/auth";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, isSuper, roleBadgeClass, ROLE_LABELS } from "@/lib/roles";

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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-700">
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
              href="/portal/feedback"
              className="rounded transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Suggestions
            </Link>
            <Link
              href="/portal/settings"
              className="rounded transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Settings
            </Link>
            {(user?.deviceManager || isSuper(role)) && (
              <Link
                href="/portal/devices"
                className="rounded transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Devices
              </Link>
            )}
            {isElevated(role) && (
              <Link
                href="/portal/admin"
                className="rounded transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Admin
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-600">
              {user?.email}{" "}
              <span className={`ml-1 rounded px-2 py-0.5 text-xs font-medium ${roleBadgeClass(role)}`}>
                {ROLE_LABELS[role] ?? role}
              </span>
            </span>
            <form action={handleSignOut}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
