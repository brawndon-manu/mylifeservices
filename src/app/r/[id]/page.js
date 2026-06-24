import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatUSPhone, formatScheduleRow, OP_STATUS_LABELS } from "@/lib/contacts";

// PUBLIC, UNLISTED share page for a community resource. reachable only by its
// direct (unguessable) link, not linked anywhere public, and noindex so search
// engines don't surface it. shows only public-facing fields, NEVER the
// staff-only internal notes / source / verification. approved resources only.

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
function mapSrc(address) {
  if (!MAPS_KEY || !address) return null;
  return `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${encodeURIComponent(address)}`;
}
function directionsHref(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

const OP_CHIP = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  TEMPORARILY_UNAVAILABLE: "bg-amber-100 text-amber-800",
  NEEDS_VERIFICATION: "bg-amber-100 text-amber-800",
  CLOSED: "bg-rose-100 text-rose-700",
};

// only the public-facing columns; internal notes / source / verification are
// deliberately not selected.
const PUBLIC_SELECT = {
  name: true,
  category: true,
  subtype: true,
  orgName: true,
  phone: true,
  email: true,
  website: true,
  appointmentLink: true,
  contactInstructions: true,
  address: true,
  city: true,
  state: true,
  zip: true,
  serviceArea: true,
  hours: true,
  schedule: true,
  whoItServes: true,
  appointmentRequired: true,
  details: true,
  operationalStatus: true,
};

export async function generateMetadata({ params }) {
  const { id } = await params;
  const r = await prisma.resource.findFirst({
    where: { id, status: "APPROVED" },
    select: { name: true },
  });
  return {
    title: r ? `${r.name} · Community resource` : "Resource",
    robots: { index: false, follow: false },
  };
}

export default async function PublicResourcePage({ params }) {
  const { id } = await params;
  const r = await prisma.resource.findFirst({
    where: { id, status: "APPROVED" },
    select: PUBLIC_SELECT,
  });
  if (!r) notFound();

  const phone = formatUSPhone(r.phone);
  const det = r.details || {};
  const subtitle = [r.subtype, (r.whoItServes || []).join(", ")].filter(Boolean).join(" • ");
  const scheduleLines = (Array.isArray(r.schedule) ? r.schedule : [])
    .map(formatScheduleRow)
    .filter(Boolean);
  const cityLine = [r.city, r.state].filter(Boolean).join(", ") + (r.zip ? ` ${r.zip}` : "");
  const src = !det.addressVaries ? mapSrc(r.address) : null;
  const requirements = [
    r.appointmentRequired && "Appointment required",
    det.referralRequired && "Referral required",
    det.idRequired && "ID required",
    det.proofOfIncomeRequired && "Proof of income required",
  ].filter(Boolean);
  const hasVisitDetails =
    det.distributionMethod || det.foodSelection || det.whatToBring || (det.specialInstructions || []).length > 0;

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Community resource
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {r.category && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-brand">{r.category}</span>
        )}
        {r.operationalStatus && r.operationalStatus !== "ACTIVE" && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${OP_CHIP[r.operationalStatus] || "bg-surface-3 text-muted"}`}>
            {OP_STATUS_LABELS[r.operationalStatus] || r.operationalStatus}
          </span>
        )}
      </div>

      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{r.name}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      {r.orgName && <p className="text-sm text-faint">{r.orgName}</p>}
      {r.notes && <p className="mt-4 text-base leading-relaxed text-muted">{r.notes}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {r.address && !det.addressVaries && (
          <a href={directionsHref(r.address)} target="_blank" rel="noopener noreferrer" className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand">
            Get directions
          </a>
        )}
        {phone && (
          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="rounded-md border border-border-strong px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2">
            Call {phone}
          </a>
        )}
        {r.appointmentLink && (
          <a href={r.appointmentLink} target="_blank" rel="noopener noreferrer" className="rounded-md border border-border-strong px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2">
            Book appointment
          </a>
        )}
      </div>

      <div className="mt-8 space-y-7">
        {(scheduleLines.length > 0 || r.hours) && (
          <Block title="Hours">
            {scheduleLines.length > 0 && (
              <ul className="space-y-0.5 text-sm text-muted">
                {scheduleLines.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            )}
            {r.hours && <p className="mt-1 whitespace-pre-line text-sm text-muted">{r.hours}</p>}
          </Block>
        )}

        <Block title="Location">
          {det.addressVaries ? (
            <p className="text-sm italic text-muted">Location varies</p>
          ) : (
            <>
              {r.address && <p className="text-sm text-muted">{r.address}</p>}
              {cityLine.trim() && <p className="text-sm text-muted">{cityLine}</p>}
            </>
          )}
          {r.serviceArea && <p className="mt-1 text-sm text-faint">Serves: {r.serviceArea}</p>}
          {src && (
            <div className="mt-3 overflow-hidden rounded-lg border border-border">
              <iframe title={`Map of ${r.name}`} src={src} className="block aspect-[16/9] w-full" style={{ border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </div>
          )}
        </Block>

        {(phone || r.email || r.website || r.contactInstructions) && (
          <Block title="Contact">
            <div className="space-y-0.5 text-sm">
              {phone && <p className="text-muted">{phone}</p>}
              {r.email && <a href={`mailto:${r.email}`} className="block text-brand hover:underline">{r.email}</a>}
              {r.website && (
                <a href={r.website} target="_blank" rel="noopener noreferrer" className="block truncate text-brand hover:underline">
                  {r.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {r.contactInstructions && <p className="text-muted">{r.contactInstructions}</p>}
            </div>
          </Block>
        )}

        {((r.whoItServes || []).length > 0 || requirements.length > 0 || det.otherEligibility) && (
          <Block title="Who it serves">
            {(r.whoItServes || []).length > 0 && <p className="text-sm text-muted">{r.whoItServes.join(", ")}</p>}
            {requirements.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {requirements.map((x) => (
                  <span key={x} className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-muted">{x}</span>
                ))}
              </div>
            )}
            {det.otherEligibility && <p className="mt-2 text-sm text-muted">{det.otherEligibility}</p>}
          </Block>
        )}

        {hasVisitDetails && (
          <Block title="Visit details">
            <dl className="space-y-0.5 text-sm">
              {det.distributionMethod && <Row k="Distribution" v={det.distributionMethod} />}
              {det.foodSelection && <Row k="Food selection" v={det.foodSelection} />}
              {det.whatToBring && <Row k="What to bring" v={det.whatToBring} />}
            </dl>
            {(det.specialInstructions || []).length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-muted">
                {det.specialInstructions.map((s) => <li key={s}>{s}</li>)}
              </ul>
            )}
          </Block>
        )}
      </div>

      <p className="mt-10 border-t border-border pt-5 text-xs text-faint">
        Shared by My Life Services. Details can change, please call ahead to confirm.
      </p>
    </section>
  );
}

function Block({ title, children }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-faint">{k}</dt>
      <dd className="text-muted">{v}</dd>
    </div>
  );
}
