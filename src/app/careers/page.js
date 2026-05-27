import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { ArrowRightIcon } from "@/components/Icons";
import { services } from "@/lib/services";

export const metadata = {
  title: "Careers",
  description:
    "Join My Life Services. Learn about our team and the program areas we hire for.",
};

export default function CareersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Empowering Community Support"
        title="Interested in working for My Life Services?"
        intro="My Life Services employs staff across a range of community-based support roles. Positions support adults with intellectual and developmental disabilities in coordination with the Regional Center of Orange County."
        image={{
          src: "/logo/MLSlogo.png",
          alt: "My Life Services logo",
          width: 777,
          height: 733,
        }}
      />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Working at My Life Services
          </h2>
          <p className="mt-5 text-base leading-relaxed text-slate-700 sm:text-lg">
            Working at My Life Services involves providing direct support to
            adults with intellectual and developmental disabilities in community
            settings. Staff work one-on-one or in small groups to support daily
            living, skill development, and participation in the community.
            Services are delivered in accordance with individual plans and
            agency guidelines.
          </p>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <header className="mb-10 max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Explore roles by program
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-700 sm:text-lg">
              Different programs require different levels of support and daily
              responsibilities. Explore each program below to learn what working
              in that setting typically involves.
            </p>
          </header>
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {services.map((service) => (
              <li
                key={service.slug}
                className="grid gap-5 py-8 sm:grid-cols-12 sm:items-center sm:gap-8"
              >
                <div className="sm:col-span-7">
                  <h3 className="text-xl font-semibold tracking-tight text-slate-900">
                    {service.name}
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-slate-700">
                    {service.roleDescription}
                  </p>
                </div>
                <div className="sm:col-span-5 sm:flex sm:justify-end">
                  <Link
                    href={`/careers/${service.slug}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-light px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-72"
                  >
                    Apply for {service.name.split(" (")[0]}
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
