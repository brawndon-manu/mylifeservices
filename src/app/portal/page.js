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
        <Card
          title="Team contacts"
          body="Quick reference for who to reach out to. Coming soon."
        />
      </div>
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
