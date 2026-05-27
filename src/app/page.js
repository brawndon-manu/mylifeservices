import Link from "next/link";
import Image from "next/image";
import ServicesOverview from "@/components/ServicesOverview";

const storyPreviews = [
  {
    initials: "RO",
    since: "With MLS since 2020",
    title: "RO's first place",
    teaser:
      "Years of unstable housing, then his own studio — supported by MLS and our partner Integrity Cottages.",
    href: "/stories#ro",
  },
  {
    initials: "RR",
    since: "With MLS since 2022",
    title: "RR's own front door",
    teaser:
      "Now in his own one-bedroom apartment, paying just 30% of his income through a Project-Based Voucher.",
    href: "/stories#rr",
  },
];

const values = [
  {
    title: "Person-Centered",
    body: "Every plan starts with the participant — their goals, their pace, their priorities. We adapt to the person, not the other way around.",
  },
  {
    title: "Community-Based",
    body: "Skills are built in real places: the kitchen, the bus, the grocery store, the neighborhood. Support meets life where it actually happens.",
  },
  {
    title: "Goal-Driven",
    body: "Progress is measured by outcomes that matter to the participant — more independence, more confidence, more of the life they want.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <div className="grid items-center gap-12 sm:grid-cols-12 sm:gap-16">
            <div className="sm:col-span-7">
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-light">
                My Life. My Way.
              </p>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Providing individualized support to adults with intellectual and developmental disabilities.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-700">
                My Life Services partners with individuals, families, and Regional Center
                consumers to deliver respectful, person-centered programs that support
                independence and well-being.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/services"
                  className="inline-flex items-center justify-center rounded-md bg-brand-light px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  View our services
                </Link>
                <a
                  href="tel:+19098370907"
                  className="inline-flex items-center justify-center rounded-md border-2 border-brand-light px-6 py-3 text-base font-medium text-brand-dark transition hover:bg-brand hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  Call (909) 837-0907
                </a>
              </div>
            </div>
            <div className="sm:col-span-5">
              <Image
                src="/logo/MLSlogo.png"
                alt="My Life Services logo"
                width={777}
                height={733}
                priority
                className="mx-auto h-auto w-full max-w-xs rounded-2xl shadow-lg sm:max-w-sm"
              />
            </div>
          </div>
        </div>
      </section>
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-light">
              How we work
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Built around the person, not the program
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-700 sm:text-lg">
              Every participant comes to us with their own goals, routines, and
              vision for their life. Our job is to build supports that fit —
              not the other way around.
            </p>
          </div>
          <ul className="mt-12 grid gap-6 sm:grid-cols-3">
            {values.map(({ title, body }) => (
              <li
                key={title}
                className="rounded-xl border border-slate-200 bg-slate-50 p-6"
              >
                <h3 className="text-lg font-semibold tracking-tight text-slate-900">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">
                  {body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <ServicesOverview />
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <header className="mb-12 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-light">
              Real stories
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              What independence looks like
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-700 sm:text-lg">
              Every participant&apos;s path is their own. Here are a few of
              the stories behind the work.
            </p>
          </header>
          <ul className="grid gap-6 sm:grid-cols-3">
            {storyPreviews.map(({ initials, title, teaser, since, href }) => (
              <li key={initials}>
                <Link
                  href={href}
                  className="group flex h-full flex-col rounded-xl border border-slate-200 bg-slate-50 p-6 transition hover:-translate-y-0.5 hover:border-brand-light hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <div className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-brand-light bg-sky-50">
                    <p className="text-3xl font-semibold tracking-tight text-brand">
                      {initials}
                    </p>
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {since}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-900">
                    {title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-700">
                    {teaser}
                  </p>
                  <p className="mt-5 text-sm font-medium text-brand-light group-hover:text-brand">
                    Read the story{" "}
                    <span
                      aria-hidden="true"
                      className="inline-block transition-transform group-hover:translate-x-0.5"
                    >
                      →
                    </span>
                  </p>
                </Link>
              </li>
            ))}
            <li>
              <div className="flex h-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand-light bg-sky-50 p-6 text-center">
                <p className="text-lg font-semibold tracking-tight text-brand">
                  This space reserved for someone&apos;s story.
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  More coming as our community shares.
                </p>
              </div>
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
