import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { services } from "@/lib/services";

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const service = services.find((s) => s.slug === slug);
  if (!service) return {};
  return {
    title: service.name,
    description: service.description,
  };
}

function categorySlug(name) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function ServiceDetailPage({ params }) {
  const { slug } = await params;
  const service = services.find((s) => s.slug === slug);
  if (!service) notFound();

  return (
    <>
      <PageHeader
        backHref="/services"
        backLabel="All services"
        title={service.name}
        intro={service.intro || service.description}
      />

      {service.categories ? (
        <ServiceCategories
          categories={service.categories}
          layout={service.categoryLayout}
          intro={service.categoriesIntro}
        />
      ) : (
        <ComingSoon />
      )}

      {service.cta && <ServiceCta cta={service.cta} />}
    </>
  );
}

function ServiceCategories({ categories, layout = "checklist", intro }) {
  const isNarrative = layout === "narrative";
  return (
    <>
      <nav
        aria-label="Sections on this page"
        className="hidden border-b border-slate-200 bg-white/95 backdrop-blur lg:sticky lg:top-16 lg:z-30 lg:block"
      >
        <div className="mx-auto max-w-5xl px-6 py-3">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
            {categories.map((cat) => (
              <li key={cat.name}>
                <a
                  href={`#${categorySlug(cat.name)}`}
                  className="rounded transition hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {cat.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {intro && (
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-10 sm:py-12">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {intro.title}
            </h2>
            {intro.body && (
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-700 sm:text-lg">
                {intro.body}
              </p>
            )}
          </div>
        </section>
      )}

      <div>
        {categories.map((category, i) => (
          <section
            key={category.name}
            id={categorySlug(category.name)}
            className={`scroll-mt-32 ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
          >
            <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
              <h3 className="border-l-2 border-brand pl-3 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                {category.name}
              </h3>
              <ul
                className={
                  isNarrative
                    ? "mt-6 max-w-3xl space-y-5"
                    : "mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2"
                }
              >
                {category.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-base leading-relaxed text-slate-700"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2.5 h-1.5 w-1.5 flex-none rounded-full bg-brand"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function ServiceCta({ cta }) {
  return (
    <section className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {cta.title}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
          {cta.body}
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href={cta.buttonHref}
            className="inline-flex items-center justify-center rounded-md bg-brand px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {cta.buttonLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

function ComingSoon() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-base leading-relaxed text-slate-700">
        Detailed information about this service is being added. In the meantime,
        please{" "}
        <a
          href="tel:+19098370907"
          className="font-medium text-brand-dark underline underline-offset-2 hover:text-brand"
        >
          call us
        </a>{" "}
        or{" "}
        <a
          href="mailto:support@mylifeservices.net"
          className="font-medium text-brand-dark underline underline-offset-2 hover:text-brand"
        >
          email us
        </a>{" "}
        with any questions.
      </p>
    </section>
  );
}
