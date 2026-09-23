"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "@/app/portal/forms/[id]/fill/SignaturePad";
import { SIGNER_KINDS, signerIsPresent } from "@/lib/clock-amendment/rules";
import { tidyTime, anchorOf } from "@/lib/clock-amendment/typed-time";
import ClientCode from "./ClientCode";

// THE TWO STEPS, TWO PHONES.
//
//   1. the person asked reads what the office took down, corrects anything
//      that is wrong, and signs. their signature turns the office's note into
//      their own statement.
//   2. the person served signs on their own phone, from the code this screen
//      then shows (ClientCode.js). handing this phone over stays as a
//      fallback, and the document says which it was; or the form says who
//      could not sign and why. a missing signature with a reason beside it
//      is a record; one with nothing beside it reads as forgotten.
//
// what happened is their own account in their own words, nothing picked from
// a list. the signer kinds come from rules.js, so the form, the office screen
// and the document all say the same words.

// the id this phone keeps, so the same phone reads the same next time and a
// different phone reads differently; beside the address, which two phones on
// one Wi-Fi share. nothing about the person, only about the device.
function deviceId() {
  try {
    const k = "mls-device";
    let v = window.localStorage.getItem(k);
    if (!v) {
      v = (window.crypto?.randomUUID?.() || `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
      window.localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return null;
  }
}
const ERRORS = {
  notfound: "This link does not open anything any more.",
  approved: "This addendum has already been approved and cannot be changed.",
  signed: "This form has already been signed.",
  unsigned: "The staff signature has to come first.",
  done: "The person served has already answered.",
  reason: "Say what happened.",
  times: "The missing time is needed, as a time of day.",
  place: "Say where you were.",
  name: "A name is needed.",
  attest: "Tick the confirmation before signing.",
  signature: "Draw your signature.",
  kind: "Say who is signing.",
  why: "Say why nobody could sign.",
  failed: "Something went wrong. Please try again.",
};

const field =
  "min-h-[44px] w-full rounded-[9px] border border-border-strong bg-surface px-3 py-2 text-[15px] text-foreground outline-none focus-visible:border-brand";

export default function AmendmentSign({ token, view, staffName, recipientName, intake, confirmed, suggested, confirmAndSign, clientSign, clientHalfStatus, refreshClientCode, emailClientLink }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);
  // the fallback: the person served signs on this phone after all
  const [handoff, setHandoff] = useState(false);

  // a bare "7" is read against the shift: nearest the scheduled end for the
  // clock-out, nearest the scheduled start for the clock-in
  const inAnchor = anchorOf(view.scheduledIn);
  const outAnchor = anchorOf(view.scheduledOut);

  // step one
  const [reasonText, setReasonText] = useState(confirmed.reasonText || "");
  const [actualIn, setActualIn] = useState(confirmed.actualIn || (view.asksStart ? suggested.in || "" : ""));
  const [actualOut, setActualOut] = useState(confirmed.actualOut || (view.asksEnd ? suggested.out || "" : ""));
  const [placeIn, setPlaceIn] = useState(confirmed.placeIn || "");
  const [placeOut, setPlaceOut] = useState(confirmed.placeOut || "");
  const [attested, setAttested] = useState(false);
  const [padFor, setPadFor] = useState(null);

  // step two
  const [signerKind, setSignerKind] = useState("client");
  const [signerName, setSignerName] = useState(view.clientName || "");
  const [why, setWhy] = useState("");

  const done = (res, after) => {
    if (res?.ok) { setErr(null); after?.(); router.refresh(); }
    else setErr(ERRORS[res?.error] || ERRORS.failed);
  };

  const signStaff = (png) => {
    setPadFor(null);
    start(async () => {
      const res = await confirmAndSign(token, {
        reasonText,
        actualIn: tidyTime(actualIn, inAnchor),
        actualOut: tidyTime(actualOut, outAnchor),
        placeIn,
        placeOut,
        signedName: recipientName,
        attested,
        signaturePng: png,
        deviceId: deviceId(),
      });
      done(res);
    });
  };

  const signClient = (png) => {
    setPadFor(null);
    start(async () => {
      const res = await clientSign(token, { signerKind, signerName, signaturePng: png, deviceId: deviceId() });
      done(res);
    });
  };

  const sayUnavailable = () => {
    start(async () => {
      const res = await clientSign(token, { signerKind: "unavailable", unavailableReason: why });
      done(res);
    });
  };

  // ---- already approved: nothing to do but read
  if (view.approvedAt) {
    return (
      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Approved by the office.</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">The signed document has been emailed to you and to the office. Nothing else is needed.</p>
      </section>
    );
  }

  // ---- step one: confirm and sign
  if (!view.filledAt) {
    const changed = (k, v) => String(intake[k] || "").trim() !== String(v || "").trim();
    return (
      <section className="mt-6">
        <h2 className="text-[17px] font-semibold text-foreground">You told the office</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          This is what the office took down on the phone. Change anything that is wrong, then sign. Your
          signature makes it your statement.
        </p>

        <div className="mt-5">
          <label className="block text-[15px] font-semibold text-foreground" htmlFor="words">What happened</label>
          <p className="mb-2 mt-0.5 text-[12.5px] text-muted">In your own words: why the clock is missing the punch, and what the visit was.</p>
          <textarea id="words" rows={4} value={reasonText} onChange={(e) => setReasonText(e.target.value)} className={`${field} min-h-[108px]`} />
          {changed("reasonText", reasonText) && intake.reasonText && (
            <p className="mt-1 text-[11.5px] text-amber-700 dark:text-amber-300">The office had: &ldquo;{intake.reasonText}&rdquo;. Your version is what will be signed.</p>
          )}
        </div>

        {view.asksStart && (
          <div className="mt-5">
            <label className="block text-[15px] font-semibold text-foreground" htmlFor="in">What time did the service start?</label>
            <input
              id="in" value={actualIn} inputMode="numeric"
              onChange={(e) => setActualIn(e.target.value)}
              onBlur={(e) => setActualIn(tidyTime(e.target.value, inAnchor))}
              placeholder="9:00 AM" className={`mt-2 ${field} max-w-[160px] font-medium tabular-nums`}
            />
            {view.clockedIn && !view.inAsClocked && (
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                The clock has you in at <b className="font-semibold text-foreground">{view.clockedIn}</b>
                {view.noteStart ? <>, and your note says <b className="font-semibold text-foreground">{view.noteStart}</b></> : null}.
              </p>
            )}
            {view.inAsClocked && (
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                As clocked. The punch went in without a location, so change the time only if the clock is wrong.
              </p>
            )}
            {changed("actualIn", actualIn) && intake.actualIn && (
              <p className="mt-1 text-[11.5px] text-amber-700 dark:text-amber-300">The office had {intake.actualIn}.</p>
            )}
          </div>
        )}
        {view.asksEnd && (
          <div className="mt-5">
            <label className="block text-[15px] font-semibold text-foreground" htmlFor="out">What time did the service end?</label>
            <input
              id="out" value={actualOut} inputMode="numeric"
              onChange={(e) => setActualOut(e.target.value)}
              onBlur={(e) => setActualOut(tidyTime(e.target.value, outAnchor))}
              placeholder="1:00 PM" className={`mt-2 ${field} max-w-[160px] font-medium tabular-nums`}
            />
            {view.noteStart && view.noteEnd && !view.outAsClocked && (
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                Your note for this visit says <b className="font-semibold text-foreground">{view.noteStart} to {view.noteEnd}</b>
                {view.noteFiled ? <>, and you signed it at <b className="font-semibold text-foreground">{view.noteFiled}</b></> : null}. Change the time if the visit ended before that.
              </p>
            )}
            {view.outAsClocked && (
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">As clocked. The punch went in without a location, so change the time only if the clock is wrong.</p>
            )}
            {changed("actualOut", actualOut) && intake.actualOut && (
              <p className="mt-1 text-[11.5px] text-amber-700 dark:text-amber-300">The office had {intake.actualOut}.</p>
            )}
          </div>
        )}

        {(view.asksPlace.in || view.asksPlace.out) && (
          <div className="mt-5 space-y-4">
            {view.asksPlace.in && (
              <div>
                <label className="block text-[15px] font-semibold text-foreground" htmlFor="place-in">Where were you when you clocked in?</label>
                <p className="mb-2 mt-0.5 text-[12.5px] text-muted">
                  {view.clockedIn ? "The clock has the time but not the place." : "There is no punch, so the clock has neither the time nor the place."}
                </p>
                <input id="place-in" value={placeIn} onChange={(e) => setPlaceIn(e.target.value)} placeholder={`${view.clientName}'s home`} className={field} />
                {changed("placeIn", placeIn) && intake.placeIn && (
                  <p className="mt-1 text-[11.5px] text-amber-700 dark:text-amber-300">The office had: &ldquo;{intake.placeIn}&rdquo;.</p>
                )}
              </div>
            )}
            {view.asksPlace.out && (
              <div>
                <label className="block text-[15px] font-semibold text-foreground" htmlFor="place-out">Where were you when you clocked out?</label>
                <p className="mb-2 mt-0.5 text-[12.5px] text-muted">
                  {view.clockedOut ? "The clock has the time but not the place." : "There is no punch, so say where the visit ended."}
                </p>
                <input id="place-out" value={placeOut} onChange={(e) => setPlaceOut(e.target.value)} placeholder={`${view.clientName}'s home`} className={field} />
                {changed("placeOut", placeOut) && intake.placeOut && (
                  <p className="mt-1 text-[11.5px] text-amber-700 dark:text-amber-300">The office had: &ldquo;{intake.placeOut}&rdquo;.</p>
                )}
              </div>
            )}
          </div>
        )}

        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-[10px] border border-border bg-surface px-3 py-3 text-[13px] leading-relaxed text-foreground">
          <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-brand" />
          <span>
            I confirm that {recipientName === staffName ? "I provided" : `${staffName} provided`} the service described above to {view.clientName} on {view.shiftDate}
            {actualIn ? ` from ${tidyTime(actualIn, inAnchor)}` : ""}{actualOut ? ` until ${tidyTime(actualOut, outAnchor)}` : ""}
            {placeIn.trim() && placeOut.trim() && placeIn.trim() === placeOut.trim() ? ` at ${placeIn.trim()}` : `${placeIn.trim() ? `, starting at ${placeIn.trim()}` : ""}${placeOut.trim() ? `, ending at ${placeOut.trim()}` : ""}`}, that the clock record is incomplete for the reason given, and that this record supports the hours billed.
          </span>
        </label>

        {err && <p className="mt-3 rounded-[9px] border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-700 dark:text-rose-300">{err}</p>}

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!reasonText.trim()) return setErr(ERRORS.reason);
            const tin = tidyTime(actualIn, inAnchor);
            const tout = tidyTime(actualOut, outAnchor);
            setActualIn(tin);
            setActualOut(tout);
            if ((view.asksEnd && !tout) || (view.asksStart && !tin)) return setErr(ERRORS.times);
            if ((view.asksPlace.in && !placeIn.trim()) || (view.asksPlace.out && !placeOut.trim())) return setErr(ERRORS.place);
            if (!attested) return setErr(ERRORS.attest);
            setErr(null);
            setPadFor("staff");
          }}
          className="mt-5 min-h-[48px] w-full rounded-[12px] bg-brand text-[15px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : `Sign as ${recipientName}`}
        </button>
        <p className="mt-3 text-center text-[12.5px] text-muted">Then <b className="font-semibold text-foreground">{view.clientName}</b> signs on their own phone, from a code this screen will show.</p>

        {padFor === "staff" && <SignaturePad onSave={signStaff} onClose={() => setPadFor(null)} />}
      </section>
    );
  }

  // ---- step two: the person served, on their own phone
  if (view.clientStage === "waiting" && !handoff) {
    return (
      <section className="mt-6">
        <p className="rounded-[9px] border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-800 dark:text-emerald-200">
          Signed by {view.filledName}. Thank you.
        </p>
        <ClientCode
          token={token}
          view={view}
          staffName={staffName}
          endTime={confirmed.actualOut || null}
          clientHalfStatus={clientHalfStatus}
          refreshClientCode={refreshClientCode}
          emailClientLink={emailClientLink}
          onHandoff={() => { setErr(null); setHandoff(true); }}
        />
      </section>
    );
  }

  // ---- step two, the fallback: the person served on this phone
  if (view.clientStage === "waiting") {
    return (
      <section className="mt-6">
        <p className="rounded-[9px] border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-800 dark:text-emerald-200">
          Signed by {view.filledName}. Thank you.
        </p>
        <h2 className="mt-5 text-[17px] font-semibold text-foreground">Now hand the phone to {view.clientName}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          They confirm that {staffName} was there on {view.shiftDate}{confirmed.actualOut ? ` and left at about ${confirmed.actualOut}` : ""}. Not a clock reading, just that the visit happened.
          The document will say the signature was made on this phone.{" "}
          <button type="button" onClick={() => setHandoff(false)} className="text-brand underline underline-offset-4">Back to the code</button>
        </p>

        <div className="mt-4">
          <p className="text-[15px] font-semibold text-foreground">Who is signing</p>
          <div className="mt-2 space-y-1.5">
            {SIGNER_KINDS.map((s) => (
              <label key={s.kind} className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[10px] border px-3 text-[15px] ${signerKind === s.kind ? "border-brand bg-surface" : "border-border bg-surface"}`}>
                <input type="radio" name="signer" value={s.kind} checked={signerKind === s.kind} onChange={() => setSignerKind(s.kind)} className="h-4 w-4 accent-brand" />
                <span className="text-foreground">{s.label}</span>
              </label>
            ))}
          </div>
        </div>

        {signerIsPresent(signerKind) ? (
          <>
            <div className="mt-4">
              <label className="block text-[15px] font-semibold text-foreground" htmlFor="signer">Name</label>
              <input id="signer" value={signerName} onChange={(e) => setSignerName(e.target.value)} className={`mt-2 ${field}`} />
            </div>
            {err && <p className="mt-3 rounded-[9px] border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-700 dark:text-rose-300">{err}</p>}
            <button
              type="button"
              disabled={pending}
              onClick={() => { if (!signerName.trim()) return setErr(ERRORS.name); setErr(null); setPadFor("client"); }}
              className="mt-5 min-h-[48px] w-full rounded-[12px] bg-brand text-[15px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Saving…" : `Sign as ${signerName.trim() || "the person served"}`}
            </button>
          </>
        ) : (
          <>
            <div className="mt-4">
              <label className="block text-[15px] font-semibold text-foreground" htmlFor="why">Why nobody could sign</label>
              <textarea id="why" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} className={`mt-2 ${field} min-h-[72px]`} />
            </div>
            {err && <p className="mt-3 rounded-[9px] border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-700 dark:text-rose-300">{err}</p>}
            <button
              type="button"
              disabled={pending}
              onClick={() => { if (!why.trim()) return setErr(ERRORS.why); setErr(null); sayUnavailable(); }}
              className="mt-5 min-h-[48px] w-full rounded-[12px] border border-border-strong bg-surface text-[15px] font-semibold text-foreground transition hover:bg-fill disabled:opacity-60"
            >
              {pending ? "Saving…" : "Record that nobody was available"}
            </button>
          </>
        )}

        {padFor === "client" && <SignaturePad onSave={signClient} onClose={() => setPadFor(null)} />}
      </section>
    );
  }

  // ---- both halves in: waiting on the office
  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-5">
      <p className="text-sm font-semibold text-foreground">All done. Thank you.</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Signed by {view.filledName}
        {view.clientStage === "signed"
          ? ` and by ${view.clientSigner}${view.clientSignedVia === "own" ? ", on their own device" : view.clientSignedVia === "email" ? ", from the emailed link" : view.clientSignedVia === "staff" ? ", on this phone" : ""}.`
          : `. Nobody was available to sign for the person served: ${view.clientUnavailableReason}`}
        {" "}The office will approve it and email you the signed copy.
      </p>
    </section>
  );
}
