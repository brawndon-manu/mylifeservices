import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";
import { timeAgo } from "@/lib/hub";
import { avatarGradient } from "@/lib/applications";
import BackLink from "@/components/BackLink";

export const metadata = {
  title: "Applications",
  robots: { index: false, follow: false },
};

function initials(f, l) {
  return ((f?.[0] || "") + (l?.[0] || "")).toUpperCase() || "?";
}
function shortDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// applications submitted through the public careers form. oversight tier only
// (the proxy already gates /portal/admin/*; re-checked here). newest first.
export default async function ApplicationsPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!isElevated(user?.role)) redirect("/portal");
  const sp = await searchParams;

  const apps = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      gender: true,
      positions: true,
      startDate: true,
      resumeName: true,
      createdAt: true,
    },
  });

  return (
    <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <BackLink href="/portal/admin">Back to Admin</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Admin
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Applications
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        Job applications submitted through the website, newest first. Click one to
        open the full application.
      </p>

      {sp?.deleted && (
        <div className="mt-6 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
          Application deleted.
        </div>
      )}

      {apps.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border-strong bg-surface-2 p-10 text-center">
          <p className="text-sm font-medium text-foreground">No applications yet.</p>
          <p className="mt-1 text-sm text-muted">
            New applications from the careers page will show up here.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {apps.map((a) => {
            const positions = (a.positions || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            return (
              <li key={a.id}>
                <Link
                  href={`/portal/admin/applications/${a.id}`}
                  className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm card-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:p-5"
                >
                  <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(a.gender)} text-sm font-bold text-white`}>
                    {initials(a.firstName, a.lastName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="text-base font-semibold tracking-tight text-foreground">
                        {a.firstName} {a.lastName}
                      </span>
                      {positions.slice(0, 3).map((p) => (
                        <span
                          key={p}
                          className="rounded-full border border-border bg-surface-3 px-2 py-0.5 text-[11px] text-muted"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                      <span className="truncate">{a.email}</span>
                      {a.phone && <span>{a.phone}</span>}
                      {a.startDate && (
                        <span>
                          Start: <span className="text-foreground">{a.startDate}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-none flex-col items-end gap-1.5 text-right">
                    <span className="text-xs text-faint">
                      {timeAgo(a.createdAt)} · {shortDate(a.createdAt)}
                    </span>
                    {a.resumeName ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <ClipIcon className="h-3 w-3" /> Resume
                      </span>
                    ) : (
                      <span className="text-[11px] text-faint">No resume</span>
                    )}
                  </div>
                  <span
                    aria-hidden="true"
                    className="flex-none text-lg text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                  >
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ClipIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 8.5l-8.9 8.9a4 4 0 0 1-5.7-5.7l8.5-8.5a2.6 2.6 0 0 1 3.7 3.7l-8.5 8.5a1.2 1.2 0 0 1-1.7-1.7l7.8-7.8" />
    </svg>
  );
}
