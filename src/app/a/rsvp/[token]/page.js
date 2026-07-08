import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { verifyRsvpToken } from "@/lib/rsvp-token";
import { firstNameOf } from "@/lib/contacts";
import { isCompanyMeeting } from "@/lib/announcements";
import { recordEmailRsvp } from "@/lib/meeting-response";
import CantForm from "./CantForm";

// landing page for the one-click email meeting-RSVP links. lives outside /portal
// so proxy.js doesn't bounce it to login - the signed token IS the credential.
// going / a specific date records immediately; "can't make it" shows a short form
// (a reason, or a per-series decline) that posts back via a no-login action.
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
  const firstName = valid ? firstNameOf(user) || "there" : "there";
  const title = valid ? post.title || "the meeting" : "";
  const postId = valid ? post.id : null;

  // the "can't make it" link shows a form first (unless we're back from posting it)
  const showCantForm = valid && parsed.choice === "cant" && !done;

  // series list for the decline checklist
  let series = [];
  if (showCantForm && isSeries) {
    const seen = new Set();
    for (const o of opts) {
      if (o?.seriesId && !seen.has(o.seriesId)) {
        seen.add(o.seriesId);
        series.push({ id: o.seriesId, label: o.seriesLabel || "Series" });
      }
    }
  }

  let status = done; // confirmation after the cant form
  if (valid && !showCantForm && !done) {
    try {
      const r = await recordEmailRsvp(post, user, parsed.choice);
      status = r?.status;
    } catch (e) {
      console.error("rsvp via email failed:", e);
    }
  }

  const good = status === "going" || status === "cant" || status === "partial";

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      {showCantForm ? (
        <CantForm token={token} isSeries={isSeries} series={series} title={title} />
      ) : status === "going" || status === "partial" ? (
        <>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckIcon className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
            You&apos;re in, {firstName}.
          </h1>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm">
            <CheckIcon className="h-5 w-5" /> Attending
          </div>
          <p className="mt-3 text-base text-muted">
            <span className="font-medium text-foreground">&ldquo;{title}&rdquo;</span>
          </p>
          {status === "partial" ? (
            <p className="mt-2 text-sm text-muted">
              We&apos;ve noted the series you can&apos;t attend. Pick any remaining
              dates from the email, or finish in the portal.
            </p>
          ) : null}
        </>
      ) : status === "cant" ? (
        <>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-3 text-muted">
            <XIcon className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
            Thanks, {firstName}.
          </h1>
          <p className="mt-3 text-base text-muted">
            We&apos;ve noted that you can&apos;t make{" "}
            <span className="font-medium text-foreground">&ldquo;{title}&rdquo;</span>.
          </p>
        </>
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

      {!showCantForm && (
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
function XIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
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
