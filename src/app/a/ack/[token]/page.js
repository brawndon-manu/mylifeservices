import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { verifyAckToken } from "@/lib/ack-token";
import { firstNameOf } from "@/lib/contacts";
import { acknowledgeFromEmail } from "../actions";

// the landing page for the email ack link. lives outside /portal so proxy.js
// doesnt bounce it to login - the signed token IS the credential.
//
// NOTHING RECORDS ON LOAD ANY MORE, and it has to stay that way: mail scanners
// fetch every link in a message, so the old record-on-view behavior was
// acknowledging policies on people's behalf the moment their inbox scanned the
// email - and HR freezes QSP accounts off these records. Opening this page
// shows the announcement and a button; pressing the button records, through
// acknowledgeFromEmail. Same rule as the RSVP landing next door.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Acknowledge · My Life Services",
  robots: { index: false, follow: false },
};

export default async function AckPage({ params, searchParams }) {
  const { token } = await params;
  const sp = await searchParams;
  const parsed = verifyAckToken(token);

  let valid = false;
  let acked = false;
  let needsSign = false;
  let firstName = "there";
  let title = "";
  let announcementId = null;

  if (parsed) {
    const [announcement, user] = await Promise.all([
      prisma.announcement.findUnique({
        where: { id: parsed.announcementId },
        select: {
          id: true,
          title: true,
          content: true,
          requireAck: true,
          deletedAt: true,
          // a post with a form is finished by SIGNING it, not by a tick
          formId: true,
          form: { select: { fillable: true } },
        },
      }),
      prisma.user.findUnique({
        where: { id: parsed.userId },
        select: {
          id: true,
          name: true,
          preferredFirstName: true,
          preferredLastName: true,
          deactivatedAt: true,
        },
      }),
    ]);

    if (
      announcement &&
      !announcement.deletedAt &&
      announcement.requireAck &&
      user &&
      !user.deactivatedAt
    ) {
      valid = true;
      firstName = firstNameOf(user) || "there";
      title = announcement.title || (announcement.content || "").slice(0, 80);
      announcementId = announcement.id;
      needsSign = !!(announcement.formId && announcement.form?.fillable);
      // someone who already acknowledged - through this link, the portal or a
      // meeting RSVP - goes straight to the thanks screen rather than being
      // asked to press a button they have already pressed
      acked = !!(await prisma.announcementAck.findUnique({
        where: {
          announcementId_userId: {
            announcementId: announcement.id,
            userId: user.id,
          },
        },
        select: { userId: true },
      }));
    }
  }

  const done = acked || sp?.done === "1";

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      {!valid ? (
        <>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-3 text-muted">
            <LinkOffIcon className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
            This link isn&apos;t valid
          </h1>
          <p className="mt-2 text-base text-muted">
            It may have expired or the announcement was removed. Sign in to the
            portal to read it and acknowledge there.
          </p>
          <Link
            href="/portal/announcements"
            className="mt-6 text-sm font-medium text-brand transition hover:text-brand-dark"
          >
            Go to Announcements →
          </Link>
        </>
      ) : done ? (
        <>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckIcon className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
            Thanks, {firstName}.
          </h1>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm">
            <CheckIcon className="h-5 w-5" /> You have acknowledged this!
          </div>
          <p className="mt-3 text-base text-muted">
            <span className="font-medium text-foreground">
              &ldquo;{title}&rdquo;
            </span>
          </p>
          <Link
            href={`/portal/announcements/${announcementId}`}
            className="mt-6 text-sm font-medium text-brand transition hover:text-brand-dark"
          >
            Open it in the portal →
          </Link>
        </>
      ) : (
        <>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-brand">
            <CheckIcon className="h-8 w-8" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
            Hi {firstName}.
          </h1>
          <p className="mt-3 text-base text-muted">
            <span className="font-medium text-foreground">
              &ldquo;{title}&rdquo;
            </span>
          </p>
          <p className="mt-2 text-base text-muted">
            {needsSign
              ? "This announcement comes with a document to sign. The button takes you to it and records that you opened it."
              : "Pressing the button records your acknowledgment."}
          </p>
          <form action={acknowledgeFromEmail.bind(null, token)} className="mt-6">
            <button
              type="submit"
              className="rounded-full bg-brand px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-dark"
            >
              {needsSign ? "Review and sign" : "I acknowledge"}
            </button>
          </form>
          <Link
            href={`/portal/announcements/${announcementId}`}
            className="mt-6 text-sm font-medium text-brand transition hover:text-brand-dark"
          >
            Read it in the portal first →
          </Link>
        </>
      )}
    </section>
  );
}

function CheckIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function LinkOffIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 3.5 8.5M3 3l18 18" />
    </svg>
  );
}
