"use client";

import Link from "next/link";
import Avatar from "@/components/Avatar";
import { PortalNavigationOverlay, PortalNavigationToggle } from "./PortalNavigation";
import styles from "./PortalNavigation.module.css";
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

// Keep destinations and role visibility shared across desktop and mobile.
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
      className={styles.link}
    >
      <Icon size={16} strokeWidth={1.7} aria-hidden="true"  />
      {label}
    </Link>
  );
}

export default function PortalSidebar({ elevated, name, image, subline, signOut }) {
  const pathname = usePathname() || "";
  const initials = (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <PortalNavigationOverlay>
      <div className={styles.profile}>
        {image ? <Avatar name={name} image={image} size={34} /> : <span aria-hidden="true" className={styles.avatar}>{initials || "?"}</span>}
        <span className={styles.identity}>
          {name}
          {subline && <span className={styles.subline}>{subline}</span>}
        </span>
        <PortalNavigationToggle collapse />
      </div>
      <nav aria-label="Portal navigation">
        <div className={styles.group}>
          {MAIN.map((t) => <NavItem key={t.href} {...t} pathname={pathname} />)}
        </div>
        <div className={styles.heading}>Library</div>
        <div className={styles.group}>
          {LIBRARY.map((t) => <NavItem key={t.href} {...t} pathname={pathname} />)}
        </div>
        <div className={styles.heading}>Manage</div>
        <div className={styles.group}>
          {elevated && <NavItem href="/portal/admin" label="Admin" icon={Shield} pathname={pathname} />}
          <NavItem href="/portal/settings" label="Settings" icon={UserRound} pathname={pathname} />
        </div>
        <div className={styles.footer}>
          <Link href="/" className={styles.link}>
            <ArrowLeft size={16} strokeWidth={1.7} aria-hidden="true" />
            Back to website
          </Link>
          <form action={signOut}>
            <button type="submit" className={styles.link}>
              <LogOut size={16} strokeWidth={1.7} aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </nav>
    </PortalNavigationOverlay>
  );
}
