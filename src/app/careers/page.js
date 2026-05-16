import PageHeader from "@/components/PageHeader";

export const metadata = {
  title: "Careers",
  description:
    "Join My Life Services. Learn about our team, the roles we hire for, and apply online.",
};

export default function CareersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Join our team"
        title="Careers at My Life Services"
        intro="We hire compassionate, dependable people to support adults with intellectual and developmental disabilities across five program areas."
      />
      <section className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-base leading-relaxed text-slate-700">
          Our online application is coming soon. In the meantime, please{" "}
          <a
            href="mailto:support@mylifeservices.net"
            className="font-medium text-brand-dark underline underline-offset-2 hover:text-brand"
          >
            email us
          </a>{" "}
          to inquire about open positions.
        </p>
      </section>
    </>
  );
}
