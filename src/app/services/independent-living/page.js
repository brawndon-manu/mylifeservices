import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { services } from "@/lib/services";
import SkillsBrowser from "@/components/SkillsBrowser";

// ILS is the flagship, so it gets its own page instead of the shared [slug] one:
// a day-in-the-life story up top, then the full skills list as a browser. the
// other four services still render from services/[slug]/page.js.
const service = services.find((s) => s.slug === "independent-living");

// same lifted azure as the homepage / services hero
const LOGO_GRADIENT =
  "linear-gradient(135deg,#176f97 0%,#1f93bf 46%,#29b1dd 74%,#54cef1 100%)";
const CHIP_GRADIENT = "linear-gradient(140deg,#2ab3e0,#186a94)";

export const metadata = {
  title: service?.name,
  description: service?.description,
};

export default function IndependentLivingPage() {
  if (!service) notFound();
  const { day = [], categories = [], cta, umbrella } = service;
  const total = categories.reduce((n, c) => n + c.items.length, 0);

  return (
    <>
      {/* hero, always dark, so fixed colors regardless of theme */}
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
            Independent Living Services
          </p>
          <h1 className="mt-2 max-w-[13em] text-3xl font-semibold tracking-tight sm:text-4xl md:text-[2.75rem] md:leading-[1.1]">
            What independence actually looks like
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#e8f6fd] sm:text-lg">
            ILS is one-on-one support, in real places, on a real schedule. Not a
            classroom. Here is how a day takes shape, and the skills we build
            inside it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#skills"
              className="inline-flex items-center justify-center rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-[#14608a] shadow-sm transition hover:bg-[#eaf7fe]"
            >
              See all {total} skills
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

      {/* the day */}
      <section className="bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-14 sm:py-16">
          <div className="space-y-0">
            {day.map((m, i) => (
              <div
                key={m.when}
                className={`grid gap-3 py-7 sm:grid-cols-[110px_1fr] sm:gap-7 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <p className="pt-1 text-xs font-bold uppercase tracking-[0.1em] text-brand-dark">
                  {m.when}
                </p>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                    {m.title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
                    {m.body}
                  </p>
                  <ul className="mt-3.5 flex flex-wrap gap-2">
                    {m.skills.map((s) => (
                      <li
                        key={s}
                        className="rounded-full bg-brand-light/10 px-3 py-1 text-xs font-semibold text-brand-dark"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SkillsBrowser categories={categories} chipGradient={CHIP_GRADIENT} />

      {umbrella && (
        <section className="border-t border-border bg-surface-2">
          <div className="mx-auto max-w-5xl px-6 py-14 sm:py-16">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {umbrella.title}
            </h2>
            {umbrella.intro && (
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted sm:text-lg">
                {umbrella.intro}
              </p>
            )}
            <ul className="mt-8 grid gap-5 sm:grid-cols-3">
              {umbrella.items.map((item) => (
                <li
                  key={item.name}
                  className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
                >
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">
                    {item.name}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-muted">
                    {item.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {cta && (
        <section className="border-t border-border bg-surface">
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
