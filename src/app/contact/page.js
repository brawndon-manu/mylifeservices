import PageHeader from "@/components/PageHeader";
import ContactForm from "./_components/ContactForm";
import {
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon,
  ClockIcon,
} from "@/components/Icons";

export const metadata = {
  title: "Contact",
  description:
    "Contact My Life Services about service inquiries, employment, and partnerships.",
};

const methods = [
  {
    Icon: PhoneIcon,
    label: "Phone",
    value: "(562) 686-2548",
    href: "tel:+15626862548",
  },
  {
    Icon: EnvelopeIcon,
    label: "Email",
    value: "contact@mylifeservicesinc.com",
    href: "mailto:contact@mylifeservicesinc.com",
  },
  {
    Icon: MapPinIcon,
    label: "Office",
    value: "2230 W. Chapman Ave, Suite #161\nOrange, CA 92868",
  },
  {
    Icon: ClockIcon,
    label: "Hours",
    value: "Mon–Fri: 8am – 8pm\nSat–Sun: Closed",
  },
];

// Google Maps Embed API key (referrer-restricted, Embed-API-only - safe to
// expose client-side). Set NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY in .env.local +
// Vercel. Until it's set we fall back to a key-less OpenStreetMap embed so the
// map always renders.
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
const OFFICE_QUERY = "2230 W Chapman Ave Suite 161, Orange, CA 92868";
const OSM_FALLBACK =
  "https://www.openstreetmap.org/export/embed.html?bbox=-117.8826%2C33.7836%2C-117.8706%2C33.7916&layer=mapnik&marker=33.7876067%2C-117.8766186";
const MAP_SRC = MAPS_KEY
  ? `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${encodeURIComponent(
      OFFICE_QUERY,
    )}&zoom=15`
  : OSM_FALLBACK;

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="We're here to help"
        title="Contact us"
        intro="Reach out about service inquiries, employment opportunities, or community partnerships."
      />

      <section className="mx-auto max-w-5xl px-6 pt-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Send us a message
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Fill out the form and we&apos;ll get back to you. Prefer to reach us
            directly? Our details are just below.
          </p>
          <div className="mt-8">
            <ContactForm />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Or reach us directly
        </h2>
        <div className="grid gap-8 lg:grid-cols-2 lg:items-stretch">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:content-start">
          {methods.map(({ Icon, label, value, href }) => {
            const inner = (
              <>
                <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-sky-50 text-brand-dark ring-1 ring-brand-light/20 transition group-hover:bg-brand-light group-hover:text-white">
                  <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {label}
                  </h2>
                  <p className="mt-1 whitespace-pre-line break-words text-base font-medium text-foreground group-hover:text-brand-dark">
                    {value}
                  </p>
                </div>
              </>
            );
            const base =
              "group flex h-full items-start gap-4 rounded-xl border border-border bg-surface p-6 transition";
            return (
              <li key={label}>
                {href ? (
                  <a
                    href={href}
                    className={`${base} hover:-translate-y-0.5 hover:border-brand-light hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
                  >
                    {inner}
                  </a>
                ) : (
                  <div className={base}>{inner}</div>
                )}
              </li>
            );
          })}
          </ul>
          <div className="flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-border shadow-sm">
            <iframe
              title="Map to the My Life Services office in Orange, CA"
              src={MAP_SRC}
              className="block w-full flex-1"
              style={{ minHeight: 280, border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
            <a
              href="https://www.google.com/maps/dir/?api=1&destination=2230+W+Chapman+Ave%2C+Orange%2C+CA+92868"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 border-t border-border bg-surface px-4 py-3 text-sm font-medium text-brand-dark transition hover:text-brand"
            >
              Get directions
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>

      {/* Closing CTA - gradient card on white so it doesn't blend into the
          brand-light footer band right below it. */}
      <section className="bg-surface">
        <div className="mx-auto max-w-5xl px-6 pb-16">
          <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-dark to-brand px-8 py-12 text-center text-white sm:px-12 sm:py-14">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Prefer to talk it through?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
              Not sure where to start? Give us a call or send a note, and we&apos;ll
              help you find the right service, role, or next step.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="tel:+15626862548"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-surface px-6 py-3 text-base font-medium text-brand-dark shadow-sm transition hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <PhoneIcon className="h-5 w-5" />
                (562) 686-2548
              </a>
              <a
                href="mailto:contact@mylifeservicesinc.com"
                className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-white px-6 py-3 text-base font-medium text-white transition hover:bg-surface hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <EnvelopeIcon className="h-5 w-5" />
                Email us
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
