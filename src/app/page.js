import Link from "next/link";

export default function HomePage() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <p className="text-sm font-semibold uppercase tracking-wider text-slate-600">
        My Life. My Way.
      </p>
      <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
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
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-3 text-base font-medium text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          View our services
        </Link>
        <a
          href="tel:+19098370907"
          className="inline-flex items-center justify-center rounded-md border border-slate-900 px-5 py-3 text-base font-medium text-slate-900 hover:bg-slate-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Call (909) 837-0907
        </a>
      </div>
    </section>
  );
}
