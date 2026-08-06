import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import BackLink from "@/components/BackLink";

export const metadata = {
  title: "Employee Guidebook · MLS Portal",
  robots: { index: false, follow: false },
};

// sections live here so adding the next one is a single entry. anything with
// href: null renders as a "coming soon" tile instead of a link.
const SECTIONS = [
  {
    href: "/portal/guidebook/breaks",
    title: "Meal Periods & Rest Breaks",
    body: "What you are owed, when each break has to happen in your shift, and how to punch it so payroll reads it right.",
  },
  {
    href: null,
    title: "Onboarding",
    body: "Your first weeks: what to expect, who to ask, and what needs signing.",
  },
  {
    href: null,
    title: "Timesheets and pay",
    body: "How the pay period works, how to read your corrected timesheet, and how to flag something that looks wrong.",
  },
];

export default async function GuidebookPage() {
  await getCurrentUser();

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
      <BackLink href="/portal">Back to Dashboard</BackLink>
      <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Portal
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Employee Guidebook
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Reference for how things work here. Start with breaks, since that is the
        one that shows up on your paycheck.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {SECTIONS.map((s) =>
          s.href ? (
            <Link
              key={s.title}
              href={s.href}
              className="group card-lift rounded-xl border border-border bg-surface p-6 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  {s.title}
                </h2>
                <span
                  aria-hidden="true"
                  className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                >
                  →
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{s.body}</p>
            </Link>
          ) : (
            <div
              key={s.title}
              className="rounded-xl border border-dashed border-border bg-surface-2 p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight text-faint">
                  {s.title}
                </h2>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-faint">
                  Soon
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-faint">{s.body}</p>
            </div>
          )
        )}
      </div>
    </section>
  );
}
