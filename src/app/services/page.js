import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { services } from "@/lib/services";

export const metadata = {
  title: "Services",
  description:
    "Independent Living, Day Program, Supported Living, Self-Determination, and Crisis Support — services from My Life Services.",
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        eyebrow="What we do"
        title="Services"
        intro="Person-centered programs for adults with intellectual and developmental disabilities."
      />

      <nav
        aria-label="Service sections"
        className="border-b border-slate-200 bg-white"
      >
        <div className="mx-auto max-w-5xl px-6 py-8 sm:py-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-600">
            On this page
          </p>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {services.map((service, i) => (
              <li key={service.slug}>
                <a
                  href={`#${service.slug}`}
                  className="group flex h-full items-baseline gap-2 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm transition hover:border-brand hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span className="font-mono text-sm text-brand-dark">
                    {i + 1}
                  </span>
                  <span className="font-medium text-slate-900 group-hover:text-brand-dark">
                    {service.name}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      <div>
        {services.map((service, i) => (
          <section
            key={service.slug}
            id={service.slug}
            className={`scroll-mt-28 ${i % 2 === 1 ? "bg-slate-50" : "bg-white"}`}
          >
            <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
              <div className="grid gap-8 sm:grid-cols-12 sm:gap-12">
                <div className="sm:col-span-5">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                    {service.name}
                  </h2>
                </div>
                <div className="sm:col-span-7">
                  <p className="text-base leading-relaxed text-slate-700 sm:text-lg">
                    {service.description}
                  </p>
                  <p className="mt-6">
                    <Link
                      href={`/services/${service.slug}`}
                      className="inline-flex items-center gap-1.5 text-base font-medium text-brand-dark hover:text-brand"
                    >
                      Read more about {service.name}
                      <span aria-hidden="true">→</span>
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
