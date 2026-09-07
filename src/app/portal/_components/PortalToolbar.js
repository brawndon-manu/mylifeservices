"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight } from "lucide-react";
import ThemeMenu from "./ThemeMenu";

// the desktop toolbar: a Portal › Section breadcrumb on the left, the
// appearance pill and the bell on the right, one shared glass surface. it
// names the SECTION (the sidebar item you are inside), not the individual
// page - pages keep their own headings.
const SECTIONS = [
  ["/portal/announcements", "Announcements"],
  ["/portal/hub", "Hub"],
  ["/portal/newsletter", "Newsletter"],
  ["/portal/forms", "Forms"],
  ["/portal/guidebook", "Guidebook"],
  ["/portal/resources", "Resources"],
  ["/portal/recreation", "Recreation"],
  ["/portal/contacts", "Contacts"],
  ["/portal/settings", "Settings"],
  ["/portal/admin", "Admin"],
  ["/portal/caseload", "My caseload"],
  ["/portal/feedback", "Suggestions & Bugs"],
  ["/portal/devices", "Devices"],
  ["/portal/notifications", "Notifications"],
  ["/portal/site-photos", "Site photos"],
];

export default function PortalToolbar({ elevated, unread }) {
  const pathname = usePathname() || "";
  const section = SECTIONS.find(([href]) => pathname.startsWith(href));

  return (
    <div className="glass sticky top-0 z-30 hidden items-center justify-between border-b px-6 py-2 lg:flex">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13.5px] font-medium">
        {section ? (
          <>
            <Link
              href="/portal"
              className="rounded text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Portal
            </Link>
            <ChevronRight size={13} aria-hidden="true" className="text-faint" />
            <span aria-current="page" className="font-semibold text-foreground">
              {section[1]}
            </span>
          </>
        ) : (
          <span aria-current="page" className="font-semibold text-foreground">
            Portal
          </span>
        )}
      </nav>
      <div className="flex items-center gap-2">
        <ThemeMenu />
        {elevated && (
          <Link
            href="/portal/notifications"
            aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
            className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-fill hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
          >
            <Bell size={17} strokeWidth={1.7} aria-hidden="true" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-[17px] rounded-full bg-rose-600 px-1 text-center text-[10.5px] font-bold leading-[17px] text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        )}
      </div>
    </div>
  );
}
