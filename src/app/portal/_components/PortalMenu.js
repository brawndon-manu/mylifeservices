"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// the menu button and the sheet it opens, phones and tablets only.
//
// Everything the desktop header shows is in here: all six sections, the account
// it is signed in as, sign out, and the way back to the public site. The four in
// the tab bar are repeated rather than removed, because a menu that is missing
// the thing you just tapped reads as a bug.
//
// Escape to close and close on navigation, both copied from the public
// Header - the two halves of the site should behave the same way.
export default function PortalMenu({ elevated, email, roleLabel, roleBadgeClass, signOut }) {
  const pathname = usePathname();
  // WHICH PAGE IT WAS OPENED ON, rather than a bare true/false. Navigating
  // changes the pathname, which closes the menu on its own - so "close on
  // navigate" is a consequence of the state rather than an effect chasing it.
  // The obvious version, an effect setting false on every pathname change, is
  // what `react-hooks/set-state-in-effect` refuses, and it is right to: the
  // menu would open, render, then close on the render after.
  const [openOn, setOpenOn] = useState(null);
  const open = openOn !== null && openOn === pathname;
  // NO setOpen WRAPPER, deliberately. There was one taking a boolean, and the
  // button called it the way you call a useState setter - `setOpen(v => !v)`.
  // A function is truthy, so every press read as "open" and the X reopened the
  // menu it had just shut. The state is a pathname, not a flag, so it is set
  // with a pathname at each call site and there is nothing left to misuse.
  const close = () => setOpenOn(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const links = [
    ["/portal", "Dashboard", true],
    ["/portal/announcements", "Announcements"],
    ["/portal/hub", "Hub"],
    ["/portal/newsletter", "Newsletter"],
    ["/portal/contacts", "Contacts"],
    ["/portal/settings", "Settings"],
    ...(elevated ? [["/portal/admin", "Admin"]] : []),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenOn(open ? null : pathname)}
        aria-expanded={open}
        aria-controls="portal-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-strong text-foreground transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open && (
        <div id="portal-menu" className="absolute inset-x-0 top-full z-40 border-b border-border bg-surface shadow-xl">
          <ul>
            {links.map(([href, label, exact]) => {
              const on = exact ? pathname === href : pathname?.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={on ? "page" : undefined}
                    className={`flex h-12 items-center justify-between border-b border-border px-6 text-[15px] font-medium transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
                      on ? "bg-surface-2 text-brand" : "text-foreground hover:bg-surface-2"
                    }`}
                  >
                    {label}
                    <span aria-hidden="true" className="text-faint">›</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="px-6 pb-1 pt-4 text-[13px] text-muted">
            {email}
            {roleLabel && (
              <span className={`ml-1.5 rounded px-2 py-0.5 text-xs font-medium ${roleBadgeClass}`}>
                {roleLabel}
              </span>
            )}
          </p>

          <div className="flex gap-2.5 px-6 pb-5 pt-3">
            <Link
              href="/"
              className="flex h-11 flex-1 items-center justify-center rounded-lg border border-border-strong text-sm font-semibold text-muted transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span aria-hidden="true" className="mr-1">←</span> Back to website
            </Link>
            <form action={signOut} className="flex-1">
              <button
                type="submit"
                className="h-11 w-full rounded-lg border border-border-strong text-sm font-semibold text-muted transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
