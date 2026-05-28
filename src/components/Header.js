import Link from "next/link";
import Image from "next/image";
import { PhoneIcon } from "@/components/Icons";

// "About" is a dropdown that groups the company-story pages so the top
// nav stays lean. the rest are plain top-level links. Employee portal
// lives in the footer now (staff-only, doesnt belong in the public nav).
const aboutLinks = [
  { href: "/about", label: "About us" },
  { href: "/stories", label: "Stories" },
  { href: "/this-week", label: "This Week" },
];

const navLinks = [
  { href: "/services", label: "Services" },
  { href: "/careers", label: "Careers" },
  { href: "/contact", label: "Contact" },
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
              {/* About dropdown - native <details> so it works on
                  click/tap/keyboard with no JS. */}
              <li className="relative">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-1 rounded px-1 py-1 transition hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
                    About
                    <ChevronDownIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="absolute left-0 top-full z-50 mt-2 w-44 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                    {aboutLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="block rounded px-3 py-2 text-sm transition hover:bg-slate-50 hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </details>
              </li>
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
          <div className="flex items-center gap-4">
            {/* Quicklinks - small utility dropdown that tucks the staff
                portal (+ other quick actions) away from the main nav.
                native <details> so it works with no JS. */}
            <div className="relative">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1 rounded px-1 py-1 text-sm font-medium text-slate-500 transition hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
                  Quicklinks
                  <ChevronDownIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                  <Link
                    href="/portal"
                    className="flex items-center gap-2 rounded px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <LockIcon className="h-3.5 w-3.5 flex-none text-slate-400" />
                    <span>Employee portal</span>
                  </Link>
                  <Link
                    href="/careers/apply"
                    className="flex items-center gap-2 rounded px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <span>Apply for a job</span>
                  </Link>
                </div>
              </details>
            </div>
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
      </div>
    </header>
  );
}

function ChevronDownIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8l4 4 4-4" />
    </svg>
  );
}

function LockIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="9" width="12" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}
