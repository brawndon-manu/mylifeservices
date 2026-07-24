import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp, roleBadgeClass, ROLE_LABELS } from "@/lib/roles";
import { firstNameOf } from "@/lib/contacts";

export const metadata = {
  title: "Portal",
  // keep the portal out of search engines. nothing here should be public.
  robots: { index: false, follow: false },
};

const ROLE_GREETING = {
  SUPER: "Superuser. You have full access to everything.",
  IT_ADMIN: "You have full access, including the Admin area.",
  ADMIN: "You have full access, including the Admin area.",
  MANAGER:
    "You can manage users and post announcements from the Admin area.",
  HR:
    "Check here for announcements and internal resources.",
  SUPERVISOR:
    "Check here for announcements and internal resources.",
  STAFF:
    "Check here for announcements, internal forms, and team resources.",
};

export default async function PortalDashboard() {
  // fresh user from db - so display name + role reflect any changes
  // since they signed in (Settings page, role bumps, etc.).
  const user = await getCurrentUser();
  const role = user?.role ?? "STAFF";

  return (
    <section className="mx-auto max-w-7xl px-6 py-12 sm:py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Welcome back
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {firstNameOf(user) ? (
          <>
            Hi, {firstNameOf(user)}
            {/* role chip only for Admin/IT/Super - everyone else just sees
                their name + title underneath. */}
            {isAdminUp(role) && (
              <span className={`ml-3 inline-block align-middle rounded px-2 py-0.5 text-xs font-medium ${roleBadgeClass(role)}`}>
                {ROLE_LABELS[role] ?? role}
              </span>
            )}
          </>
        ) : (
          "Employee dashboard"
        )}
      </h1>
      {user?.title && (
        <p className="mt-2 text-base text-muted">{user.title}</p>
      )}
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
        {ROLE_GREETING[role]}
      </p>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        <LinkCard
          href="/portal/announcements"
          title="Announcements"
          body="Company updates, events, meetings, and changelog notes. Comment, react, and respond where a reply or acknowledgment is asked."
        />
        <LinkCard
          href="/portal/forms"
          title="Forms"
          body="Internal forms staff can fill out or download."
        />
        <LinkCard
          href="/portal/guidebook"
          title="Employee Guidebook"
          body="Handbook, onboarding, and reference docs for the team."
        />
        <LinkCard
          href="/portal/resources"
          title="Resources"
          body="Community resources: housing, food banks, clinics, and more, with a map and details."
        />
        <LinkCard
          href="/portal/recreation"
          title="Recreational Resources"
          body="Outdoor spots for participants: hikes, parks, beaches, and more, on a map with accessibility notes."
        />
        <LinkCard
          href="/portal/contacts"
          title="Team contacts"
          body="Directory of the team: names, roles, photos, email, and phone."
        />
      </div>

      {/* utility board - amber so it reads as a working/temporary area
          rather than permanent content. links straight to the board. */}
      <div className="mt-6">
        <Link
          href="/portal/feedback"
          className="group block rounded-xl border border-amber-200 bg-amber-50 p-6 transition hover:border-amber-300 hover:bg-amber-100/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-amber-900/50 dark:bg-amber-950/25 dark:hover:border-amber-800 dark:hover:bg-amber-900/30"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-amber-900 dark:text-amber-300">
              Suggestions &amp; Bugs
            </h2>
            <span
              aria-hidden="true"
              className="text-amber-700 transition-transform group-hover:translate-x-0.5 dark:text-amber-400"
            >
              →
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-amber-900/80 dark:text-amber-300/80">
            Spot a bug or have an idea to improve things? Post it here; IT
            and management track each item until it&apos;s resolved.
          </p>
        </Link>
      </div>

    </section>
  );
}

function LinkCard({ href, title, body }) {
  return (
    <Link
      href={href}
      className="group card-lift rounded-xl border border-border bg-surface p-6 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {title}
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
