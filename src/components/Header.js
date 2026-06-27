import Link from "next/link";
import Image from "next/image";
import { PhoneIcon } from "@/components/Icons";
import NavDropdown from "@/components/NavDropdown";
import AuthBadge from "@/components/AuthBadge";

// "About" is a dropdown that groups the company-story pages so the top
// nav stays lean. the rest are plain top-level links. Employee portal
// is an outline button next to the phone (the inverse style) so staff
// can find it easily without it crowding the main nav.
const aboutLinks = [
  { href: "/about", label: "About us" },
  { href: "/stories", label: "Stories" },
  { href: "/this-week", label: "This Week" },
];

// plain top-level links. "Apply" is a direct link for now - if we add
// more quick actions later, group them back into a "Quicklinks" dropdown.
const navLinks = [
  { href: "/services", label: "Services" },
  { href: "/careers", label: "Careers" },
  { href: "/contact", label: "Contact" },
  { href: "/careers/apply", label: "Apply" },
];

const PHONE_DISPLAY = "(562) 686-2548";
const PHONE_HREF = "tel:+15626862548";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-start justify-between gap-x-6 px-6 py-3">
        {/* left column: logo on its own line, brochure nav under it */}
        <div className="flex flex-col gap-2">
          <Link
            href="/"
            className="flex items-center gap-3 rounded text-foreground transition hover:text-brand-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
          <nav aria-label="Primary">
            <ul className="flex items-center gap-6 text-sm font-medium text-muted">
              {/* About dropdown - closes on outside click / nav / Escape */}
              <li>
                <NavDropdown label="About" align="left">
                  {aboutLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      role="menuitem"
                      className="block rounded px-3 py-2 text-sm transition hover:bg-surface-2 hover:text-brand-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      {link.label}
                    </Link>
                  ))}
                </NavDropdown>
              </li>
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded px-1 py-1 transition hover:text-brand-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        {/* right column: signed-in badge on top, Employee portal + phone
            under it, all aligned to the right edge */}
        <div className="flex flex-none flex-col items-end gap-2">
          {/* reserve the logo's height so the buttons below line up with the
              brochure nav row (and stay put even when signed out / no badge) */}
          <div className="flex h-10 items-center">
            <AuthBadge />
          </div>
          <div className="flex items-center gap-2.5">
          {/* Employee portal - outline button, the inverse of the phone
              button so staff can spot it without it crowding the nav. */}
          <Link
            href="/portal"
            className="inline-flex items-center gap-2 rounded-md border border-brand-light px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-brand-light hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <LockIcon className="h-3.5 w-3.5 flex-none" />
            <span>Employee portal</span>
          </Link>
          <a
            href={PHONE_HREF}
            aria-label={`Call My Life Services at ${PHONE_DISPLAY}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-light px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <PhoneIcon className="h-3.5 w-3.5" />
            <span>{PHONE_DISPLAY}</span>
          </a>
          </div>
        </div>
      </div>
    </header>
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
