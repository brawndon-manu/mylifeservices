import Link from "next/link";
import ServicesOverview from "@/components/ServicesOverview";

export default function HomePage() {
  return (
    <>
      <section className="bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
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
              className="inline-flex items-center justify-center rounded-md bg-brand px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              View our services
            </Link>
            <a
              href="tel:+19098370907"
              className="inline-flex items-center justify-center rounded-md border-2 border-brand px-6 py-3 text-base font-medium text-brand-dark transition hover:bg-brand hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Call (909) 837-0907
            </a>
          </div>
        </div>
      </section>
      <ServicesOverview />
    </>
  );
}
