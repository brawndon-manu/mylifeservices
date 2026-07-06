import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { ROLE_LABELS, roleBadgeClass, canSeeRoles, isManagerUp } from "@/lib/roles";
import { preferredName, legalName } from "@/lib/contacts";
import Avatar from "@/components/Avatar";
import CopyButton from "@/components/CopyButton";
import ShareMenu from "@/components/ShareMenu";

export const metadata = {
  title: "Contact · MLS Portal",
  robots: { index: false, follow: false },
};

// the back link returns you to wherever you opened this contact from (the
// ?from=<path> marker set by the hover card), falling back to Team Contacts.
function backTarget(from) {
  const def = { href: "/portal/contacts", label: "Team Contacts" };
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return def;
  const label = from.startsWith("/portal/announcements")
    ? "Announcements"
    : from.startsWith("/portal/admin/acknowledgments")
      ? "Acknowledgments"
      : from.startsWith("/portal/admin/meeting-attendance")
        ? "Meeting attendance"
        : from.startsWith("/portal/hub")
          ? "the Hub"
          : from.startsWith("/portal/newsletter")
            ? "Newsletter"
            : from.startsWith("/portal/feedback")
              ? "Suggestions"
              : from.startsWith("/portal/contacts")
                ? "Team Contacts"
                : "back";
  return { href: from, label };
}

export default async function ContactDetailPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const back = backTarget(sp?.from);
  const viewer = await getCurrentUser();

  const person = await prisma.user.findFirst({
    where: { id, deactivatedAt: null },
    select: {
      id: true,
      name: true,
      preferredFirstName: true,
      preferredLastName: true,
      hideLegalName: true,
      email: true,
      role: true,
      title: true,
      phone: true,
      image: true,
      workingHours: true,
    },
  });
  if (!person) notFound();

  // privilege role badge shows only to Admin/IT/Super (canSeeRoles). no
  // self-exception - HR/Manager/Staff don't see their own role here either;
  // everyone outside Admin/IT/Super just sees the title.
  const showRole = canSeeRoles(viewer.role);

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <Link
        href={back.href}
        className="text-sm font-medium text-muted transition hover:text-brand"
      >
        ← Back to {back.label}
      </Link>

      {/* profile header */}
      <div className="mt-4 flex items-start gap-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <Avatar
          name={preferredName(person)}
          email={person.email}
          image={person.image}
          size={80}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {preferredName(person)}
            </h1>
            {/* share a public, no-login link to this contact (/c/[id]) */}
            <ShareMenu path={`/c/${person.id}`} label="Share contact" />
            {showRole && (
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${roleBadgeClass(person.role)}`}>
                {ROLE_LABELS[person.role] ?? person.role}
              </span>
            )}
          </div>
          {legalName(person) &&
            (!person.hideLegalName || isManagerUp(viewer.role) || viewer.id === person.id) && (
              <p className="text-sm text-muted">{legalName(person)}</p>
            )}
          {person.title && (
            <p className="text-sm text-muted">{person.title}</p>
          )}
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <a
                href={`mailto:${person.email}`}
                className="text-brand underline-offset-2 hover:underline"
              >
                {person.email}
              </a>
              <CopyButton text={person.email} label="Copy email" />
            </div>
            {person.phone && (
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${person.phone.replace(/[^\d+]/g, "")}`}
                  className="text-muted underline-offset-2 hover:underline"
                >
                  {person.phone}
                </a>
                <CopyButton text={person.phone} label="Copy phone" />
              </div>
            )}
            {person.workingHours && (
              <p className="text-muted">
                <span className="font-medium text-muted">Hours:</span>{" "}
                {person.workingHours}
              </p>
            )}
          </div>
          {viewer.id === person.id && (
            <Link
              href="/portal/settings"
              className="mt-3 inline-block text-xs font-medium text-muted underline-offset-2 hover:text-brand hover:underline"
            >
              Edit your photo, phone &amp; hours in Settings →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
