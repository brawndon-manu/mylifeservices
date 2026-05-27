import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { PhoneIcon, EnvelopeIcon } from "@/components/Icons";

export const metadata = {
  title: "Stories",
  description:
    "Real stories from people supported by My Life Services — shared with their permission.",
};

export default function StoriesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Real stories"
        title="What independence looks like"
        intro="Behind every program is a person working toward a life they choose. These are some of their stories — shared with their permission."
      />

      {/* RO — Integrity Cottages */}
      <section id="ro" className="scroll-mt-20 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <div className="grid gap-10 sm:grid-cols-12 sm:gap-12">
            <div className="sm:col-span-5">
              <PortraitPlaceholder initials="RO" />
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                With MLS since 2020
              </p>
            </div>
            <div className="sm:col-span-7">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                RO&apos;s first place
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-700">
                After years of unstable housing, RO moved into his first
                studio apartment — supported by MLS and our partner
                Integrity Cottages.
              </p>
              <div className="mt-6 space-y-4 text-base leading-relaxed text-slate-700">
                <p>
                  RO joined My Life Services in 2020 with a clear long-term
                  goal: a place of his own. Before MLS, he didn&apos;t have a
                  stable place to live — making it hard to build the daily
                  routines that turn a space into a home.
                </p>
                <p>
                  Independence takes time. Over the next several years, RO
                  and his MLS team worked on the day-to-day skills that
                  lead to stable housing — cooking, budgeting, household
                  management, and the confidence that comes with making
                  decisions about your own life.
                </p>
                <p>
                  When the right opportunity came through Integrity
                  Cottages — a Project-Based Voucher community — RO was
                  ready. The photo below captures the day he received the
                  keys to his first studio.
                </p>
              </div>
            </div>
          </div>

          <figure className="mt-12">
            <MilestonePhotoPlaceholder />
            <figcaption className="mx-auto mt-3 max-w-3xl text-center text-sm leading-relaxed text-slate-600">
              Move-in day photo coming soon — once RO&apos;s consent is on
              file.
            </figcaption>
          </figure>

          <p className="mx-auto mt-12 max-w-3xl text-base leading-relaxed text-slate-700 sm:text-lg">
            Today, RO lives independently in his studio. MLS staff continue
            to support him with the routines and goals that matter most to
            him.
          </p>
        </div>
      </section>

      {/* RR — PBV voucher */}
      <section id="rr" className="scroll-mt-20 border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <div className="grid gap-10 sm:grid-cols-12 sm:gap-12">
            <div className="sm:col-span-7">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                RR&apos;s own front door
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-700">
                RR moved into his own one-bedroom apartment — paying just
                30% of his income in rent through a Project-Based Voucher.
              </p>
              <div className="mt-6 space-y-4 text-base leading-relaxed text-slate-700">
                <p>
                  RR joined My Life Services in 2022. Before MLS, he
                  didn&apos;t have a place of his own — moving between
                  temporary arrangements made it hard to plan a life on
                  his own terms.
                </p>
                <p>
                  Working with our team, RR set a clear goal: housing on
                  his own terms. That work paid off when he used a
                  Project-Based Voucher to move into a full one-bedroom
                  apartment, where he now pays 30% of his income in rent —
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
              <PortraitPlaceholder initials="RR" />
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                With MLS since 2022
              </p>
            </div>
          </div>

          <figure className="mt-12">
            <VideoPlaceholder />
            <figcaption className="mx-auto mt-3 max-w-3xl text-center text-sm leading-relaxed text-slate-600">
              RR shares his story — video coming soon.
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
                href="tel:+19098370907"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5 py-3 text-base font-medium text-brand transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <PhoneIcon className="h-5 w-5" />
                (909) 837-0907
              </a>
              <Link
                href="/services"
                className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-white px-5 py-3 text-base font-medium text-white transition hover:bg-white hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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

function PortraitPlaceholder({ initials }) {
  return (
    <div className="flex aspect-square w-full items-center justify-center rounded-2xl border-2 border-dashed border-brand-light bg-sky-50">
      <div className="text-center">
        <p className="text-5xl font-semibold tracking-tight text-brand">
          {initials}
        </p>
        <p className="mt-3 text-sm text-slate-600">Portrait coming soon</p>
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
        <p className="mt-2 text-sm text-slate-600">
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
        <p className="mt-2 text-sm text-slate-600">
          Hear the story in RR&apos;s own words.
        </p>
      </div>
    </div>
  );
}
