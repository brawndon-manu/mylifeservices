import Link from "next/link";
import Image from "next/image";
import { services } from "@/lib/services";

export const metadata = {
  title: "Services",
  description:
    "Independent Living Services (ILS) from My Life Services: one-on-one support that helps adults with intellectual and developmental disabilities build greater independence.",
};

// same lifted azure as the homepage hero / service-area panels
const LOGO_GRADIENT =
  "linear-gradient(135deg,#176f97 0%,#1f93bf 46%,#29b1dd 74%,#54cef1 100%)";
const CHIP_GRADIENT = "linear-gradient(140deg,#2ab3e0,#186a94)";
const ACCENT_BAR = "linear-gradient(#2ac2f1,#1c7ba6)";

// a few "what's included" highlights for ILS, short labels drawn from the
// category breakdown on the detail page.
const HIGHLIGHTS = [
  "Home & daily living",
  "Money management",
  "Housing & tenancy",
  "Employment & education",
];

export default function ServicesPage() {
  // the site presents a single service, Independent Living Services (ILS).
  const ils =
    services.find((s) => s.slug === "independent-living") ?? services[0];
  const umbrella = ils?.umbrella;

  return (
    <>
      {/* gradient page hero, matches the homepage language. always dark, so it
          uses fixed colors regardless of theme. */}
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
        <div className="relative mx-auto max-w-7xl px-6 py-16 sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#cfeefc]">
            What we do
          </p>
          <h1 className="mt-4 max-w-[14em] text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Independent Living Services
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/90">
            Person-centered, one-on-one support that helps adults with
            intellectual and developmental disabilities build greater
            independence, across Orange County.
          </p>
        </div>
      </section>

      <div className="border-t border-border bg-surface">
        <div className="mx-auto max-w-7xl px-6 py-14 sm:py-20">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-2 p-6 shadow-sm sm:p-8">
            {/* logo-gradient accent bar down the left edge */}
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-1.5"
              style={{ background: ACCENT_BAR }}
            />
            <div className="grid gap-5 pl-2 sm:grid-cols-[auto_1fr] sm:gap-7">
              <div className="flex items-start">
                <span
                  className="flex h-12 w-12 flex-none items-center justify-center rounded-xl text-white shadow-sm"
                  style={{ background: CHIP_GRADIENT }}
                >
                  <HomeIcon className="h-6 w-6" />
                </span>
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {ils.name}
                </h2>
                <p className="mt-1 text-sm font-medium text-brand-light">
                  {ils.short}
                </p>
                <p className="mt-3 text-base leading-relaxed text-muted">
                  {ils.description}
                </p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {HIGHLIGHTS.map((h) => (
                    <li
                      key={h}
                      className="rounded-full border border-brand-light/30 bg-brand-light/10 px-3 py-1 text-xs font-medium text-brand-dark"
                    >
                      {h}
                    </li>
                  ))}
                </ul>
                <p className="mt-5">
                  <Link
                    href={`/services/${ils.slug}`}
                    aria-label={`Read more about ${ils.name}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-dark transition hover:text-brand"
                  >
                    Read more
                    <span aria-hidden="true">→</span>
                  </Link>
                </p>
              </div>
            </div>
          </div>

          {umbrella && (
            <div className="mt-14">
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
                    className="rounded-2xl border border-border bg-surface-2 p-6 shadow-sm"
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
          )}
        </div>
      </div>
    </>
  );
}

function HomeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}
