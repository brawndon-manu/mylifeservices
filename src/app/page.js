import Link from "next/link";
import Image from "next/image";
import ServicesOverview from "@/components/ServicesOverview";
import IntroReveal from "@/components/IntroReveal";
import StoriesCarousel from "@/components/StoriesCarousel";
import { prisma } from "@/lib/prisma";
import { categoryLabel, formatDate } from "@/lib/newsletter";

// read fresh so story photos added in the portal show right away.
export const dynamic = "force-dynamic";

// Orange County service-area map. Uses the same env-driven Google Maps Embed
// key as the contact page, with an OpenStreetMap fallback (OC bbox) if it's
// unset so the map always renders.
const OC_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
const OC_MAP_SRC = OC_MAPS_KEY
  ? `https://www.google.com/maps/embed/v1/place?key=${OC_MAPS_KEY}&q=Orange+County,+CA&zoom=9`
  : "https://www.openstreetmap.org/export/embed.html?bbox=-118.13%2C33.38%2C-117.41%2C33.95&layer=mapnik";

// gradient built from the logo's own blue (sampled #2ac2f1 -> #2287b1). lifted off
// the old near-black navy corner so the whole thing reads lighter/airier, still deep
// enough on the left for white text. used for the hero + the service-area panel so
// the whole page reads in the logo's color instead of a generic navy/cyan.
const LOGO_GRADIENT =
  "linear-gradient(135deg,#176f97 0%,#1f93bf 46%,#29b1dd 74%,#54cef1 100%)";
const CHIP_GRADIENT = "linear-gradient(140deg,#2ab3e0,#186a94)";
const ACCENT_BAR = "linear-gradient(90deg,#2ac2f1,#1c7ba6)";

// icon per This Week category for the homepage feed peek
const CAT_ICON = { PAST_WEEK: SparkIcon, UPCOMING: CalendarIcon };

const storyPreviews = [
  {
    initials: "RO",
    since: "With MLS since 2020",
    title: "Robert's first place",
    teaser:
      "He came to MLS to build independence, not to move out. A year of small steps led to his own studio.",
    href: "/stories#ro",
    // shares the managed Stories photos: prefer a portrait if uploaded,
    // otherwise show the move-in photo.
    photoSections: ["story-ro-portrait", "story-ro-milestone"],
  },
  {
    initials: "RR",
    since: "With MLS since 2022",
    title: "RR's own front door",
    teaser:
      "Now in his own one-bedroom apartment, paying just 30% of his income through a Project-Based Voucher.",
    href: "/stories#rr",
    photoSections: ["story-rr-portrait"],
  },
];

// the strip that overlaps the hero. keep these honest - they show up on the
// public site, so only numbers we can actually stand behind.
const stats = [
  { value: "5", label: "program areas" },
  { value: "250+", label: "clients supported" },
  { value: "80+", label: "staff" },
  { value: "OC", label: "county-wide" },
];

const values = [
  {
    Icon: PersonIcon,
    title: "Person-Centered",
    body: "Every plan starts with the participant: their goals, their pace, their priorities. We adapt to the person, not the other way around.",
  },
  {
    Icon: CommunityIcon,
    title: "Community-Based",
    body: "Skills are built in real places: the kitchen, the bus, the grocery store, the neighborhood. Support meets life where it actually happens.",
  },
  {
    Icon: TargetIcon,
    title: "Goal-Driven",
    body: "Progress is measured by outcomes that matter to the participant: more independence, more confidence, more of the life they want.",
  },
];

export default async function HomePage() {
  // managed story portraits (shared with the Stories page) for the cards.
  const storyPhotos = await prisma.sitePhoto.findMany({ where: { active: true } });
  // latest published "This Week" items for the closing CTA feed peek.
  const newsItems = await prisma.newsletterItem.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }],
    take: 3,
  });
  // pick the first available photo from a person's preferred sections.
  const photoFor = (sections) => {
    for (const s of sections) {
      const p = storyPhotos.find((x) => x.section === s);
      if (p) return p;
    }
    return null;
  };
  // resolve photos server-side and hand the plain data to the client carousel.
  const storyCards = storyPreviews.map(
    ({ initials, title, teaser, since, href, photoSections }) => {
      const photo = photoFor(photoSections);
      return {
        initials,
        title,
        teaser,
        since,
        href,
        photo: photo
          ? { url: photo.url, alt: photo.alt || `${initials} portrait` }
          : null,
      };
    },
  );

  return (
    <>
      {/* branded intro curtain, once per session on the homepage */}
      <IntroReveal />
      {/* gradient hero. always dark (the header floats on top of it and goes
          translucent up here), so it reads the same in Light / Dim / Night. */}
      <section
        className="relative overflow-hidden text-white"
        style={{ background: LOGO_GRADIENT }}
      >
        {/* tree mark, watermarked into the top-right of the gradient */}
        <Image
          src="/logo/treelogo_white.png"
          alt=""
          aria-hidden="true"
          width={520}
          height={520}
          priority
          className="pointer-events-none absolute -right-8 top-16 w-[300px] max-w-[50%] opacity-20 sm:w-[460px]"
        />
        {/* soft cyan glow bleeding out of the bottom-left */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-52 -left-36 h-[560px] w-[560px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(120,220,250,0.5), transparent 66%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-6 pb-40 pt-32 sm:pb-48 sm:pt-40">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#cfeefc]">
            My Life. My Way.
          </p>
          {/* capped so the long line breaks before it reaches the tree
              watermark on the right (was overlapping it) */}
          <h1 className="mt-4 max-w-[11.5em] text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Independence, built one real day at a time.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/85">
            My Life Services partners with individuals, families, and the Regional
            Center of Orange County to deliver respectful, person-centered support
            that helps adults with intellectual and developmental disabilities build
            independence and well-being.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            {/* the hero is always dark, so these use fixed colors, not theme
                tokens (brand-dark flips light in Dim/Night and kills contrast) */}
            <Link
              href="/services"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-3.5 text-base font-bold text-[#14608a] shadow-sm transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Explore our services <span aria-hidden="true">→</span>
            </Link>
            <a
              href="tel:+15626862548"
              className="inline-flex items-center justify-center rounded-xl border-2 border-white/50 px-7 py-3.5 text-base font-bold text-white transition hover:bg-white hover:text-[#14608a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Call (562) 686-2548
            </a>
          </div>
        </div>
      </section>

      {/* stat strip, lifted up so it overlaps the bottom of the hero */}
      <div className="relative z-10 mx-auto -mt-16 mb-4 max-w-7xl px-6 sm:-mt-20 sm:mb-6">
        <dl className="grid grid-cols-2 rounded-2xl border border-border bg-surface p-6 shadow-xl sm:grid-cols-4 sm:divide-x sm:divide-border">
          {stats.map(({ value, label }) => (
            <div key={label} className="px-2 py-3 text-center sm:py-1">
              <dd className="text-3xl font-bold tracking-tight text-brand-light">
                {value}
              </dd>
              <dt className="mt-1 text-sm text-muted">{label}</dt>
            </div>
          ))}
        </dl>
      </div>
      <section className="border-t border-border bg-surface-2 night:!bg-background">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
              How we work
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Built around the person, not the program
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
              Every participant comes to us with their own goals, routines, and
              vision for their life. Our job is to build supports that fit,
              not the other way around.
            </p>
          </div>
          <ul className="mt-12 grid gap-5 sm:grid-cols-3">
            {values.map(({ Icon, title, body }) => (
              <li
                key={title}
                className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-sm"
              >
                {/* logo-gradient accent bar + icon chip (fixed colors so they read
                    on-brand on the white card in Light and the dark card in Dim/Night) */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ background: ACCENT_BAR }}
                />
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-sm"
                  style={{ background: CHIP_GRADIENT }}
                >
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="border-t border-border bg-background">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          {/* the logo-gradient panel is constant across themes - it's the page's
              "hero echo", so the service area pops the same in Light / Dim / Night */}
          <div
            className="relative overflow-hidden rounded-3xl p-8 shadow-xl sm:p-12"
            style={{ background: LOGO_GRADIENT }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-40 -right-28 h-96 w-96 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(130,224,250,0.4), transparent 66%)",
              }}
            />
            <div className="relative grid items-center gap-8 sm:grid-cols-[1fr_1.15fr] sm:gap-12">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#bfe8fa]">
                  Our service area
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Proudly serving Orange County
                </h2>
                <p className="mt-5 text-base leading-relaxed text-white/90 sm:text-lg">
                  My Life Services supports individuals and families across Orange
                  County, in coordination with the Regional Center of Orange
                  County.
                </p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/25 shadow-2xl">
                <iframe
                  title="Map of Orange County, California"
                  src={OC_MAP_SRC}
                  className="block aspect-[4/3] w-full"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
      <ServicesOverview />
      <section className="border-t border-border bg-surface night:!bg-background">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <header className="mb-12 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
              Real stories
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              What independence looks like
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              Every participant&apos;s path is their own. Here are a few of
              the stories behind the work.
            </p>
          </header>
          <StoriesCarousel stories={storyCards} />
        </div>
      </section>
      <section className="border-t border-border bg-background">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          {/* closing CTA, changelog-style: heading + a peek at the latest This
              Week items (pulled live from the newsletter) */}
          <div className="rounded-3xl border border-border bg-surface-2 p-8 shadow-sm sm:p-12">
            <div className="grid gap-10 sm:grid-cols-2 sm:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
                  This Week in My Life Services
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  See what our community is up to
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted">
                  Highlights from the people we support and the team behind
                  them, plus a look at what&apos;s coming up.
                </p>
                <Link
                  href="/this-week"
                  className="mt-7 inline-flex items-center gap-2 rounded-xl bg-brand-light px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  See This Week <span aria-hidden="true">→</span>
                </Link>
              </div>

              {newsItems.length > 0 ? (
                <ul className="divide-y divide-border">
                  {newsItems.map((item) => {
                    const Icon = CAT_ICON[item.category] ?? SparkIcon;
                    return (
                      <li
                        key={item.id}
                        className="flex gap-4 py-4 first:pt-0 last:pb-0"
                      >
                        <span
                          className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-white shadow-sm"
                          style={{ background: CHIP_GRADIENT }}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-brand-light">
                            {categoryLabel(item.category)}
                          </p>
                          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                            {item.title}
                          </p>
                          <p className="mt-0.5 text-xs text-faint">
                            {formatDate(item.eventDate || item.publishedAt)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface p-8 text-center">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm"
                    style={{ background: CHIP_GRADIENT }}
                  >
                    <SparkIcon className="h-5 w-5" />
                  </span>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    New highlights are on the way.
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Check back soon for moments from our community.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// "how we work" value icons. white strokes so they read on the gradient chip.
function PersonIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function CommunityIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="9" r="2.6" />
      <circle cx="17" cy="10" r="2.2" />
      <path d="M4 19a5 5 0 0 1 10 0M14.5 19a4 4 0 0 1 6 0" />
    </svg>
  );
}

function TargetIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

// this week feed icons: a spark for "this past week", a calendar for "coming up"
function SparkIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </svg>
  );
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  );
}
