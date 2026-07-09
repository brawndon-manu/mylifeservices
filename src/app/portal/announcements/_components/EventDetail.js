// the Event block on an announcement detail page: audience badge, a When / Where
// pair, the Google Map embed (address-driven, same as resources) + directions, the
// staff RSVP, and a headcount rollup. mirrors the meeting block's spot on the page.
import Avatar from "@/components/Avatar";
import { preferredName } from "@/lib/contacts";
import { isClientEvent, eventAudienceLabel } from "@/lib/announcements";
import EventResponse from "./EventResponse";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
const DEFAULT_TZ = "America/Los_Angeles";

function fmt(date, tz, opts) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(date);
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

export default function EventDetail({ post, myRsvp, data }) {
  const client = isClientEvent(post.eventAudience);
  const tz = post.eventTimezone || DEFAULT_TZ;
  const audienceBadge = client
    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
    : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300";

  let whenMain = "";
  let whenSub = "";
  if (post.eventAt) {
    whenMain = fmt(post.eventAt, tz, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    const start = fmt(post.eventAt, tz, { hour: "numeric", minute: "2-digit" });
    whenSub = post.eventEndAt
      ? `${start} - ${fmt(post.eventEndAt, tz, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`
      : fmt(post.eventAt, tz, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  }

  const addr = post.eventAddress;
  const mapSrc = addr && MAPS_KEY ? `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${encodeURIComponent(addr)}` : null;
  const dirUrl = addr ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}` : null;

  return (
    <div className="mx-auto mt-6 max-w-2xl px-6 sm:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${audienceBadge}`}>
          {eventAudienceLabel(post.eventAudience)}
        </span>
      </div>

      {/* When / Where */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-faint">When</p>
          {post.eventAt ? (
            <>
              <p className="mt-1.5 text-base font-bold text-foreground">{whenMain}</p>
              <p className="text-sm text-muted">{whenSub}</p>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-faint">Date to be announced</p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-faint">Where</p>
          {post.eventLocationName || addr ? (
            <>
              {post.eventLocationName && <p className="mt-1.5 text-base font-bold text-foreground">{post.eventLocationName}</p>}
              {addr && <p className="text-sm text-muted">{addr}</p>}
            </>
          ) : (
            <p className="mt-1.5 text-sm text-faint">Location to be announced</p>
          )}
        </div>
      </div>

      {/* map embed (address-driven), same treatment as the resources pages */}
      {mapSrc && (
        <div className="mt-3">
          <div className="overflow-hidden rounded-xl border border-border">
            <iframe
              title={`Map of ${post.eventLocationName || addr}`}
              src={mapSrc}
              className="block aspect-video w-full"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          {dirUrl && (
            <a
              href={dirUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-brand transition hover:border-brand"
            >
              <PinIcon /> Get directions
            </a>
          )}
        </div>
      )}

      {/* RSVP */}
      <EventResponse postId={post.id} isClientEvent={client} myRsvp={myRsvp} />

      {/* headcount */}
      {data && (data.staff > 0 || data.clients > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-surface p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-faint">Headcount</p>
            <p className="mt-1 text-sm font-bold text-foreground">
              {data.staff} staff
              {client && (
                <>
                  {" "}
                  <span className="text-faint">·</span> {data.clients} clients{" "}
                  <span className="text-emerald-500">= {data.total} total</span>
                </>
              )}
            </p>
          </div>
          {data.people.length > 0 && (
            <span className="ml-auto flex items-center">
              <span className="flex">
                {data.people.slice(0, 6).map((p, i) => (
                  <span key={i} className="-ml-2 rounded-full ring-2 ring-surface first:ml-0">
                    <Avatar name={preferredName(p)} email={p.email} image={p.image} size={26} />
                  </span>
                ))}
              </span>
              {data.people.length > 6 && (
                <span className="ml-2 text-xs text-muted">+{data.people.length - 6}</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
