import Link from "next/link";
import Image from "next/image";
import { services } from "@/lib/services";

// homepage "what we do" bento. one feature panel (Independent Living) spanning
// two rows, one accent panel (Day Program), and three plain cards. the feature +
// accent panels are ALWAYS dark, so their text/icons use fixed colors rather
// than theme tokens (which flip light in Dim/Night); the plain cards are themed.
const ICONS = {
  "independent-living": HomeIcon,
  "supported-living": HeartIcon,
  "day-program": SunIcon,
  "self-determination": CompassIcon,
  "crisis-support": ChatIcon,
};

// which slug gets which treatment in the grid
const FEATURE = "independent-living";
const ACCENT = "day-program";

// the feature + accent panels use a fixed color (not theme tokens, which flip light
// in Dim/Night). straight from the logo azure, lifted off the old near-black navy
// that read as a black block in Light mode. matches the hero + service-area gradient.
const FEATURE_BG =
  "linear-gradient(160deg,#176f97 0%,#1f93bf 58%,#2ab3dd 100%)";
const ACCENT_BG = "linear-gradient(150deg,#1f8bbb,#2ac2f1)";
// gradient icon chip for the plain cards, matches the "how we work" chips so the
// whole homepage reads in one visual language.
const CHIP_GRADIENT = "linear-gradient(140deg,#2ab3e0,#186a94)";

export default function ServicesOverview() {
  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <header className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
            What we do
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Five program areas, designed around the people we serve
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            From building daily-living skills to short-term support, there&apos;s a
            program for where each person is right now.
          </p>
        </header>

        {/* small hint instead of a "learn more" on every card */}
        <p className="mt-6 text-sm font-medium text-muted">
          Select any card to see the full program details.
        </p>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:auto-rows-[212px] lg:grid-cols-3">
          {services.map((service, i) => {
            const Icon = ICONS[service.slug] ?? HomeIcon;
            const isFeature = service.slug === FEATURE;
            const isAccent = service.slug === ACCENT;
            const solid = isFeature || isAccent; // always-dark panels

            return (
              <li
                key={service.slug}
                className={
                  isFeature ? "sm:col-span-2 lg:col-span-1 lg:row-span-2" : ""
                }
              >
                <Link
                  href={`/services/${service.slug}`}
                  style={
                    isFeature
                      ? { background: FEATURE_BG }
                      : isAccent
                        ? { background: ACCENT_BG }
                        : undefined
                  }
                  className={`group card-lift relative flex h-full flex-col overflow-hidden rounded-2xl p-6 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                    solid
                      ? "text-white"
                      : "border border-border bg-surface-2 text-foreground"
                  } ${isFeature ? "p-7" : ""}`}
                >
                  {/* soft bloom + faint tree watermark fill the tall feature panel */}
                  {isFeature && (
                    <>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-[#2ac2f1]/15"
                      />
                      <Image
                        src="/logo/treelogo_white.png"
                        alt=""
                        aria-hidden="true"
                        width={200}
                        height={200}
                        className="pointer-events-none absolute -right-6 top-12 w-[188px] opacity-[0.12]"
                      />
                    </>
                  )}

                  {/* faint program number, reinforces "five program areas" */}
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute right-5 top-4 text-sm font-extrabold tracking-wide ${
                      solid ? "text-white/40" : "text-foreground/15"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  {/* icon chip: gradient on the plain cards, translucent on the colored ones */}
                  <span
                    style={!solid ? { background: CHIP_GRADIENT } : undefined}
                    className={`relative flex h-11 w-11 flex-none items-center justify-center rounded-xl ${
                      solid ? "border border-white/20 bg-white/10" : "shadow-sm"
                    }`}
                  >
                    <Icon
                      className={`h-[22px] w-[22px] ${solid ? "text-[#bfe6fa]" : "text-white"}`}
                    />
                  </span>

                  <div className="relative mt-auto pt-6">
                    <h3
                      className={`font-semibold tracking-tight ${
                        isFeature ? "text-2xl leading-tight" : "text-lg"
                      }`}
                    >
                      {service.name}
                    </h3>
                    <p
                      className={`mt-2 text-sm leading-relaxed ${
                        solid ? "text-white/85" : "text-muted"
                      } ${isFeature ? "max-w-[24em] text-[15px]" : ""}`}
                    >
                      {service.short}
                    </p>
                    {/* keep the learn more only on the flagship panel; the small
                        cards rely on the hint above the grid + the hover lift */}
                    {isFeature && (
                      <p className="mt-5 text-sm font-semibold text-[#bfe6fa]">
                        Learn more{" "}
                        <span
                          aria-hidden="true"
                          className="inline-block transition-transform group-hover:translate-x-0.5"
                        >
                          →
                        </span>
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-10 text-sm text-muted">
          <Link
            href="/services"
            className="font-medium text-foreground underline underline-offset-4 hover:text-brand-light"
          >
            See all services
          </Link>
        </p>
      </div>
    </section>
  );
}

const strokeProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

function HomeIcon({ className }) {
  return (
    <svg className={className} {...strokeProps}>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function HeartIcon({ className }) {
  return (
    <svg className={className} {...strokeProps}>
      <path d="M12 20s-7-4.3-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.7 12 20 12 20z" />
    </svg>
  );
}

function SunIcon({ className }) {
  return (
    <svg className={className} {...strokeProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  );
}

function CompassIcon({ className }) {
  return (
    <svg className={className} {...strokeProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2.2 5.3-5.3 2.2 2.2-5.3z" />
    </svg>
  );
}

function ChatIcon({ className }) {
  return (
    <svg className={className} {...strokeProps}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.4-.6L3 21l1.7-5a8.1 8.1 0 0 1-.7-3.5 8.4 8.4 0 0 1 8.4-8.4 8.4 8.4 0 0 1 8.6 7.4z" />
    </svg>
  );
}
