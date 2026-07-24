import Link from "next/link";
import Image from "next/image";
import { services } from "@/lib/services";
import {
  REQUIREMENTS,
  NICE_TO_HAVE,
  HIRING_STEPS,
  PUBLISHED_QUOTES,
} from "@/lib/careers";
import QuoteCarousel from "@/components/QuoteCarousel";
import {
  TrendIcon,
  HandshakeIcon,
  RouteIcon,
  SupportIcon,
} from "@/components/Icons";

export const metadata = {
  title: "Careers",
  description:
    "Join My Life Services. Independent Living Services staff roles in Orange County.",
};

const LOGO_GRADIENT =
  "linear-gradient(135deg,#176f97 0%,#1f93bf 46%,#29b1dd 74%,#54cef1 100%)";
const CHIP_GRADIENT = "linear-gradient(140deg,#2ab3e0,#186a94)";

// why people stay. agency-wide, unlike the per-role "why work in X" copy that
// lives on each role page.
const REASONS = [
  {
    icon: TrendIcon,
    title: "You see the progress",
    body: "Someone rides the bus on their own for the first time. Someone signs their own lease. You were there for the year of work behind it.",
  },
  {
    icon: HandshakeIcon,
    title: "Real relationships",
    body: "You work with the same people over time and build something consistent, instead of moving through a queue.",
  },
  {
    icon: RouteIcon,
    title: "No two days the same",
    body: "Homes, the community, job sites, outings. The work moves around, and so do you.",
  },
  {
    icon: SupportIcon,
    title: "Work that's needed",
    body: "Every role here exists because someone is counting on it. Call out and a person's whole day changes, which is a heavy thing, and also the point.",
  },
];

export default function CareersPage() {
  const ils =
    services.find((s) => s.slug === "independent-living") ?? services[0];

  return (
    <>
      <section
        className="relative overflow-hidden text-white"
        style={{ background: LOGO_GRADIENT }}
      >
        <Image
          src="/logo/treelogo_white.png"
          alt=""
          aria-hidden="true"
          width={520}
          height={520}
          priority
          className="pointer-events-none absolute -right-8 top-10 w-[240px] max-w-[45%] opacity-[0.12] sm:w-[360px]"
        />
        <div className="relative mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#cfeefc]">
            Careers
          </p>
          <h1 className="mt-2 max-w-[14em] text-3xl font-semibold tracking-tight sm:text-4xl md:text-[2.75rem] md:leading-[1.1]">
            Show up for someone, until they can do it themselves
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#e8f6fd] sm:text-lg">
            My Life Services hires Independent Living Services staff in Orange
            County, supporting adults with intellectual and developmental
            disabilities. We are hiring right now.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/careers/apply"
              className="inline-flex items-center justify-center rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-[#14608a] shadow-sm transition hover:bg-[#eaf7fe]"
            >
              Apply now
            </Link>
            <a
              href="#roles"
              className="inline-flex items-center justify-center rounded-md border border-white/40 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Find your role
            </a>
          </div>
        </div>
      </section>

      {/* what the work actually is */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-14 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            What the work actually is
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted sm:text-lg">
            Direct support, one-on-one or in small groups, in people&apos;s homes
            and out in the community. You help with daily living, skill building,
            and getting out into the world, following each person&apos;s own plan.
            It is practical, hands-on work with a lot of driving and a lot of
            problem-solving.
          </p>

          <div className="mt-9 grid gap-4 sm:grid-cols-2">
            {REASONS.map((r) => (
              <div key={r.title} className="rounded-2xl border border-border bg-surface-2 p-6">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
                  style={{ background: CHIP_GRADIENT }}
                >
                  <r.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                  {r.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{r.body}</p>
              </div>
            ))}
          </div>

          {/* real staff voices, so the page isn't only us talking about us */}
          <QuoteCarousel quotes={PUBLISHED_QUOTES} />
        </div>
      </section>

      {/* the role we're hiring for */}
      <section id="roles" className="scroll-mt-24 border-b border-border bg-surface-2">
        <div className="mx-auto max-w-7xl px-6 py-14 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            The role
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
            We are hiring Independent Living Services staff, working one-on-one
            with adults on the daily-living skills that build real independence.
          </p>

          <div className="mt-8 rounded-2xl border border-border bg-surface p-6 sm:p-8">
            <h3 className="text-xl font-semibold tracking-tight text-foreground">
              {ils.role?.title || ils.name}
            </h3>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted">
              {ils.roleDescription}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/careers/apply?program=${ils.slug}`}
                className="inline-flex items-center justify-center rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Apply for this role
              </Link>
              <Link
                href={`/careers/${ils.slug}`}
                className="inline-flex items-center justify-center rounded-md border border-border-strong px-5 py-2.5 text-sm font-semibold text-foreground transition hover:border-brand-light hover:text-brand-dark"
              >
                Read the full role
              </Link>
            </div>
          </div>

          <p className="mt-6 text-sm text-muted">
            Want to read about the service itself?{" "}
            <Link href="/services" className="font-semibold text-brand-dark underline underline-offset-2">
              See Independent Living Services
            </Link>
            .
          </p>
        </div>
      </section>

      {/* what it takes, before they start a long form */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-14 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            What you&apos;ll need
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
            Worth knowing before you start the application. Most of this work
            happens out in the community, so getting there matters.
          </p>

          <ul className="mt-7 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {REQUIREMENTS.map((req) => (
              <li
                key={req.label}
                className="flex items-start gap-3 text-base leading-relaxed text-foreground"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-light/15 text-xs font-bold text-brand-dark"
                >
                  ✓
                </span>
                <span>
                  {req.label}
                  {req.note && <span className="text-brand-dark">*</span>}
                </span>
              </li>
            ))}
          </ul>

          {REQUIREMENTS.filter((r) => r.note).map((r) => (
            <p key={r.label} className="mt-5 max-w-3xl text-sm leading-relaxed text-muted">
              <span className="font-semibold text-brand-dark">*</span> {r.note}
            </p>
          ))}

          <div className="mt-8 rounded-2xl border border-border bg-surface-2 p-6">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Helpful, but not required
            </h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {NICE_TO_HAVE.map((n) => (
                <li
                  key={n}
                  className="rounded-full bg-brand-light/10 px-3 py-1 text-xs font-semibold text-brand-dark"
                >
                  {n}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              If you don&apos;t have these yet, apply anyway. We would rather hear
              from you than have you count yourself out.
            </p>
          </div>

          {/* only renders once there are real steps to describe */}
          {HIRING_STEPS.length > 0 && (
            <div className="mt-12">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                How hiring works
              </h2>
              <ol className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {HIRING_STEPS.map((step, i) => (
                  <li key={step.title} className="rounded-2xl border border-border bg-surface-2 p-6">
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: CHIP_GRADIENT }}
                    >
                      {i + 1}
                    </span>
                    <h3 className="mt-3 text-base font-semibold tracking-tight text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </section>

      <section className="bg-surface-2">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Ready to apply?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            One short application and our team will follow up with you about the
            role.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/careers/apply"
              className="inline-flex items-center justify-center rounded-md bg-brand-light px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Start an application
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-md border border-border-strong px-6 py-3 text-base font-medium text-foreground transition hover:border-brand-light hover:text-brand-dark"
            >
              Ask a question first
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
