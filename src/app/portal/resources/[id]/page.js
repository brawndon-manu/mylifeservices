import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, isIT } from "@/lib/roles";
import {
  formatUSPhone,
  formatScheduleRow,
  isDetailedCategory,
  basePathForCategory,
  OP_STATUS_LABELS,
} from "@/lib/contacts";
import { markVerified } from "@/app/portal/contacts/actions";

export const metadata = {
  title: "Resource · MLS Portal",
  robots: { index: false, follow: false },
};

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

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function ResourceDetailPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const elevated = isElevated(user.role);
  const canEdit = isIT(user.role); // edit + verify are IT/Super only

  const r = await prisma.resource.findUnique({
    where: { id },
    include: { verifiedBy: { select: { name: true, email: true } } },
  });
  if (!r) notFound();

  const phone = formatUSPhone(r.phone);
  const det = r.details || {};
  const schedule = Array.isArray(r.schedule) ? r.schedule : [];
  const src = mapSrc(r.address);
  const cityLine = [r.city, r.state].filter(Boolean).join(", ") + (r.zip ? ` ${r.zip}` : "");
  const subtitle = [r.subtype, (r.whoItServes || []).join(", ")].filter(Boolean).join(" • ");

  const eligibility = [
    r.appointmentRequired && "Appointment required",
    det.referralRequired && "Referral required",
    det.idRequired && "ID required",
    det.proofOfIncomeRequired && "Proof of income required",
  ].filter(Boolean);

  // directions from the address, or the coordinates when there's no address
  // (trailheads, remote spots).
  const directions = r.address
    ? directionsHref(r.address)
    : typeof r.lat === "number" && typeof r.lng === "number"
      ? `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`
      : null;

  return (
    <section className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <Link
        href={`${basePathForCategory(r.category)}${r.category ? `?cat=${encodeURIComponent(r.category)}` : ""}`}
        className="text-sm font-medium text-muted transition hover:text-brand"
      >
        ← Back to {r.category || "Resources"}
      </Link>

      {sp?.saved === "1" && (
        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Changes saved.
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {r.category && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-brand">{r.category}</span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${OP_CHIP[r.operationalStatus] || "bg-surface-3 text-muted"}`}>
          {OP_STATUS_LABELS[r.operationalStatus] || r.operationalStatus}
        </span>
        {r.staffPick && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">★ Staff pick</span>
        )}
      </div>

      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{r.name}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      {r.orgName && <p className="text-sm text-muted">{r.orgName}</p>}
      {r.notes && <p className="mt-4 text-sm leading-relaxed text-muted">{r.notes}</p>}

      {/* action buttons */}
      <div className="mt-5 flex flex-wrap gap-2">
        {directions && (
          <a href={directions} target="_blank" rel="noopener noreferrer" className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand">
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
        {det.allTrailsUrl && (
          <a href={det.allTrailsUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100">
            View on AllTrails
          </a>
        )}
        {canEdit && (
          <Link href={`/portal/resources/${id}/edit`} className="rounded-md border border-border-strong px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2">
            Edit resource
          </Link>
        )}
      </div>

      <div className="mt-8 space-y-8">
        {/* schedule */}
        {(schedule.length > 0 || r.hours) && (
          <Block title="Schedule">
            {schedule.length > 0 && (
              <ul className="space-y-1 text-sm text-muted">
                {schedule.map((row, i) => (
                  <li key={i}>{formatScheduleRow(row)}</li>
                ))}
              </ul>
            )}
            {r.hours && <p className="mt-2 whitespace-pre-line text-sm text-muted">{r.hours}</p>}
          </Block>
        )}

        {/* location */}
        {(r.address || cityLine.trim() || r.serviceArea) && (
          <Block title="Location">
            {r.address && <p className="text-sm text-muted">{r.address}</p>}
            {cityLine.trim() && <p className="text-sm text-muted">{cityLine}</p>}
            {r.serviceArea && <p className="mt-1 text-sm text-muted">Serves: {r.serviceArea}</p>}
            {src && (
              <div className="mt-3 overflow-hidden rounded-lg border border-border">
                <iframe title={`Map of ${r.name}`} src={src} className="block aspect-[16/9] w-full" style={{ border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              </div>
            )}
          </Block>
        )}

        {/* contact */}
        {(phone || r.email || r.website || r.contactInstructions) && (
          <Block title="Contact">
            <div className="space-y-1 text-sm">
              {phone && <p className="text-muted">{phone}</p>}
              {r.email && <a href={`mailto:${r.email}`} className="block text-brand hover:underline">{r.email}</a>}
              {r.website && (
                <a href={r.website} target="_blank" rel="noopener noreferrer" className="block text-brand hover:underline">
                  {r.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {r.contactInstructions && <p className="text-muted">{r.contactInstructions}</p>}
            </div>
          </Block>
        )}

        {/* eligibility */}
        {(eligibility.length > 0 || (r.whoItServes || []).length > 0 || det.otherEligibility) && (
          <Block title="Who it serves">
            {(r.whoItServes || []).length > 0 && (
              <p className="text-sm text-muted">{r.whoItServes.join(", ")}</p>
            )}
            {eligibility.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {eligibility.map((e) => (
                  <span key={e} className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-muted">{e}</span>
                ))}
              </div>
            )}
            {det.otherEligibility && <p className="mt-2 text-sm text-muted">{det.otherEligibility}</p>}
          </Block>
        )}

        {/* food / visit details */}
        {isDetailedCategory(r.category) &&
          (det.distributionMethod || det.foodSelection || det.whatToBring || (det.specialInstructions || []).length > 0) && (
            <Block title="Visit details">
              <dl className="space-y-1 text-sm">
                {det.distributionMethod && <Row k="Distribution" v={det.distributionMethod} />}
                {det.foodSelection && <Row k="Food selection" v={det.foodSelection} />}
                {det.whatToBring && <Row k="What to bring" v={det.whatToBring} />}
              </dl>
              {(det.specialInstructions || []).length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-sm text-muted">
                  {det.specialInstructions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
            </Block>
          )}

        {/* outdoor / recreation details */}
        {(det.difficulty ||
          det.entryFee ||
          det.entranceFeeUsd != null ||
          det.adventurePass ||
          (det.payment || []).length > 0 ||
          det.lengthMiles != null ||
          det.timeHrs != null ||
          det.elevationFt != null ||
          det.parking ||
          det.parkingOverflow ||
          (det.terrain || []).length > 0 ||
          (det.accessibility || []).length > 0 ||
          (det.amenities || []).length > 0 ||
          (det.hazards || []).length > 0) && (
          <Block title="Recreation details">
            <dl className="space-y-1 text-sm">
              {det.difficulty && <Row k="Difficulty" v={det.difficulty} />}
              {det.lengthMiles != null && <Row k="Length" v={`${det.lengthMiles} mi`} />}
              {det.timeHrs != null && <Row k="Time" v={`${det.timeHrs} hrs`} />}
              {det.elevationFt != null && <Row k="Elevation" v={`${det.elevationFt} ft`} />}
              {(det.terrain || []).length > 0 && <Row k="Terrain" v={det.terrain.join(", ")} />}
              {(det.accessibility || []).length > 0 && (
                <Row k="Accessibility" v={det.accessibility.join(", ")} />
              )}
              {(det.amenities || []).length > 0 && (
                <Row k="Amenities" v={det.amenities.join(", ")} />
              )}
              {det.parking && <Row k="Parking" v={det.parking} />}
              {det.parkingOverflow && <Row k="If lot's full" v={det.parkingOverflow} />}
              {det.adventurePass && <Row k="Adventure Pass" v="Required" />}
              {det.entranceFeeUsd != null && (
                <Row k="Entrance fee" v={det.entranceFeeUsd > 0 ? `$${det.entranceFeeUsd}` : "Free"} />
              )}
              {det.entryFee && <Row k="Fees" v={det.entryFee} />}
              {(det.payment || []).length > 0 && <Row k="Payment" v={det.payment.join(", ")} />}
            </dl>
            {(det.hazards || []).length > 0 && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Heads up</p>
                <ul className="mt-1 list-disc pl-5">
                  {det.hazards.map((h) => <li key={h}>{h}</li>)}
                </ul>
              </div>
            )}
          </Block>
        )}

        {/* verification + internal (elevated only) */}
        <Block title="Verification">
          <p className="text-sm text-muted">
            {r.lastVerifiedAt
              ? `Last verified ${fmtDate(r.lastVerifiedAt)}${r.verifiedBy?.name ? ` by ${r.verifiedBy.name}` : ""}.`
              : "Not yet verified."}
          </p>
          {canEdit && (
            <form action={markVerified.bind(null, id)} className="mt-2">
              <button type="submit" className="text-sm font-semibold text-brand transition hover:text-brand-dark">
                Mark verified today
              </button>
            </form>
          )}
          {elevated && r.source && <p className="mt-3 text-xs text-faint">Source: {r.source}</p>}
          {elevated && r.internalNotes && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Internal staff notes</p>
              <p className="mt-1 whitespace-pre-line">{r.internalNotes}</p>
            </div>
          )}
        </Block>
      </div>
    </section>
  );
}

function Block({ title, children }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-muted">{k}</dt>
      <dd className="text-muted">{v}</dd>
    </div>
  );
}
