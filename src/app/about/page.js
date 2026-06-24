import Image from "next/image";
import { PhoneIcon, EnvelopeIcon } from "@/components/Icons";
import PhotoSlideshow from "@/components/PhotoSlideshow";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "About",
  description:
    "Learn about My Life Services: our history, growth, person-centered approach, team, and partnerships.",
};

// read fresh so photos added/removed in the portal show right away.
export const dynamic = "force-dynamic";

export default async function AboutPage() {
  // photos are managed from the portal (Site Photos). only active ones
  // render, ordered within their section.
  const sitePhotos = await prisma.sitePhoto.findMany({
    where: { active: true },
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
  });
  const photosFor = (section) =>
    sitePhotos
      .filter((p) => p.section === section)
      .map((p) => ({ src: p.url, alt: p.alt || "", caption: p.caption || "" }));

  const heroPhoto = photosFor("about-hero")[0];
  const overviewPhotos = photosFor("agency-overview");
  const partnershipPhoto = photosFor("partnership")[0];
  const teamPhoto = photosFor("about-team")[0];

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-surface-2 to-background">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <div className="grid items-center gap-10 sm:grid-cols-12 sm:gap-12">
            <div className="sm:col-span-7">
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
                Get to know us
              </p>
              <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
                About My Life Services
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
                Our story, our approach, and the people behind the programs.
              </p>
            </div>
            <div className="sm:col-span-5">
              {heroPhoto ? (
                <SinglePhoto photo={heroPhoto} ratio="aspect-[4/5]" />
              ) : (
                <ConsentPending ratio="aspect-[4/5]" />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Agency Overview */}
      <Section bg="white">
        <SplitContent
          reverse
          photo={
            overviewPhotos.length > 0 ? (
              <PhotoSlideshow photos={overviewPhotos} ratio="aspect-[4/3]" />
            ) : (
              <ConsentPending ratio="aspect-[4/3]" />
            )
          }
          heading="Agency Overview"
          body="My Life Services began by providing Independent Living Services (ILS) to support adults with intellectual and developmental disabilities. As needs changed and families requested additional options, MLS expanded its programs to offer more service pathways. Today, MLS provides multiple community-based services in coordination with the Regional Center of Orange County."
        />
      </Section>

      {/* Our Approach - values card */}
      <Section bg="slate">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface p-8 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
            How we work
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Our Approach
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
            MLS uses a person-centered approach that focuses on each
            individual&apos;s goals, preferences, and support needs. Services
            are designed to promote independence, skill development, and
            informed choice. Support is provided in real community settings
            whenever possible.
          </p>
        </div>
      </Section>

      {/* Partnership */}
      <Section bg="white">
        <SplitContent
          photo={
            partnershipPhoto ? (
              <SinglePhoto photo={partnershipPhoto} ratio="aspect-[4/3]" />
            ) : (
              <Image
                src="/about/partnership.jpg"
                alt="Puzzle pieces fitting together, representing collaboration"
                width={800}
                height={600}
                className="aspect-[4/3] w-full rounded-2xl object-cover shadow-sm"
              />
            )
          }
          heading="Partnership & Community Collaboration"
          body="MLS works closely with the Regional Center of Orange County, families, and community partners to coordinate services. Collaboration helps ensure individuals have access to appropriate supports, resources, and opportunities. Partnerships are focused on long-term stability and community integration."
        />
      </Section>

      {/* History & Growth */}
      <Section bg="slate">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            History & Growth
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
            My Life Services began by providing Independent Living Services
            (ILS) to adults with intellectual and developmental disabilities.
            As community needs evolved, MLS expanded its programs to offer
            additional service options. Today, MLS provides multiple
            community-based services in coordination with the Regional Center
            of Orange County.
          </p>
        </div>
      </Section>

      {/* Our Team */}
      <Section bg="white">
        <SplitContent
          reverse
          photo={
            teamPhoto ? (
              <SinglePhoto photo={teamPhoto} ratio="aspect-[4/3]" />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border-2 border-dashed border-brand-light bg-sky-50 px-6 text-center">
                <div>
                  <p className="text-2xl font-semibold tracking-tight text-brand">
                    Pic coming soon!
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    Our team is camera-shy. For now.
                  </p>
                </div>
              </div>
            )
          }
          heading="Our Team"
          body="My Life Services is supported by a team of trained professionals who deliver services across multiple programs. Staff receive ongoing training and supervision to ensure quality and compliance. The agency emphasizes respectful, ethical, and consistent support."
        />
      </Section>

      {/* Closing CTA band */}
      <section className="bg-brand-light text-white">
        <div className="mx-auto max-w-5xl px-6 py-14 sm:py-16">
          <div className="grid gap-8 sm:grid-cols-12 sm:items-center">
            <div className="sm:col-span-7">
              <h2 className="text-3xl font-semibold tracking-tight">
                Have questions?
              </h2>
              <p className="mt-3 max-w-md text-base leading-relaxed text-white/90 sm:text-lg">
                We&apos;re happy to talk through services, careers, or
                partnerships. Reach out any time.
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
              <a
                href="mailto:contact@mylifeservicesinc.com"
                className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-white px-5 py-3 text-base font-medium text-white transition hover:bg-surface hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <EnvelopeIcon className="h-5 w-5" />
                Email us
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Section({ bg, children }) {
  const bgClass = bg === "slate" ? "bg-surface-2" : "bg-surface";
  return (
    <section className={`${bgClass} border-t border-border`}>
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">{children}</div>
    </section>
  );
}

function SplitContent({ photo, heading, body, reverse = false }) {
  return (
    <div
      className={`grid items-center gap-10 sm:grid-cols-12 sm:gap-12 ${
        reverse ? "sm:[&>:first-child]:order-2" : ""
      }`}
    >
      <div className="sm:col-span-5">{photo}</div>
      <div className="sm:col-span-7">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {heading}
        </h2>
        <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
          {body}
        </p>
      </div>
    </div>
  );
}

// renders one managed site photo (hero / partnership) at the given ratio,
// with its caption underneath if there is one.
function SinglePhoto({ photo, ratio }) {
  return (
    <figure className="w-full">
      <div className={`relative ${ratio} w-full overflow-hidden rounded-2xl bg-surface-3 shadow-sm`}>
        <Image
          src={photo.src}
          alt={photo.alt || photo.caption || ""}
          fill
          sizes="(min-width: 640px) 40vw, 100vw"
          className="object-cover"
        />
      </div>
      {photo.caption && (
        <figcaption className="mt-3 text-sm leading-relaxed text-muted">
          {photo.caption}
        </figcaption>
      )}
    </figure>
  );
}

// Placeholder used while we wait on written consent for client photos.
function ConsentPending({ ratio }) {
  return (
    <div
      className={`${ratio} flex w-full items-center justify-center rounded-2xl border-2 border-dashed border-brand-light bg-sky-50 px-6 text-center`}
    >
      <div>
        <p className="text-2xl font-semibold tracking-tight text-brand">
          Photo coming soon
        </p>
        <p className="mt-2 text-sm text-muted">
          We&apos;re finalizing photo releases with our community before
          sharing here.
        </p>
      </div>
    </div>
  );
}

// Placeholder block for a photo that hasn't been added yet.
// Replace with <Image src="/about/<name>.jpg" ... /> when ready.
function PhotoSlot({ ratio, label, hint }) {
  return (
    <div
      className={`${ratio} flex w-full items-center justify-center rounded-2xl border-2 border-dashed border-border-strong bg-surface-3 px-6 text-center`}
    >
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-muted">
          {label}
        </p>
        <p className="mt-2 text-sm text-muted">{hint}</p>
      </div>
    </div>
  );
}
