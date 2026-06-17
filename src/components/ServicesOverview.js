import Link from "next/link";
import { services } from "@/lib/services";

export default function ServicesOverview() {
  return (
    <section className="border-t border-border bg-surface-2">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <header className="mb-12 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
            What we do
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Five program areas, designed around the people we serve
          </h2>
        </header>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <li key={service.slug}>
              <Link
                href={`/services/${service.slug}`}
                className="group flex h-full flex-col rounded-lg border border-border bg-surface p-6 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  {service.name}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
                  {service.short}
                </p>
                <p className="mt-5 text-sm font-medium text-brand-light group-hover:text-brand">
                  Learn more{" "}
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
        </ul>
        <p className="mt-10 text-sm text-muted">
          <Link
            href="/services"
            className="font-medium text-foreground underline underline-offset-4 hover:text-brand-dark"
          >
            See all services
          </Link>
        </p>
      </div>
    </section>
  );
}
