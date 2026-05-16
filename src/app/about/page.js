import PageHeader from "@/components/PageHeader";

export const metadata = {
  title: "About",
  description:
    "Learn about My Life Services — our history, growth, person-centered approach, team, and partnerships.",
};

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="Get to know us"
        title="About My Life Services"
        intro="Our story, our approach, and the people behind the programs."
      />
      <section className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-base leading-relaxed text-slate-700">
          We&apos;re putting the finishing touches on this page. In the meantime, please
          {" "}
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
            send us an email
          </a>{" "}
          with any questions about My Life Services.
        </p>
      </section>
    </>
  );
}
