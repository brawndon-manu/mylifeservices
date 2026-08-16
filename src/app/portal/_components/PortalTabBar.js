"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// the four destinations in thumb reach, phones and tablets only.
//
// THE FOURTH ONE DEPENDS ON WHO IS LOOKING. Admin is not a link a caregiver has,
// so a fixed set of four would leave them with three tabs and a hole. They get
// the Hub in that slot instead, which is the thing they actually open. Whichever
// one is not down here is still in the menu, so nothing is only reachable from
// the bar.
//
// Below lg and not below sm, because the desktop header needs about 810px to
// lay out and would still overflow a 768px tablet. See the note in layout.js.
const ICONS = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  announcements: "M3 11l18-6v14l-18-6zM3 11v5a2 2 0 0 0 2 2h2",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.1a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.6a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9 2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.3 1.3z",
  admin: "M12 3l8 4v5c0 4.4-3.4 8.4-8 9-4.6-.6-8-4.6-8-9V7z",
  hub: "M4 5h16M4 12h16M4 19h10",
};

export default function PortalTabBar({ elevated }) {
  const pathname = usePathname() || "";

  const tabs = [
    { href: "/portal", label: "Dashboard", icon: "dashboard", exact: true },
    { href: "/portal/announcements", label: "Announcements", icon: "announcements" },
    { href: "/portal/settings", label: "Settings", icon: "settings" },
    elevated
      ? { href: "/portal/admin", label: "Admin", icon: "admin" }
      : { href: "/portal/hub", label: "Hub", icon: "hub" },
  ];

  return (
    <nav
      aria-label="Portal sections"
      // the hook globals.css uses to lift the root layout's corner control
      // clear of this bar. see the note there.
      data-portal-tabbar=""
      // print:hidden for the same reason every other floating control has it -
      // a tab bar across the foot of a printed timesheet helps nobody
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] print:hidden lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {tabs.map((t) => {
          const on = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                // 56px, so the whole tab is the target rather than the label
                className={`flex h-14 flex-col items-center justify-center gap-1 rounded text-[10.5px] font-medium leading-none transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
                  on ? "text-brand" : "text-muted"
                }`}
              >
                <svg
                  width="21"
                  height="21"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={ICONS[t.icon]} />
                </svg>
                <span className="max-w-full truncate px-1">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
