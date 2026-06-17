import Link from "next/link";
import Image from "next/image";
import PageHeader from "@/components/PageHeader";
import { PhoneIcon, EnvelopeIcon } from "@/components/Icons";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Stories",
  description:
    "Real stories from people supported by My Life Services, shared with their permission.",
};

// read fresh so photos added/removed in the portal show right away.
export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  // story photos are managed from the portal (Site Photos). only active ones.
  const sitePhotos = await prisma.sitePhoto.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  const photoFor = (section) => {
    const p = sitePhotos.find((x) => x.section === section);
    return p ? { src: p.url, alt: p.alt || "", caption: p.caption || "" } : null;
  };
  const roPortrait = photoFor("story-ro-portrait");
  const roMilestone = photoFor("story-ro-milestone");
  const rrPortrait = photoFor("story-rr-portrait");

  return (
    <>
      <PageHeader
        eyebrow="Real stories"
        title="What independence looks like"
        intro="Behind every program is a person working toward a life they choose. These are some of their stories, shared with their permission."
      />

      {/* RO - Integrity Cottages */}
      <section id="ro" className="scroll-mt-20 border-t border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <div className="grid gap-10 sm:grid-cols-12 sm:gap-12">
            <div className="sm:col-span-5">
              <StoryPortrait photo={roPortrait} initials="RO" />
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">
                With MLS since 2020
              </p>
            </div>
            <div className="sm:col-span-7">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                RO&apos;s first place
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                After years of unstable housing, RO moved into his first
                studio apartment, supported by MLS and our partner
                Integrity Cottages.
              </p>
              <div className="mt-6 space-y-4 text-base leading-relaxed text-muted">
                <p>
                  RO joined My Life Services in 2020 with a clear long-term
                  goal: a place of his own. Before MLS, he didn&apos;t have a
                  stable place to live, making it hard to build the daily
                  routines that turn a space into a home.
                </p>
                <p>
                  Independence takes time. Over the next several years, RO
                  and his MLS team worked on the day-to-day skills that
                  lead to stable housing: cooking, budgeting, household
                  management, and the confidence that comes with making
                  decisions about your own life.
                </p>
                <p>
                  When the right opportunity came through Integrity
                  Cottages (a Project-Based Voucher community), RO was
                  ready. The photo below captures the day he received the
                  keys to his first studio.
                </p>
              </div>
            </div>
          </div>

          <figure className="mt-12">
            {roMilestone ? (
              <>
                <div className="relative mx-auto aspect-[4/3] w-full max-w-3xl overflow-hidden rounded-2xl bg-surface-3 shadow-sm">
                  <Image
                    src={roMilestone.src}
                    alt={roMilestone.alt || "RO on move-in day"}
                    fill
                    sizes="(min-width: 640px) 768px, 100vw"
                    className="object-cover"
                  />
                </div>
                {roMilestone.caption && (
                  <figcaption className="mx-auto mt-3 max-w-3xl text-center text-sm leading-relaxed text-muted">
                    {roMilestone.caption}
                  </figcaption>
                )}
              </>
            ) : (
              <>
                <MilestonePhotoPlaceholder />
                <figcaption className="mx-auto mt-3 max-w-3xl text-center text-sm leading-relaxed text-muted">
                  Move-in day photo coming soon, once RO&apos;s consent is on
                  file.
                </figcaption>
              </>
            )}
          </figure>

          <p className="mx-auto mt-12 max-w-3xl text-base leading-relaxed text-muted sm:text-lg">
            Today, RO lives independently in his studio. MLS staff continue
            to support him with the routines and goals that matter most to
            him.
          </p>
        </div>
      </section>

      {/* RR - PBV voucher */}
      <section id="rr" className="scroll-mt-20 border-t border-border bg-surface-2">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <div className="grid gap-10 sm:grid-cols-12 sm:gap-12">
            <div className="sm:col-span-7">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                RR&apos;s own front door
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                RR moved into his own one-bedroom apartment, paying just
                30% of his income in rent through a Project-Based Voucher.
              </p>
              <div className="mt-6 space-y-4 text-base leading-relaxed text-muted">
                <p>
                  RR joined My Life Services in 2022. Before MLS, he
                  didn&apos;t have a place of his own, moving between
                  temporary arrangements made it hard to plan a life on
                  his own terms.
                </p>
                <p>
                  Working with our team, RR set a clear goal: housing on
                  his own terms. That work paid off when he used a
                  Project-Based Voucher to move into a full one-bedroom
                  apartment, where he now pays 30% of his income in rent,
                  making independence financially sustainable for the long
                  term.
                </p>
                <p>
                  MLS continues to walk alongside RR, supporting the
                  routines and choices that make this home truly his.
                </p>
              </div>
            </div>
            <div className="sm:col-span-5">
              <StoryPortrait photo={rrPortrait} initials="RR" />
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">
                With MLS since 2022
              </p>
            </div>
          </div>

          <figure className="mt-12">
            <VideoPlaceholder />
            <figcaption className="mx-auto mt-3 max-w-3xl text-center text-sm leading-relaxed text-muted">
              RR shares his story. Video coming soon.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Closing CTA band */}
      <section className="bg-brand-light text-white">
        <div className="mx-auto max-w-5xl px-6 py-14 sm:py-16">
          <div className="grid gap-8 sm:grid-cols-12 sm:items-center">
            <div className="sm:col-span-7">
              <h2 className="text-3xl font-semibold tracking-tight">
                Want to learn more?
              </h2>
              <p className="mt-3 max-w-md text-base leading-relaxed text-white/90 sm:text-lg">
                Talk with our team about how MLS could support you or
                someone in your family.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:col-span-5 sm:items-end">
              <a
                href="tel:+15626862548"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-surface px-5 py-3 text-base font-medium text-brand transition hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <PhoneIcon className="h-5 w-5" />
                (562) 686-2548
              </a>
              <Link
                href="/services"
                className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-white px-5 py-3 text-base font-medium text-white transition hover:bg-surface hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Explore our services
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// a managed story portrait (square), or the initials placeholder if none
// has been uploaded yet. the same photo also appears on the home page card.
function StoryPortrait({ photo, initials }) {
  if (!photo) return <PortraitPlaceholder initials={initials} />;
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-surface-3 shadow-sm">
      <Image
        src={photo.src}
        alt={photo.alt || `${initials} portrait`}
        fill
        sizes="(min-width: 640px) 40vw, 100vw"
        className="object-cover"
      />
    </div>
  );
}

function PortraitPlaceholder({ initials }) {
  return (
    <div className="flex aspect-square w-full items-center justify-center rounded-2xl border-2 border-dashed border-brand-light bg-sky-50">
      <div className="text-center">
        <p className="text-5xl font-semibold tracking-tight text-brand">
          {initials}
        </p>
        <p className="mt-3 text-sm text-muted">Portrait coming soon</p>
      </div>
    </div>
  );
}

function MilestonePhotoPlaceholder() {
  return (
    <div className="mx-auto flex aspect-[4/3] w-full max-w-3xl items-center justify-center rounded-2xl border-2 border-dashed border-brand-light bg-sky-50">
      <div className="text-center">
        <p className="text-xl font-semibold tracking-tight text-brand">
          Photo coming soon
        </p>
        <p className="mt-2 text-sm text-muted">
          Finalizing photo releases with our community.
        </p>
      </div>
    </div>
  );
}

function VideoPlaceholder() {
  return (
    <div className="mx-auto flex aspect-video w-full max-w-3xl items-center justify-center rounded-2xl border-2 border-dashed border-brand-light bg-sky-50">
      <div className="text-center">
        <p className="text-xl font-semibold tracking-tight text-brand">
          Video coming soon
        </p>
        <p className="mt-2 text-sm text-muted">
          Hear the story in RR&apos;s own words.
        </p>
      </div>
    </div>
  );
}
