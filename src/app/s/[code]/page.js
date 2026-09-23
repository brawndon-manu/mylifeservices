import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import { normalizeCode, codeExpired } from "@/lib/clock-amendment/client-code";
import { confirmedOf, firstLast, clientStage } from "@/lib/clock-amendment/rules";
import ClientSign from "./ClientSign";
import { clientSignByCode } from "./actions";

// THE CLIENT HALF OF A CLOCK AMENDMENT, ON THE PERSON SERVED'S OWN PHONE.
//
// opened by scanning the code on the staff member's screen, or by typing the
// short link under it, or from the link emailed to a representative. it holds
// one question: did this visit happen. no login, no portal, nothing of the
// staff member's half to edit. the code is the credential and it dies with
// the California day it was minted in.
//
// outside /portal so the proxy does not bounce it, and listed with the other
// share links so a maintenance window does not either.
export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm the visit · My Life Services", robots: { index: false, follow: false } };

function Note({ children }) {
  return (
    <main className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[.06em] text-faint">My Life Services</p>
      <p className="mt-3 text-[15px] leading-relaxed text-foreground">{children}</p>
    </main>
  );
}

export default async function ClientSignPage({ params }) {
  const { code: raw } = await params;
  const code = normalizeCode(raw);
  const a = code
    ? await prisma.clockAmendment.findUnique({
      where: { clientCode: code },
      include: { staff: { select: { name: true, preferredFirstName: true, preferredLastName: true } } },
    })
    : null;
  if (!a) return <Note>This code does not open anything. Check it against the screen it came from.</Note>;
  if (a.approvedAt) return <Note>This visit has already been confirmed and approved. Nothing else is needed.</Note>;
  if (!a.filledAt) return <Note>This form is not ready yet: the staff member signs first.</Note>;
  if (clientStage(a) !== "waiting") return <Note>This visit has already been confirmed. Thank you.</Note>;
  const staffName = preferredName(a.staff) || a.staff?.name || "the staff member";
  if (codeExpired(a.clientCodeExpiresAt)) {
    return <Note>This code has expired. Ask {staffName} to show a new one on their screen.</Note>;
  }

  const c = confirmedOf(a);
  const view = {
    staffName,
    clientName: firstLast(a.clientName) || "the person served",
    service: a.service,
    shiftDate: a.shiftDate,
    from: c.actualIn || a.clockedIn || a.scheduledIn || null,
    to: c.actualOut || a.clockedOut || a.scheduledOut || null,
    testOnly: a.testOnly,
  };

  return (
    <main className="mx-auto max-w-md px-4 py-8 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[.06em] text-faint">My Life Services</p>
      <h1 className="mt-2 text-[22px] font-semibold leading-tight tracking-tight text-foreground">Confirm the visit</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        {view.staffName} says the visit with you on <b className="font-semibold text-foreground">{view.shiftDate}</b>
        {view.from && view.to ? <> ran <b className="font-semibold text-foreground">{view.from} to {view.to}</b></> : null}. Sign below if that is right.
      </p>
      {view.testOnly && (
        <p className="mt-3 rounded-[9px] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-200">
          This is a rehearsal. Nothing here goes to anybody but the office.
        </p>
      )}
      <ClientSign code={raw} view={view} clientSignByCode={clientSignByCode} />
    </main>
  );
}
