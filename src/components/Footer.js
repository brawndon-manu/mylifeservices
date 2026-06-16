import {
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon,
  ClockIcon,
} from "@/components/Icons";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer>
      <div className="bg-brand-light text-white">
        <div className="mx-auto grid max-w-5xl gap-10 px-6 py-14 sm:py-16 md:grid-cols-2 md:gap-16">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              Get in touch
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-white/90">
              Call, email, or visit. We&apos;re here to answer questions about
              services, careers, or partnerships.
            </p>
          </div>
          <dl className="grid gap-5 text-sm sm:text-base">
            <div className="flex items-start gap-4">
              <PhoneIcon className="mt-0.5 h-5 w-5 flex-none text-white/80" />
              <div>
                <dt className="sr-only">Phone</dt>
                <dd>
                  <a
                    href="tel:+15626862548"
                    className="underline-offset-2 hover:underline"
                  >
                    (562) 686-2548
                  </a>
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <EnvelopeIcon className="mt-0.5 h-5 w-5 flex-none text-white/80" />
              <div>
                <dt className="sr-only">Email</dt>
                <dd>
                  <a
                    href="mailto:contact@mylifeservicesinc.com"
                    className="underline-offset-2 hover:underline"
                  >
                    contact@mylifeservicesinc.com
                  </a>
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <MapPinIcon className="mt-0.5 h-5 w-5 flex-none text-white/80" />
              <div>
                <dt className="sr-only">Address</dt>
                <dd className="leading-relaxed">
                  2230 W. Chapman Ave, Suite&nbsp;#161
                  <br />
                  Orange, CA 92868
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <ClockIcon className="mt-0.5 h-5 w-5 flex-none text-white/80" />
              <div>
                <dt className="sr-only">Hours</dt>
                <dd className="leading-relaxed">
                  Mon&ndash;Fri: 8am &ndash; 8pm
                  <br />
                  Sat&ndash;Sun: Closed
                </dd>
              </div>
            </div>
          </dl>
        </div>
      </div>
      <div className="border-t border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-5 text-sm text-muted">
          &copy; {year} My Life Services. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
