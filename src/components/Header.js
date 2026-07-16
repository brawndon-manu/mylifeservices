"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { PhoneIcon } from "@/components/Icons";
import NavDropdown from "@/components/NavDropdown";

// floating "pill" header. on the homepage it starts translucent, sitting on top
// of the dark gradient hero, then swaps to the solid surface pill once you
// scroll past the hero (a see-through pill over white body copy is unreadable).
// every other page just gets the solid pill.
//
// the pill is a FIXED-height single row on every breakpoint - the homepage
// pulls the hero up underneath it by exactly that height, so if the pill ever
// wrapped it would spill onto the white page above the hero. below md the nav
// links collapse into a menu button instead of wrapping.
const aboutLinks = [
  {
    href: "/about",
    label: "About us",
    description: "Who we are and how we work",
    Icon: AboutIcon,
  },
  {
    href: "/stories",
    label: "Stories",
    description: "Real journeys toward independence",
    Icon: StoriesIcon,
  },
  {
    href: "/this-week",
    label: "This Week",
    description: "The latest from our community",
    Icon: WeekIcon,
  },
];

// the About dropdown is a bold logo-gradient panel. deeper than the page's other
// gradient panels so the white text + translucent chips stay high-contrast.
const MENU_GRADIENT =
  "linear-gradient(150deg,#0a3049 0%,#1c7ba6 60%,#2299c9 100%)";

const navLinks = [
  { href: "/services", label: "Services" },
  { href: "/careers", label: "Careers" },
  { href: "/contact", label: "Contact" },
  { href: "/careers/apply", label: "Apply" },
];

const PHONE_DISPLAY = "(562) 686-2548";
const PHONE_HREF = "tel:+15626862548";

// pt-3 (12px) + h-14 (56px). the homepage pulls the hero up by this much.
const HEADER_PULL = "-mb-[68px]";

export default function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // are they signed in? drives the Employee portal padlock: open when signed in,
  // closed when not. fetched client-side (like the old badge was) but it's only
  // an icon swap - same size - so it never shifts the layout.
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) setSignedIn(!!d?.user);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setScrolled(window.scrollY > 90);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  // close the mobile menu on navigation + Escape
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // translucent only while we're still over the hero and the menu is closed
  const overlay = isHome && !scrolled && !menuOpen;

  const pill = overlay
    ? "border-white/20 bg-white/10 text-white"
    : "border-border bg-surface/90 text-foreground shadow-sm";
  const link = overlay
    ? "text-white/80 hover:text-white"
    : "text-muted hover:text-brand-light";
  // the overlay variant sits on the always-dark hero, so it uses fixed colors -
  // brand-dark is a theme token and flips light in Dim/Night, killing contrast.
  const portalBtn = overlay
    ? "border-white/45 text-white hover:bg-white hover:text-[#14608a]"
    : "border-brand-light text-foreground hover:bg-brand-light hover:text-white";
  const phoneBtn = overlay
    ? "bg-white text-[#14608a] hover:bg-white/90"
    : "bg-brand-light text-white hover:bg-brand";

  const PortalIcon = signedIn ? UnlockIcon : LockIcon;
  const portalAria = signedIn ? "Employee portal (you're signed in)" : "Employee portal";

  return (
    <header className={`sticky top-0 z-40 pt-3 ${isHome ? HEADER_PULL : "mb-2"}`}>
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
        <div
          className={`flex h-14 items-center gap-4 rounded-full border pl-4 pr-4 backdrop-blur-md transition-colors duration-300 sm:gap-5 sm:pl-5 sm:pr-6 ${pill}`}
        >
          <Link
            href="/"
            className="flex flex-none items-center gap-2.5 rounded font-semibold tracking-tight transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Image
              src="/logo/treelogov2.png"
              alt=""
              width={2428}
              height={1820}
              priority
              className="h-8 w-auto rounded-md"
            />
            <span className="hidden sm:inline">My Life Services</span>
          </Link>

          <nav aria-label="Primary" className="hidden md:block">
            <ul className={`flex items-center gap-5 text-sm font-medium ${link}`}>
              <li>
                <NavDropdown
                  label="About"
                  align="left"
                  panelClassName="w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl shadow-xl"
                >
                  <div
                    className="relative p-2"
                    style={{ background: MENU_GRADIENT }}
                  >
                    {aboutLinks.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        role="menuitem"
                        className="relative flex items-center gap-3 rounded-xl p-3 transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      >
                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white">
                          <l.Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-white">
                            {l.label}
                          </span>
                          <span className="block text-xs text-white/75">
                            {l.description}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </NavDropdown>
              </li>
              {navLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="rounded px-1 py-1 transition hover:text-brand-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex flex-none items-center gap-2">
            <Link
              href="/portal"
              aria-label={portalAria}
              title={signedIn ? "You're signed in" : undefined}
              className={`hidden items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:inline-flex ${portalBtn}`}
            >
              <PortalIcon className="h-3.5 w-3.5 flex-none" />
              <span>Employee portal</span>
            </Link>
            <a
              href={PHONE_HREF}
              aria-label={`Call My Life Services at ${PHONE_DISPLAY}`}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${phoneBtn}`}
            >
              <PhoneIcon className="h-3.5 w-3.5" />
              <span>{PHONE_DISPLAY}</span>
            </a>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-label="Menu"
              className={`inline-flex h-9 w-9 flex-none items-center justify-center rounded-full border transition md:hidden ${
                overlay ? "border-white/40 text-white" : "border-border text-foreground"
              }`}
            >
              <MenuIcon open={menuOpen} className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* mobile menu - always a solid panel so it stays readable over the hero */}
        {menuOpen && (
          <div className="absolute inset-x-4 top-full z-50 mt-2 rounded-2xl border border-border bg-surface p-2 shadow-lg sm:inset-x-6 md:hidden">
            {[...aboutLinks, ...navLinks].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2 hover:text-brand-light"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/portal"
              aria-label={portalAria}
              className="mt-1 flex items-center gap-2 rounded-lg border border-brand-light px-3 py-2.5 text-sm font-semibold text-foreground transition hover:bg-brand-light hover:text-white"
            >
              <PortalIcon className="h-3.5 w-3.5 flex-none" />
              Employee portal
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

function MenuIcon({ open, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {open ? (
        <path d="M5 5l10 10M15 5L5 15" />
      ) : (
        <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
      )}
    </svg>
  );
}

// about mega-menu chips
function AboutIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="9" r="2.6" />
      <circle cx="17" cy="10" r="2.2" />
      <path d="M4 19a5 5 0 0 1 10 0M14.5 19a4 4 0 0 1 6 0" />
    </svg>
  );
}

function StoriesIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </svg>
  );
}

function WeekIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
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

// open padlock - shown on the Employee portal button when you're signed in. same
// box as LockIcon so swapping it in never shifts anything; the shackle just lifts
// off on the right instead of latching down.
function UnlockIcon({ className }) {
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
      <path d="M7 9V6a3 3 0 0 1 5.8-1.1" />
    </svg>
  );
}
