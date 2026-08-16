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
// KEPT TO THE SAME WEIGHT AS EACH OTHER. These sit 21px apart on one bar, so
// what matters is not whether each is a good drawing but whether they look like
// a set. A cog is the usual Settings icon and it was the wrong one here: at
// this size its teeth and inner circle are a 410-character path drawn across
// 22x20 units, beside neighbours of 23 to 50 characters in 16x18, and it read
// as a dense blob with three line drawings next to it.
//
// A PERSON INSTEAD, which is also more honest about the screen: that page is
// headed "Your account" and holds your name, photo and phone, not application
// settings. Two short strokes, same weight as the rest.
const ICONS = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  announcements: "M3 11l18-6v14l-18-6zM3 11v5a2 2 0 0 0 2 2h2",
  settings: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
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
      // IT FLOATS, AND THAT IS NOT DECORATION.
      //
      // Flush to the bottom edge it sat in the iPhone's home-indicator strip,
      // where a swipe up means "leave the app" - so the bottom row of the
      // portal was competing with the gesture that closes it. Lifted clear by
      // the safe-area inset plus a little air, inset from both sides, and
      // rounded, which is the shape Mánu pointed at in Canvas.
      //
      // The offset is `env(safe-area-inset-bottom)` and not a guessed number:
      // that value is the indicator on an iPhone, and 0 on a phone that has no
      // indicator and needs no gap.
      //
      // print:hidden for the same reason every other floating control has it -
      // a tab bar across the foot of a printed timesheet helps nobody
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 rounded-full border border-border bg-surface/95 shadow-lg backdrop-blur print:hidden lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4 p-1.5">
        {tabs.map((t) => {
          const on = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                // 52px of tap target inside a 64px bar, and the whole tab is
                // the target rather than the label. The current one wears a
                // filled capsule rather than only a colour, which is the part
                // of the Canvas bar that makes where-you-are readable at a
                // glance on a dark screen.
                className={`flex h-13 flex-col items-center justify-center gap-1 rounded-full text-[10.5px] font-medium leading-none transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
                  on ? "bg-surface-3 text-brand" : "text-muted"
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
