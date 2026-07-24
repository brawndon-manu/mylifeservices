import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { services } from "@/lib/services";
import {
  SkillsIcon,
  PeopleIcon,
  CommunityIcon,
  BriefcaseIcon,
  PulseIcon,
  TargetIcon,
} from "@/components/Icons";

// one icon per category, keyed by name so the order can shift without
// the icons drifting off their cards
const CATEGORY_ICONS = {
  "Skill Development": SkillsIcon,
  "Social & Peer Engagement": PeopleIcon,
  "Community-Based Activities": CommunityIcon,
  "Pre-Vocational & Employment Readiness": BriefcaseIcon,
  "Health & Wellness Support": PulseIcon,
  "Individual Goal Progression": TargetIcon,
};

// day program gets its own page like ILS does. the shape is different though:
// ILS had 101 short skills to tame, this one has 6 broad categories, so the
// job is making a group program feel concrete. a day on the schedule up top,
// the six areas in the middle, and the questions families actually ask at the
// bottom.
const service = services.find((s) => s.slug === "day-program");

const LOGO_GRADIENT =
  "linear-gradient(135deg,#176f97 0%,#1f93bf 46%,#29b1dd 74%,#54cef1 100%)";
const CHIP_GRADIENT = "linear-gradient(140deg,#2ab3e0,#186a94)";

export const metadata = {
  title: service?.name,
  description: service?.description,
};

export default function DayProgramPage() {
  if (!service) notFound();
  const { intro = [], categories = [], schedule = [], faq = [], facts = {}, cta } = service;

  // only show the stat strip once at least one fact is confirmed. until then
  // the hero just runs without it rather than printing a guess.
  const stats = [
    { value: facts.days, label: "Weekdays" },
    { value: facts.hours, label: "Program hours" },
    { value: facts.location, label: "Plus community outings" },
  ].filter((s) => s.value);

  // a clock column only appears once real times are filled in
  const hasTimes = schedule.some((s) => s.time);

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
        <div className="relative mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <Link
            href="/services"
            className="text-sm font-medium text-[#cfeefc] transition hover:text-white"
          >
            ← All services
          </Link>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-[#cfeefc]">
            Day Program
          </p>
          <h1 className="mt-2 max-w-[13em] text-3xl font-semibold tracking-tight sm:text-4xl md:text-[2.75rem] md:leading-[1.1]">
            A full day, with a plan behind it
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#e8f6fd] sm:text-lg">
            Structured daytime support in a group setting, built around each
            person&apos;s own goals. Here is how a day takes shape.
          </p>

          {stats.length > 0 && (
            <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
              {stats.map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd>
                    <span className="block text-xl font-semibold">{s.value}</span>
                    <span className="text-xs text-[#cfeefc]">{s.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#questions"
              className="inline-flex items-center justify-center rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-[#14608a] shadow-sm transition hover:bg-[#eaf7fe]"
            >
              Common questions
            </a>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-md border border-white/40 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      {intro.length > 0 && (
        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-5xl space-y-4 px-6 py-12 sm:py-14">
            {intro.map((p) => (
              <p key={p} className="max-w-3xl text-base leading-relaxed text-muted sm:text-lg">
                {p}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* the day, as a sequence. reads fine with or without clock times. */}
      <section className="bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-14 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            How the day runs
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
            The routine stays the same day to day, so it is easy to settle into.
            What each person works on inside it is their own.
          </p>

          <ol className="mt-9">
            {schedule.map((slot, i) => {
              const last = i === schedule.length - 1;
              return (
                <li
                  key={slot.title}
                  // the time cell is a third grid child, but only from sm up
                  // (it's display:none below that), so the columns have to
                  // change with it or the spine drifts out of place
                  className={`grid gap-x-4 sm:gap-x-5 ${
                    hasTimes
                      ? "grid-cols-[auto_1fr] sm:grid-cols-[86px_auto_1fr]"
                      : "grid-cols-[auto_1fr]"
                  }`}
                >
                  {hasTimes && (
                    <span className="hidden w-[86px] pt-3 text-right text-xs font-bold text-brand-dark sm:block">
                      {slot.time}
                    </span>
                  )}
                  {/* the spine */}
                  <span aria-hidden="true" className="flex flex-col items-center">
                    <span
                      className="mt-3.5 h-3.5 w-3.5 flex-none rounded-full ring-4 ring-surface"
                      style={{ background: CHIP_GRADIENT }}
                    />
                    {!last && <span className="w-0.5 flex-1 bg-border" />}
                  </span>
                  <div className={last ? "pb-1 pt-2" : "pb-8 pt-2"}>
                    {hasTimes && (
                      <p className="text-xs font-bold text-brand-dark sm:hidden">{slot.time}</p>
                    )}
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">
                      {slot.title}
                    </h3>
                    <p className="mt-1.5 max-w-2xl text-base leading-relaxed text-muted">
                      {slot.body}
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {slot.tags.map((t) => (
                        <li
                          key={t}
                          className="rounded-full bg-brand-light/10 px-3 py-1 text-xs font-semibold text-brand-dark"
                        >
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* the six areas the day is built from */}
      <section className="border-t border-border bg-surface-2">
        <div className="mx-auto max-w-5xl px-6 py-14 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            What the day is built from
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat, i) => {
              const Icon = CATEGORY_ICONS[cat.name];
              return (
              <div
                key={cat.name}
                className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6"
              >
                <span
                  aria-hidden="true"
                  className="absolute right-4 top-3 text-3xl font-extrabold text-foreground/[0.07]"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
                  style={{ background: CHIP_GRADIENT }}
                >
                  {Icon && <Icon className="h-5 w-5" />}
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                  {cat.name}
                </h3>
                {cat.items.map((item) => (
                  <p key={item} className="mt-2 text-sm leading-relaxed text-muted">
                    {item}
                  </p>
                ))}
              </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* the questions families arrive with */}
      {faq.length > 0 && (
        <section id="questions" className="scroll-mt-24 border-t border-border bg-surface">
          <div className="mx-auto max-w-5xl px-6 py-14 sm:py-16">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Questions families ask us first
            </h2>
            <div className="mt-8 space-y-3">
              {faq.map((item) => (
                <div key={item.q} className="rounded-2xl border border-border bg-surface-2 p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold tracking-tight text-foreground">
                      {item.q}
                    </h3>
                    <span className="text-xs text-faint">{item.note}</span>
                  </div>
                  <p className="mt-2 max-w-3xl text-base leading-relaxed text-muted">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {cta && (
        <section className="border-t border-border bg-surface-2">
          <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {cta.title}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              {cta.body}
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href={cta.buttonHref}
                className="inline-flex items-center justify-center rounded-md bg-brand-light px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {cta.buttonLabel}
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
