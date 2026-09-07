"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Megaphone,
  AlignLeft,
  Newspaper,
  FileText,
  BookOpen,
  MapPin,
  TreePine,
  Users,
  Shield,
  UserRound,
  ArrowLeft,
  LogOut,
} from "lucide-react";

// the desktop rail, lg and up. one place for every destination the old header
// row and the dashboard cards both pointed at, grouped the way the mock was
// approved: the main four, a Library, and Manage for whoever can enter admin.
// selection is the filled brand item; everything else stays quiet.
//
// Caseload and Suggestions & Bugs are deliberately not in here - the caseload
// card only exists for people the roster gives one, which this layout-level
// component does not know, and the feedback board keeps its amber utility-card
// home on the dashboard.
const MAIN = [
  { href: "/portal", label: "Dashboard", icon: LayoutGrid, exact: true },
  { href: "/portal/announcements", label: "Announcements", icon: Megaphone },
  { href: "/portal/hub", label: "Hub", icon: AlignLeft },
  { href: "/portal/newsletter", label: "Newsletter", icon: Newspaper },
];

const LIBRARY = [
  { href: "/portal/forms", label: "Forms", icon: FileText },
  { href: "/portal/guidebook", label: "Guidebook", icon: BookOpen },
  { href: "/portal/resources", label: "Resources", icon: MapPin },
  { href: "/portal/recreation", label: "Recreation", icon: TreePine },
  { href: "/portal/contacts", label: "Contacts", icon: Users },
];

function NavItem({ href, label, icon: Icon, exact, pathname }) {
  const on = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-[5px] text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
        on ? "accent-fill-soft font-semibold" : "text-foreground hover:bg-fill"
      }`}
    >
      <Icon size={16} strokeWidth={1.7} aria-hidden="true" className={on ? "" : "text-muted"} />
      {label}
    </Link>
  );
}

export default function PortalSidebar({ elevated, name, subline, signOut }) {
  const pathname = usePathname() || "";
  const initials = (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <aside className="sticky top-0 hidden h-screen w-[250px] flex-none flex-col overflow-y-auto border-r border-sep bg-[var(--sidebar)] px-2.5 pb-2.5 pt-3.5 lg:flex">
      <Link
        href="/portal"
        className="mb-3 flex items-center gap-2.5 rounded-lg px-2.5 py-1 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Image
          src="/logo/treelogov2.png"
          alt=""
          width={2428}
          height={1820}
          priority
          className="h-8 w-auto rounded-md"
        />
        <span className="leading-tight">
          <span className="block text-[13.5px] font-semibold tracking-tight">My Life Services</span>
          <span className="block text-[11.5px] text-muted">Employee portal</span>
        </span>
      </Link>

      {/* labelled apart from the tab bar's "Portal sections" so the two nav
          landmarks stay distinguishable to a screen reader. */}
      <nav aria-label="Portal navigation" className="flex flex-1 flex-col">
        <div className="flex flex-col gap-px">
          {MAIN.map((t) => (
            <NavItem key={t.href} {...t} pathname={pathname} />
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-px">
          <div className="px-2.5 pb-1 text-[11px] font-semibold text-faint">Library</div>
          {LIBRARY.map((t) => (
            <NavItem key={t.href} {...t} pathname={pathname} />
          ))}
        </div>

        {elevated && (
          <div className="mt-4 flex flex-col gap-px">
            <div className="px-2.5 pb-1 text-[11px] font-semibold text-faint">Manage</div>
            <NavItem href="/portal/admin" label="Admin" icon={Shield} pathname={pathname} />
          </div>
        )}

        <div className="mt-auto flex flex-col gap-px pt-4">
          <NavItem href="/portal/settings" label="Settings" icon={UserRound} pathname={pathname} />
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-[5px] text-[13px] font-medium text-muted transition-colors hover:bg-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
          >
            <ArrowLeft size={16} strokeWidth={1.7} aria-hidden="true" />
            Back to website
          </Link>
        </div>
      </nav>

      <div className="mt-2 flex items-center gap-2.5 rounded-[10px] px-2.5 py-2">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-light text-[11px] font-semibold text-white"
        >
          {initials || "?"}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[12.5px] font-semibold text-foreground">{name}</span>
          {subline && <span className="block truncate text-[11px] text-faint">{subline}</span>}
        </span>
        <form action={signOut}>
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-fill hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
          >
            <LogOut size={15} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </form>
      </div>
    </aside>
  );
}
