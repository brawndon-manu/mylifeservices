import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import { verifyAmendmentToken } from "@/lib/clock-amendment/token";
import { missingPunchText, intakeOf, confirmedOf, startingTimes, clientStage, formNumber, firstLast, asksStart, asksEnd, asksPlace, issueOf } from "@/lib/clock-amendment/rules";
import AmendmentCard from "@/components/clock-amendment/AmendmentCard";
import AmendmentSign from "./AmendmentSign";
import { confirmAndSign, clientSign } from "./actions";

// THE FORM, OPENED FROM THE EMAIL, WITH OR WITHOUT A LOGIN. the signed token
// is the credential and it opens exactly this one amendment for exactly the
// person it was sent to. outside /portal so the proxy does not bounce it, and
// listed with the other share links so a maintenance window does not either.
export const dynamic = "force-dynamic";
export const metadata = { title: "Clock amendment · My Life Services", robots: { index: false, follow: false } };

export default async function AmendmentFromLinkPage({ params }) {
  const { token } = await params;
  const id = verifyAmendmentToken(token);
  if (!id) notFound();

  const a = await prisma.clockAmendment.findUnique({
    where: { id },
    include: {
      staff: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
      recipient: { select: { name: true, preferredFirstName: true, preferredLastName: true } },
    },
  });
  if (!a) notFound();

  const staffName = preferredName(a.staff) || a.staff?.name || "";
  const recipientName = preferredName(a.recipient) || a.recipient?.name || "";
  const intake = intakeOf(a);
  const confirmed = confirmedOf(a);
  const suggested = startingTimes(a);
  // the client component gets plain values only
  const view = {
    id: a.id,
    number: formNumber(a),
    shiftDate: a.shiftDate,
    clientName: firstLast(a.clientName),
    service: a.service,
    clockedIn: a.clockedIn,
    clockedOut: a.clockedOut,
    // which times the form asks for: the start when it is missing or late,
    // the end when it is missing
    asksStart: asksStart(a),
    asksEnd: asksEnd(a),
    asksPlace: asksPlace(a),
    issue: issueOf(a),
    scheduledIn: a.scheduledIn,
    scheduledOut: a.scheduledOut,
    noteStart: a.note?.start || null,
    noteEnd: a.note?.end || null,
    noteFiled: a.note?.signedAt || null,
    filledAt: a.filledAt ? a.filledAt.toISOString() : null,
    filledName: a.filledName,
    approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null,
    clientStage: clientStage(a),
    clientSigner: a.clientSigner,
    clientUnavailableReason: a.clientUnavailableReason,
    testOnly: a.testOnly,
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <p className="text-[11px] font-semibold uppercase tracking-[.06em] text-faint">Clock amendment · {view.number}</p>
      <h1 className="mt-2 text-[22px] font-semibold leading-tight tracking-tight text-foreground sm:text-[26px]">
        {staffName} {missingPunchText(a)}.
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {view.clientName} · {a.service}
        <br />
        {a.shiftDate}{a.scheduledIn && a.scheduledOut ? `, scheduled ${a.scheduledIn} to ${a.scheduledOut}` : ""}
      </p>
      {a.testOnly && (
        <p className="mt-3 rounded-[9px] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-200">
          This is a rehearsal. Nothing here goes to anybody but the office.
        </p>
      )}

      <div className="mt-6">
        <AmendmentCard a={a} staffName={staffName} />
      </div>

      <AmendmentSign
        token={token}
        view={view}
        staffName={staffName}
        recipientName={recipientName}
        intake={intake}
        confirmed={confirmed}
        suggested={suggested}
        confirmAndSign={confirmAndSign}
        clientSign={clientSign}
      />
    </main>
  );
}
