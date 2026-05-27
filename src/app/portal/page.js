import { auth } from "@/auth";

export const metadata = {
  title: "Portal",
  // keep the portal out of search engines. nothing here should be public.
  robots: { index: false, follow: false },
};

const ROLE_GREETING = {
  IT_ADMIN: "You have full access — including the Admin area.",
  MANAGER:
    "You can post announcements and view internal resources from here.",
  STAFF:
    "Check here for announcements, internal forms, and team resources.",
};

export default async function PortalDashboard() {
  const session = await auth();
  const user = session?.user;
  const role = user?.role ?? "STAFF";

  return (
    <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-light">
        Welcome back
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        {user?.name ? `Hi, ${user.name}` : "Employee dashboard"}
      </h1>
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
