import Link from "next/link";
import Image from "next/image";
import { services } from "@/lib/services";

export const metadata = {
  title: "Services",
  description:
    "Independent Living, Day Program, Supported Living, Self-Determination, and Crisis Support: services from My Life Services.",
};

// same lifted azure as the homepage hero / service-area panels
const LOGO_GRADIENT =
  "linear-gradient(135deg,#176f97 0%,#1f93bf 46%,#29b1dd 74%,#54cef1 100%)";
const CHIP_GRADIENT = "linear-gradient(140deg,#2ab3e0,#186a94)";
const ACCENT_BAR = "linear-gradient(#2ac2f1,#1c7ba6)";

const ICONS = {
  "independent-living": HomeIcon,
  "supported-living": HeartIcon,
  "day-program": SunIcon,
  "self-determination": CompassIcon,
  "crisis-support": ChatIcon,
};

// a few "what's included" highlights per program, short labels drawn from each
// one's category breakdown.
const HIGHLIGHTS = {
  "independent-living": [
    "Home & daily living",
    "Money management",
    "Housing & tenancy",
    "Employment & education",
  ],
  "supported-living": [
    "Daily support",
    "Health & medication",
    "Household management",
    "Community integration",
  ],
  "day-program": [
    "Skill development",
    "Peer engagement",
    "Community outings",
    "Employment readiness",
  ],
  "self-determination": [
    "Budget planning",
    "Person-centered planning",
    "Advocacy & decisions",
  ],
  "crisis-support": [
    "Immediate stabilization",
    "Safety planning",
    "Caregiver guidance",
  ],
};

export default function ServicesPage() {
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
        <div className="relative mx-auto max-w-5xl px-6 py-16 sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#cfeefc]">
            What we do
          </p>
          <h1 className="mt-4 max-w-[13em] text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Five ways we support independence
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/90">
            Person-centered programs for adults with intellectual and
            developmental disabilities, across Orange County.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2.5">
            {services.map((s) => (
              <li key={s.slug}>
                <a
                  href={`#${s.slug}`}
                  className="inline-block rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
                >
                  {s.name.replace(" Services (ILS)", "")}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="border-t border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
          <ul className="flex flex-col gap-5">
            {services.map((service, i) => {
              const Icon = ICONS[service.slug] ?? HomeIcon;
              const highlights = HIGHLIGHTS[service.slug] ?? [];
              return (
                <li key={service.slug} id={service.slug} className="scroll-mt-24">
                  <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-2 p-6 shadow-sm sm:p-8">
                    {/* logo-gradient accent bar down the left edge */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1.5"
                      style={{ background: ACCENT_BAR }}
                    />
                    <div className="grid gap-5 pl-2 sm:grid-cols-[auto_1fr] sm:gap-7">
                      <div className="flex items-start gap-4">
                        <span className="pt-2.5 text-sm font-bold tracking-wide text-faint">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span
                          className="flex h-12 w-12 flex-none items-center justify-center rounded-xl text-white shadow-sm"
                          style={{ background: CHIP_GRADIENT }}
                        >
                          <Icon className="h-6 w-6" />
                        </span>
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                          {service.name}
                        </h2>
                        <p className="mt-1 text-sm font-medium text-brand-light">
                          {service.short}
                        </p>
                        <p className="mt-3 text-base leading-relaxed text-muted">
                          {service.description}
                        </p>
                        {highlights.length > 0 && (
                          <ul className="mt-4 flex flex-wrap gap-2">
                            {highlights.map((h) => (
                              <li
                                key={h}
                                className="rounded-full border border-brand-light/30 bg-brand-light/10 px-3 py-1 text-xs font-medium text-brand-dark"
                              >
                                {h}
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="mt-5">
                          <Link
                            href={`/services/${service.slug}`}
                            aria-label={`Read more about ${service.name}`}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-dark transition hover:text-brand"
                          >
                            Read more
                            <span aria-hidden="true">→</span>
                          </Link>
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
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

function HeartIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20s-7-4.3-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.7 12 20 12 20z" />
    </svg>
  );
}

function SunIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  );
}

function CompassIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2.2 5.3-5.3 2.2 2.2-5.3z" />
    </svg>
  );
}

function ChatIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.4-.6L3 21l1.7-5a8.1 8.1 0 0 1-.7-3.5 8.4 8.4 0 0 1 8.4-8.4 8.4 8.4 0 0 1 8.6 7.4z" />
    </svg>
  );
}
