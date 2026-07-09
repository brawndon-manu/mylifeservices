import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatUSPhone } from "@/lib/contacts";
import { OFFICE_LABELS } from "@/lib/positions";
import Avatar from "@/components/Avatar";
import CopyButton from "@/components/CopyButton";

// PUBLIC, UNLISTED share page for a team member's contact card. reachable only
// by its direct (unguessable) link, noindex, no login required. shows the
// public-facing contact info only - NEVER the privilege role. the phone is
// shown only if the person opted to share it publicly (sharePhonePublicly).

const PUBLIC_SELECT = {
  name: true,
  preferredFirstName: true,
  preferredLastName: true,
  hideLegalName: true,
  title: true,
  offices: true,
  email: true,
  phone: true,
  image: true,
  sharePhonePublicly: true,
};

// name to show publicly: preferred first/last, falling back to legal first/last.
// but if the legal name is hidden and there's no preferred FIRST name, never
// expose the legal first - use the email prefix instead.
function publicName(p) {
  const parts = (p.name || "").trim().split(/\s+/).filter(Boolean);
  const legalFirst = parts[0] || "";
  const legalLast = parts.slice(1).join(" ");
  const first = p.preferredFirstName || (p.hideLegalName ? "" : legalFirst);
  if (!first) return p.email ? p.email.split("@")[0] : "Team member";
  const last = p.preferredLastName || legalLast;
  return [first, last].filter(Boolean).join(" ");
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const p = await prisma.user.findFirst({
    where: { id, deactivatedAt: null },
    select: {
      name: true,
      preferredFirstName: true,
      preferredLastName: true,
      hideLegalName: true,
      email: true,
    },
  });
  return {
    title: p ? `${publicName(p)} · My Life Services` : "Contact",
    robots: { index: false, follow: false },
  };
}

export default async function PublicContactPage({ params }) {
  const { id } = await params;
  const p = await prisma.user.findFirst({
    where: { id, deactivatedAt: null },
    select: PUBLIC_SELECT,
  });
  if (!p) notFound();

  const phone = p.sharePhonePublicly ? formatUSPhone(p.phone) : null;
  const top = publicName(p);

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        My Life Services
      </p>

      <div className="mt-4 flex items-start gap-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <Avatar name={top} email={p.email} image={p.image} size={80} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {top}
          </h1>
          {p.title && <p className="text-sm text-muted">{p.title}</p>}
          {p.offices?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {p.offices.map((o) => (
                <span
                  key={o}
                  className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted"
                >
                  {OFFICE_LABELS[o] || o}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <a
                href={`mailto:${p.email}`}
                className="text-brand underline-offset-2 hover:underline"
              >
                {p.email}
              </a>
              <CopyButton text={p.email} label="Copy email" />
            </div>
            {phone && (
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                  className="text-muted underline-offset-2 hover:underline"
                >
                  {phone}
                </a>
                <CopyButton text={phone} label="Copy phone" />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <a
          href={`mailto:${p.email}`}
          className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand"
        >
          Email
        </a>
        {phone && (
          <a
            href={`tel:${phone.replace(/[^\d+]/g, "")}`}
            className="rounded-md border border-border-strong px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2"
          >
            Call {phone}
          </a>
        )}
      </div>
    </section>
  );
}
