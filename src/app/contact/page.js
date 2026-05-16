import PageHeader from "@/components/PageHeader";
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
    value: "(909) 837-0907",
    href: "tel:+19098370907",
  },
  {
    Icon: EnvelopeIcon,
    label: "Email",
    value: "support@mylifeservices.net",
    href: "mailto:support@mylifeservices.net",
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

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="We're here to help"
        title="Contact us"
        intro="Reach out about service inquiries, employment opportunities, or community partnerships."
      />
      <section className="mx-auto max-w-3xl px-6 py-16">
        <ul className="grid gap-4 sm:grid-cols-2">
          {methods.map(({ Icon, label, value, href }) => (
            <li
              key={label}
              className="flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-6"
            >
              <Icon className="mt-1 h-6 w-6 flex-none text-brand-dark" />
              <div className="min-w-0">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {label}
                </h2>
                {href ? (
                  <a
                    href={href}
                    className="mt-1 block break-words text-base font-medium text-slate-900 hover:text-brand-dark"
                  >
                    {value}
                  </a>
                ) : (
                  <p className="mt-1 whitespace-pre-line text-base text-slate-900">
                    {value}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
