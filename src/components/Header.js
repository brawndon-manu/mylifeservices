import Link from "next/link";
import Image from "next/image";
import { PhoneIcon } from "@/components/Icons";

const navLinks = [
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/stories", label: "Stories" },
  { href: "/contact", label: "Contact" },
  { href: "/careers", label: "Careers" },
  { href: "/portal", label: "Employee portal" },
];

const PHONE_DISPLAY = "(909) 837-0907";
const PHONE_HREF = "tel:+19098370907";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-3">
        <Link
          href="/"
          className="flex items-center gap-3 rounded text-slate-900 transition hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Image
            src="/logo/treelogov2.png"
            alt=""
            width={2428}
            height={1820}
            priority
            className="h-10 w-auto rounded-md"
          />
          <span className="text-lg font-semibold tracking-tight">
            My Life Services
          </span>
        </Link>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <nav aria-label="Primary">
            <ul className="flex items-center gap-6 text-sm font-medium text-slate-700">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded px-1 py-1 transition hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
            className="inline-flex items-center gap-2 rounded-md bg-brand-light px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <PhoneIcon className="h-4 w-4" />
            <span>{PHONE_DISPLAY}</span>
          </a>
        </div>
      </div>
    </header>
  );
}
