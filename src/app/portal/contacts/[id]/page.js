import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { ROLE_LABELS, roleBadgeClass, canSeeRoles } from "@/lib/roles";
import Avatar from "@/components/Avatar";

export const metadata = {
  title: "Contact · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function ContactDetailPage({ params }) {
  const { id } = await params;
  const viewer = await getCurrentUser();

  const person = await prisma.user.findFirst({
    where: { id, deactivatedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      title: true,
      phone: true,
      image: true,
      workingHours: true,
    },
  });
  if (!person) notFound();

  // privilege role shows only to ADMIN/IT, or when you're viewing your
  // own profile. everyone else just sees the title.
  const showRole = canSeeRoles(viewer.role) || viewer.id === person.id;

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <Link
        href="/portal/contacts"
        className="text-sm font-medium text-slate-600 transition hover:text-brand"
      >
        ← Back to Team Contacts
      </Link>

      {/* profile header */}
      <div className="mt-4 flex items-start gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <Avatar
          name={person.name}
          email={person.email}
          image={person.image}
          size={80}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {person.name || person.email}
            </h1>
            {showRole && (
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${roleBadgeClass(person.role)}`}>
                {ROLE_LABELS[person.role] ?? person.role}
              </span>
            )}
          </div>
          {person.title && (
            <p className="text-sm text-slate-600">{person.title}</p>
          )}
          <div className="mt-3 space-y-1 text-sm">
            <a
              href={`mailto:${person.email}`}
              className="block text-brand underline-offset-2 hover:underline"
            >
              {person.email}
            </a>
            {person.phone && (
              <a
                href={`tel:${person.phone.replace(/[^\d+]/g, "")}`}
                className="block text-slate-700 underline-offset-2 hover:underline"
              >
                {person.phone}
              </a>
            )}
            {person.workingHours && (
              <p className="text-slate-700">
                <span className="font-medium text-slate-500">Hours:</span>{" "}
                {person.workingHours}
              </p>
            )}
          </div>
          {viewer.id === person.id && (
            <Link
              href="/portal/settings"
              className="mt-3 inline-block text-xs font-medium text-slate-500 underline-offset-2 hover:text-brand hover:underline"
            >
              Edit your photo, phone &amp; hours in Settings →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
