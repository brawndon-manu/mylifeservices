import Link from "next/link";
import Image from "next/image";
import { services } from "@/lib/services";

// homepage "what we do" section. The site presents a single service,
// Independent Living Services (ILS), as a feature panel, with the supports
// offered under the ILS umbrella shown as smaller cards beside it. The feature
// panel is ALWAYS dark, so its text/icons use fixed colors rather than theme
// tokens (which flip light in Dim/Night); the plain cards are themed.

// straight from the logo azure, lifted off the old near-black navy that read as a
// black block in Light mode. matches the hero + service-area gradient.
const FEATURE_BG =
  "linear-gradient(160deg,#176f97 0%,#1f93bf 58%,#2ab3dd 100%)";
// gradient icon chip for the plain cards, matches the "how we work" chips so the
// whole homepage reads in one visual language.
const CHIP_GRADIENT = "linear-gradient(140deg,#2ab3e0,#186a94)";

export default function ServicesOverview() {
  const ils =
    services.find((s) => s.slug === "independent-living") ?? services[0];
  const umbrella = ils?.umbrella;

  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <header className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
            What we do
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Independent Living Services, built around the people we serve
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            One-on-one support that helps adults build daily-living skills and
            greater independence, with additional supports available under the
            same ILS umbrella.
          </p>
        </header>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {/* ILS feature panel */}
          <Link
            href={`/services/${ils.slug}`}
            style={{ background: FEATURE_BG }}
            className="group card-lift relative flex flex-col overflow-hidden rounded-2xl p-7 text-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:row-span-2"
          >
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
            <span className="relative flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-white/20 bg-white/10">
              <HomeIcon className="h-[22px] w-[22px] text-[#bfe6fa]" />
            </span>
            <div className="relative mt-auto pt-6">
              <h3 className="text-2xl font-semibold leading-tight tracking-tight">
                {ils.name}
              </h3>
              <p className="mt-2 max-w-[24em] text-[15px] leading-relaxed text-white/85">
                {ils.short}
              </p>
              <p className="mt-5 text-sm font-semibold text-[#bfe6fa]">
                Learn more{" "}
                <span
                  aria-hidden="true"
                  className="inline-block transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              </p>
            </div>
          </Link>

          {/* umbrella supports */}
          {umbrella?.items.map((item) => (
            <div
              key={item.name}
              className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface-2 p-6 text-foreground shadow-sm"
            >
              <span
                style={{ background: CHIP_GRADIENT }}
                className="relative flex h-11 w-11 flex-none items-center justify-center rounded-xl shadow-sm"
              >
                <PlusIcon className="h-[22px] w-[22px] text-white" />
              </span>
              <div className="relative mt-auto pt-6">
                <h3 className="text-lg font-semibold tracking-tight">
                  {item.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 text-sm text-muted">
          <Link
            href="/services"
            className="font-medium text-foreground underline underline-offset-4 hover:text-brand-light"
          >
            See our services
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

function PlusIcon({ className }) {
  return (
    <svg className={className} {...strokeProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
