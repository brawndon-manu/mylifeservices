import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { ROLE_LABELS } from "@/lib/roles";

export const metadata = {
  title: "Portal",
  // keep the portal out of search engines. nothing here should be public.
  robots: { index: false, follow: false },
};

const ROLE_GREETING = {
  IT_ADMIN: "You have full access — including the Admin area.",
  ADMIN: "You have full access — including the Admin area.",
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
    <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-light">
        Welcome back
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        {user?.name ? (
          <>
            Hi, {user.name}
            {/* small role chip next to the name - same style as the
                admin user list so the visual language stays consistent.
                align-middle keeps it sitting nicely against the big
                heading text instead of dropping to the baseline. */}
            <span className="ml-3 inline-block align-middle rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-brand">
              {ROLE_LABELS[role] ?? role}
            </span>
          </>
        ) : (
          "Employee dashboard"
        )}
      </h1>
      {user?.title && (
        <p className="mt-2 text-base text-slate-600">{user.title}</p>
      )}
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
        {ROLE_GREETING[role]}
      </p>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        <Card
          title="Announcements"
          body="Updates from upper management — job fairs, food banks, training, events."
        />
        <Card
          title="Forms & resources"
          body="Internal forms staff can fill out or download. Coming soon."
        />
        <Link
          href="/portal/contacts"
          className="group rounded-xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-brand-light hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Team contacts
            </h2>
            <span
              aria-hidden="true"
              className="text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
            >
              →
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Directory of the team — names, roles, photos, email, phone — plus
            community resources.
          </p>
        </Link>
      </div>

      {/* utility board - amber so it reads as a working/temporary area
          rather than permanent content. links straight to the board. */}
      <div className="mt-6">
        <Link
          href="/portal/feedback"
          className="group block rounded-xl border border-amber-200 bg-amber-50 p-6 transition hover:border-amber-300 hover:bg-amber-100/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-amber-900">
              Suggestions &amp; Bugs
            </h2>
            <span
              aria-hidden="true"
              className="text-amber-700 transition-transform group-hover:translate-x-0.5"
            >
              →
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-amber-900/80">
            Spot a bug or have an idea to improve things? Post it here — IT
            and management track each item until it&apos;s resolved.
          </p>
        </Link>
      </div>

      {user?.deviceManager && (
        <div className="mt-6">
          <Link
            href="/portal/devices"
            className="group block rounded-xl border border-slate-300 bg-slate-900 p-6 transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight text-white">
                Device Management
              </h2>
              <span
                aria-hidden="true"
                className="text-slate-300 transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Company hardware log — what we own, who has it, and what it
              cost. Management only.
            </p>
          </Link>
        </div>
      )}
    </section>
  );
}

function Card({ title, body }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">{body}</p>
    </div>
  );
}
