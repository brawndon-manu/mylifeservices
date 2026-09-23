import { notFound, redirect } from "next/navigation";
import { deviceLabel, deviceTail, viaLine } from "@/lib/clock-amendment/device";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import BackLink from "@/components/BackLink";
import AmendmentCard from "@/components/clock-amendment/AmendmentCard";
import { loadAmendment, shownName } from "@/lib/clock-amendment/document";
import { COMPANY_TZ } from "@/lib/company-time";
import {
  formNumber, missingPunchText, confirmedOf, correctionsOf, approvalFlags, canApprove,
  clientStage, signerLabel, firstLast, qspFixNeeded, asksPlace,
} from "@/lib/clock-amendment/rules";
import ApproveForm from "./ApproveForm";
import { approveAmendment, chaseAmendment, deleteRehearsal, sendRehearsalTo, resetRehearsal } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clock amendment", robots: { index: false, follow: false } };

// stamps read in company time wherever the server is
const when = (d) => {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: COMPANY_TZ, month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit",
  }).format(new Date(d));
};

// one answer, with what the office had on the call beside it when they changed it
function Row({ label, value, correction }) {
  return (
    <div className="grid gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[170px_1fr]">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="text-sm text-foreground">
        {value || <span className="text-faint">-</span>}
        {correction && (
          <span className="ml-2 text-[12px] text-amber-700 dark:text-amber-300">was &ldquo;{correction.was || "-"}&rdquo; on the call</span>
        )}
      </dd>
    </div>
  );
}

// ONE AMENDMENT, FOR THE OFFICE TO APPROVE. The evidence card, then what the
// person said beside what the office took down, then the two signatures, then
// every flag the rules raise, then the buttons. The document itself is a
// click away at every stage, so the office can read it as the staff member
// will sign it.
export default async function ClockAmendmentPage({ params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) redirect("/portal");
  const { id } = await params;
  const a = await loadAmendment(id);
  if (!a) notFound();

  const staffName = shownName(a.staff);
  const number = formNumber(a);
  const confirmed = confirmedOf(a);
  const corrections = correctionsOf(a);
  const was = (field) => corrections.find((c) => c.field === field) || null;
  const flags = approvalFlags(a);
  const cs = clientStage(a);

  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <BackLink href="/portal/admin/clock-amendments">Back to Clock amendments</BackLink>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[.06em] text-faint">
        Clock amendment · {number}
        {a.testOnly && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-amber-700 dark:text-amber-300">{a.demo ? "demo" : "rehearsal"}</span>}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{staffName} {missingPunchText(a)}.</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {firstLast(a.clientName)} · {a.service} · {a.shiftDate}
        {a.scheduledIn && a.scheduledOut ? `, scheduled ${a.scheduledIn} to ${a.scheduledOut}` : ""}
      </p>

      <div className="mt-6">
        <AmendmentCard a={a} staffName={staffName} />
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-[13px] font-semibold text-foreground">What they said</h2>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
          Taken down by {shownName(a.createdBy)} on {when(a.createdAt)}.
          {a.filledAt ? " Confirmed and signed by the person asked; anything they changed is marked." : " Not yet confirmed by them."}
        </p>
        <dl className="mt-3 divide-y divide-sep">
          <Row label="What happened" value={confirmed.reasonText} correction={was("reasonText")} />
          {(!a.clockedIn || confirmed.actualIn) && <Row label="Service started" value={confirmed.actualIn} correction={was("actualIn")} />}
          <Row label="Service ended" value={confirmed.actualOut} correction={was("actualOut")} />
          {asksPlace(a).in && <Row label="Where they were at clock-in" value={confirmed.placeIn} correction={was("placeIn")} />}
          {asksPlace(a).out && <Row label="Where they were at clock-out" value={confirmed.placeOut} correction={was("placeOut")} />}
        </dl>
        <div className="mt-4 border-t border-border pt-4">
          {a.filledAt ? (
            <div className="flex flex-wrap items-end gap-4">
              {a.staffSignatureUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.staffSignatureUrl} alt="" className="h-14 w-auto max-w-[240px] rounded-md bg-white p-1 ring-1 ring-border" />
              )}
              <p className="text-[12.5px] leading-relaxed text-muted">
                Signed by <b className="font-semibold text-foreground">{a.filledName}</b> on {when(a.filledAt)}{a.filledIp ? ` from ${a.filledIp}` : ""}{deviceLabel(a.filledUa) ? `, ${deviceLabel(a.filledUa)}` : ""}{deviceTail(a.filledDevice) ? ` (${deviceTail(a.filledDevice)})` : ""}.
              </p>
            </div>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-muted">
              {a.sentAt
                ? <>Sent to <b className="font-semibold text-foreground">{shownName(a.recipient)}</b> ({a.sentToEmail}) on {when(a.sentAt)}{a.chaseCount ? `, reminded ${a.chaseCount} ${a.chaseCount === 1 ? "time" : "times"}` : ""}. Not signed yet.</>
                : <>Not sent yet. Send the form below and it goes to <b className="font-semibold text-foreground">{shownName(a.recipient)}</b>.</>}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-[13px] font-semibold text-foreground">Person served</h2>
        {cs === "signed" ? (
          <div className="mt-3 flex flex-wrap items-end gap-4">
            {a.clientSignatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.clientSignatureUrl} alt="" className="h-14 w-auto max-w-[240px] rounded-md bg-white p-1 ring-1 ring-border" />
            )}
            <p className="text-[12.5px] leading-relaxed text-muted">
              <b className="font-semibold text-foreground">{a.clientSigner}</b> ({signerLabel(a.clientSignerKind)}) signed on {when(a.clientSignedAt)}{a.clientSignedIp ? ` from ${a.clientSignedIp}` : ""}{deviceLabel(a.clientSignedUa) ? `, ${deviceLabel(a.clientSignedUa)}` : ""}{deviceTail(a.clientSignedDevice) ? ` (${deviceTail(a.clientSignedDevice)})` : ""}.{viaLine(a.clientSignedVia) ? ` ${viaLine(a.clientSignedVia)}.` : ""}
            </p>
          </div>
        ) : cs === "unavailable" ? (
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            <b className="font-semibold text-rose-700 dark:text-rose-300">Nobody was available to sign.</b> {a.clientUnavailableReason}
          </p>
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed text-muted">Not collected yet. They sign on their own phone from the code on the staff member&apos;s screen, right after the staff signature.</p>
        )}
      </div>

      {flags.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
          <h2 className="text-[13px] font-semibold text-amber-800 dark:text-amber-200">Worth a look before approving</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-amber-900 dark:text-amber-100">
            {flags.map((f) => <li key={f.kind}>{f.text}</li>)}
          </ul>
        </div>
      )}

      {a.approvedAt && (
        <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5">
          <h2 className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-200">Approved</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-emerald-900 dark:text-emerald-100">
            By {shownName(a.approvedBy)} on {when(a.approvedAt)}.
            {a.approvalNote ? ` ${a.approvalNote}` : ""}
            {a.qspFixedIn || a.qspFixedTo || a.qspFixedAt
              ? ` Clock record corrected in QSClock${a.qspFixedIn ? `, in to ${a.qspFixedIn}` : ""}${a.qspFixedTo ? `, out to ${a.qspFixedTo}` : ""}${a.qspFixedAt ? `, on ${when(a.qspFixedAt).slice(0, 8)}` : ""}.`
              : " The punches stand as recorded."}
            {a.mailedAt ? ` Emailed on ${when(a.mailedAt)}.` : " The email did not go."}
          </p>
          <a href={a.pdfUrl || `/portal/admin/clock-amendments/${a.id}/pdf`} target="_blank" rel="noopener" className="mt-3 inline-block text-[13px] font-semibold text-brand underline underline-offset-4">
            Open the signed document
          </a>
          {a.pdfHash && <p className="mt-2 font-mono text-[10px] text-faint">sha256 {a.pdfHash}</p>}
        </div>
      )}

      <div className="mt-6">
        <ApproveForm
          id={a.id}
          ready={canApprove(a)}
          flagged={flags.length > 0}
          fix={qspFixNeeded(a)}
          defaultIn={confirmed.actualIn || a.clockedIn || ""}
          defaultTo={confirmed.actualOut || a.clockedOut || ""}
          unsigned={!a.filledAt && !a.approvedAt}
          neverSent={!a.sentAt}
          testOnly={a.testOnly}
          demo={a.demo}
          approve={approveAmendment}
          chase={chaseAmendment}
          remove={deleteRehearsal}
          sendTo={sendRehearsalTo}
          reset={resetRehearsal}
          lastSent={a.sentAt ? { to: shownName(a.recipient), email: a.sentToEmail, when: when(a.sentAt) } : null}
        />
      </div>
    </section>
  );
}
