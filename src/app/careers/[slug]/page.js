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
  const baseName = service.name.split(" (")[0];
  const roleTitle = service.role?.title || `${baseName} roles`;
  return {
    title: `${roleTitle} — Careers`,
    description:
      service.role?.intro ||
      `Apply for roles in ${baseName} at My Life Services.`,
  };
}

export default async function CareerRolePage({ params }) {
  const { slug } = await params;
  const service = services.find((s) => s.slug === slug);
  if (!service) notFound();

  const role = service.role;
  const baseName = service.name.split(" (")[0];

  return (
    <>
      <PageHeader
        backHref="/careers"
        backLabel="All careers"
        title={role?.title || `${baseName} roles`}
        intro={
          role?.intro ||
          `Detailed information about ${baseName} roles is being added. You can still reach out below to express interest.`
        }
      />

      {role ? (
        <RoleDetails role={role} />
      ) : (
        <RolePlaceholder baseName={baseName} />
      )}

      <ApplyCta baseName={baseName} slug={slug} />
    </>
  );
}

function RoleDetails({ role }) {
  return (
    <>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            What you’ll do in this role
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-700 sm:text-lg">
            {role.whatYoullDo}
          </p>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Key responsibilities
          </h2>
          <ul className="mt-6 space-y-3">
            {role.responsibilities.map((item) => (
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

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            What this looks like day-to-day
          </h2>
          <ul className="mt-6 space-y-3">
            {role.dayToDay.map((item) => (
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

      {role.whyWork && (
        <section className="border-b border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {role.whyWork.heading}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-700 sm:text-lg">
              {role.whyWork.body}
            </p>
          </div>
        </section>
      )}
    </>
  );
}

function RolePlaceholder({ baseName }) {
  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <p className="text-base leading-relaxed text-slate-700 sm:text-lg">
          A full role description for {baseName} is being added. In the
          meantime, you can still apply below or reach out to our team with any
          questions.
        </p>
      </div>
    </section>
  );
}

function ApplyCta({ baseName, slug }) {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Ready to apply?
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-lg">
          Submit our online application — {baseName} will be pre-selected on the
          form so you can focus on the rest of the details.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href={`/careers/apply?program=${slug}`}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-light px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Apply for {baseName}
          </Link>
        </div>
      </div>
    </section>
  );
}
