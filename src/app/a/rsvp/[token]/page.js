import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { isFull, slotLabel, remainingFor, sessionStarted } from "@/lib/meeting-slots";
import { verifyRsvpToken } from "@/lib/rsvp-token";
import { firstNameOf } from "@/lib/contacts";
import { isCompanyMeeting, computeMeetingLocks } from "@/lib/announcements";
import { formatInstant } from "@/lib/meeting-time";
import RsvpForm from "./RsvpForm";

const TZ = "America/Los_Angeles";
const optDateLabel = (o) => (o?.at ? formatInstant(o.at, TZ) : o?.label || "This session");

// landing page for the email meeting-RSVP links. lives outside /portal so
// proxy.js doesn't bounce it to login - the signed token IS the credential.
//
// NOTHING RECORDS ON LOAD, deliberately, and it has to stay that way: mail
// scanners fetch every link in an email, so a GET that writes would mark
// people going the moment their inbox scanned the message. A tapped date in
// the email only PRE-SELECTS here; recording happens when a person presses
// Confirm, which posts through submitRsvpPicks.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Meeting RSVP · My Life Services",
  robots: { index: false, follow: false },
};

export default async function RsvpPage({ params, searchParams }) {
  const { token } = await params;
  const sp = await searchParams;
  const done = sp?.done; // set after the cant form posts back (= its result status)
  const parsed = verifyRsvpToken(token);

  let post = null;
  let user = null;
  if (parsed) {
    [post, user] = await Promise.all([
      prisma.announcement.findUnique({
        where: { id: parsed.announcementId },
        select: {
          id: true,
          title: true,
          tag: true,
          deletedAt: true,
          publishedAt: true,
          meetingOptions: true,
          meetingMultiPick: true,
          // the select is the reason `signing` read false with the flag set:
          // an unselected field is undefined, and undefined !== "signing"
          meetingFormat: true,
          meetingAt: true,
          requireAck: true,
          ackEveryone: true,
          ackTitles: true,
          ackUserIds: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: parsed.userId },
        select: {
          id: true,
          name: true,
          preferredFirstName: true,
          preferredLastName: true,
          title: true,
          deactivatedAt: true,
        },
      }),
    ]);
  }

  const valid =
    post &&
    !post.deletedAt &&
    post.publishedAt &&
    isCompanyMeeting(post.tag) &&
    user &&
    !user.deactivatedAt;

  const opts = valid && Array.isArray(post.meetingOptions) ? post.meetingOptions : [];
  const isSeries = opts.some((o) => o && o.seriesId);
  const kind = !valid ? null : opts.length === 0 ? "single" : isSeries ? "series" : "flat";
  const firstName = valid ? firstNameOf(user) || "there" : "there";
  const title = valid ? post.title || "the meeting" : "";
  const postId = valid ? post.id : null;

  // every meeting shows the one-page picker; when we're back from a save (?done),
  // we show the confirmation with what they chose instead.
  const showPicker = valid && !done;

  let series = [];
  let flat = null;
  let singleLocked = false;
  let initial = {};
  let chosen = []; // { label, value, cant, none } rows for the confirmation summary

  if (valid) {
    const [myChoices, myResp] = await Promise.all([
      prisma.announcementMeetingChoice.findMany({
        where: { announcementId: post.id, userId: user.id },
        select: { optionId: true, attended: true },
      }),
      prisma.announcementMeetingResponse.findUnique({
        where: { announcementId_userId: { announcementId: post.id, userId: user.id } },
        select: { cantMakeIt: true, attended: true, reason: true },
      }),
    ]);
    const locks = computeMeetingLocks({
      options: opts,
      myChoices,
      meetingAt: post.meetingAt,
      myAttended: myResp?.attended || null,
      now: Date.now(),
    });
    // HOW FULL EACH SLOT IS. `submitRsvpPicks` already refuses a full one, but
    // being told no after choosing is a worse experience than not being offered
    // it - and this is the link most people will use, straight from the email.
    const takenByOption = Object.fromEntries(
      (
        await prisma.announcementMeetingChoice.groupBy({
          by: ["optionId"],
          where: { announcementId: post.id },
          _count: { _all: true },
        })
      ).map((c) => [c.optionId, c._count._all]),
    );
    const mineAlready = new Set(myChoices.map((c) => c.optionId));

    const reason = myResp?.reason || "";
    const tapped = parsed.choice && opts.find((o) => o.id === parsed.choice);

    if (kind === "series") {
      const groups = [];
      for (const o of opts) {
        if (!o?.seriesId) continue;
        let g = groups.find((x) => x.id === o.seriesId);
        if (!g) {
          g = { id: o.seriesId, label: o.seriesLabel || "Series", options: [] };
          groups.push(g);
        }
        g.options.push({
          id: o.id,
          dateLabel: optDateLabel(o),
          // same two states the flat build carries - a slot they are already
          // in is never shown as full or past to them
          full: !mineAlready.has(o.id) && isFull(o, takenByOption[o.id] || 0),
          past: !mineAlready.has(o.id) && sessionStarted(o),
          note: slotLabel(o, takenByOption[o.id] || 0),
        });
      }
      series = groups.map((g) => ({ ...g, locked: locks.lockedSeriesIds.includes(g.id) }));

      const seriesPick = {};
      const cantSeries = [];
      for (const c of myChoices) {
        const oid = String(c.optionId);
        if (oid.startsWith("cant:")) cantSeries.push(oid.slice("cant:".length));
        else {
          const o = opts.find((x) => x.id === oid);
          if (o?.seriesId) seriesPick[o.seriesId] = oid;
        }
      }
      if (tapped?.seriesId) {
        seriesPick[tapped.seriesId] = tapped.id;
        const i = cantSeries.indexOf(tapped.seriesId);
        if (i > -1) cantSeries.splice(i, 1);
      }
      initial = { seriesPick, cantSeries, reason };
      chosen = groups.map((g) => {
        if (cantSeries.includes(g.id)) return { label: g.label, value: "Can't attend", cant: true };
        const o = seriesPick[g.id] && opts.find((x) => x.id === seriesPick[g.id]);
        return o
          ? { label: g.label, value: optDateLabel(o) }
          : { label: g.label, value: "No date picked", none: true };
      });
    } else if (kind === "flat") {
      const multi = !!post.meetingMultiPick;
      flat = {
        multi,
        locked: locks.lockedAll,
        // A SIGNING GROUPS BY DAY, exactly as the portal picker does - a
        // hundred full-width radio rows was the first thing this page ever
        // rendered for one, and Manu called it horrendous. Day and time ride
        // separately so the form can print day headings over compact times.
        signing: post.meetingFormat === "signing",
        options: opts.map((o) => {
          const parts = optDateLabel(o).split(" \u00b7 ");
          return {
            id: o.id,
            dateLabel: optDateLabel(o),
            day: parts[0] || optDateLabel(o),
            time: (parts[1] || "").replace(/ [A-Z]{2,4}$/, "") || null,
            // a slot they are already in is never shown as full to them
            full: !mineAlready.has(o.id) && isFull(o, takenByOption[o.id] || 0),
            // a session already underway is offered to nobody new - shown
            // greyed with its own words, and the server refuses it regardless
            past: !mineAlready.has(o.id) && sessionStarted(o),
            note: slotLabel(o, takenByOption[o.id] || 0),
            left: remainingFor(o, takenByOption[o.id] || 0),
          };
        }),
      };
      const existingPicks = myChoices
        .map((c) => c.optionId)
        .filter((id) => !String(id).startsWith("cant:") && opts.some((o) => o.id === id));
      let flatCant = !!myResp?.cantMakeIt && existingPicks.length === 0;
      if (parsed.choice === "cant") flatCant = true;
      if (multi) {
        const flatChecks = [...existingPicks];
        if (tapped && !flatChecks.includes(tapped.id)) {
          flatChecks.push(tapped.id);
          flatCant = false;
        }
        initial = { flatChecks, flatCant, reason };
        chosen = flatCant
          ? [{ label: "Your response", value: "Can't attend", cant: true }]
          : flatChecks.map((id) => ({ label: "Date", value: optDateLabel(opts.find((o) => o.id === id)) }));
      } else {
        let flatVal = existingPicks[0] || "";
        if (tapped) {
          flatVal = tapped.id;
          flatCant = false;
        }
        initial = { flatVal, flatCant, reason };
        chosen = flatCant
          ? [{ label: "Your response", value: "Can't attend", cant: true }]
          : flatVal
            ? [{ label: "Your date", value: optDateLabel(opts.find((o) => o.id === flatVal)) }]
            : [];
      }
    } else if (kind === "single") {
      singleLocked = locks.lockedAll;
      let singleGoing = !!myResp && !myResp.cantMakeIt;
      let singleCant = !!myResp?.cantMakeIt;
      if (parsed.choice === "going") (singleGoing = true), (singleCant = false);
      if (parsed.choice === "cant") (singleCant = true), (singleGoing = false);
      initial = { singleGoing, singleCant, reason };
      chosen = singleCant
        ? [{ label: "Your response", value: "Can't attend", cant: true }]
        : singleGoing
          ? [{ label: "Your response", value: "Attending" }]
          : [];
    }
  }

  const status = done; // set after the picker posts back
  const good =
    status === "going" || status === "cant" || status === "partial" || status === "saved";

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      {showPicker ? (
        <RsvpForm
          token={token}
          title={title}
          firstName={firstName}
          kind={kind}
          series={series}
          flat={flat}
          singleLocked={singleLocked}
          initial={initial}
        />
      ) : good ? (
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckIcon className="h-8 w-8" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
              Response saved, {firstName}.
            </h1>
            <p className="mt-2 text-base text-muted">
              <span className="font-medium text-foreground">&ldquo;{title}&rdquo;</span>
            </p>
          </div>
          {chosen.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-xl border border-border text-left">
              {chosen.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm first:border-t-0"
                >
                  <span className="text-muted">{c.label}</span>
                  <span
                    className={`text-right font-semibold ${c.cant ? "text-rose-500" : c.none ? "text-faint" : "text-foreground"}`}
                  >
                    {c.value}
                  </span>
                </div>
              ))}
            </div>
          )}
          {chosen.some((c) => c.cant) && initial.reason && (
            <p className="mt-3 text-center text-xs text-muted">
              Reason noted: &ldquo;{initial.reason}&rdquo;
            </p>
          )}
        </div>
      ) : status === "locked" ? (
        <>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <ClockIcon className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
            That&apos;s already locked in
          </h1>
          <p className="mt-2 text-base text-muted">
            This session has already started or was marked, so it can&apos;t be
            changed from here. Ask an admin if you need a change.
          </p>
        </>
      ) : (
        <>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-3 text-muted">
            <LinkOffIcon className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
            This link isn&apos;t valid
          </h1>
          <p className="mt-2 text-base text-muted">
            It may have expired, or the meeting was removed. Sign in to the portal
            to respond there.
          </p>
        </>
      )}

      {!showPicker && (
        <Link
          href={postId ? `/portal/announcements/${postId}` : "/portal/announcements"}
          className="mt-6 text-sm font-medium text-brand transition hover:text-brand-dark"
        >
          {good ? "Change or view it in the portal →" : "Go to Announcements →"}
        </Link>
      )}
    </section>
  );
}

function CheckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
function ClockIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function LinkOffIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 3.5 8.5M3 3l18 18" />
    </svg>
  );
}
