import Link from "next/link";

const navLinks = [
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/contact", label: "Contact" },
  { href: "/careers", label: "Careers" },
];

const PHONE_DISPLAY = "(909) 837-0907";
const PHONE_HREF = "tel:+19098370907";

export default function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-slate-900 hover:text-slate-700"
        >
          My Life Services
        </Link>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <nav aria-label="Primary">
            <ul className="flex items-center gap-6 text-sm font-medium text-slate-700">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded px-1 py-1 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <a
            href={PHONE_HREF}
            aria-label={`Call My Life Services at ${PHONE_DISPLAY}`}
            className="inline-flex items-center rounded-md border border-slate-900 px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {PHONE_DISPLAY}
          </a>
        </div>
      </div>
    </header>
  );
}
