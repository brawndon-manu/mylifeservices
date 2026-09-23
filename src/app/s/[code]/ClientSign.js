"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "@/app/portal/forms/[id]/fill/SignaturePad";
import { SIGNER_KINDS, signerIsPresent } from "@/lib/clock-amendment/rules";

// ONE QUESTION ON THE PERSON SERVED'S PHONE: who is signing, their name, and
// their signature. the words match the hand-off on the staff member's phone,
// so the person sees the same form whichever phone it is on.
const ERRORS = {
  notfound: "This code does not open anything any more.",
  approved: "This visit has already been approved.",
  unsigned: "The staff member signs first.",
  done: "This visit has already been confirmed.",
  expired: "This code has expired. Ask for a new one.",
  kind: "Say who is signing.",
  name: "A name is needed.",
  signature: "Draw your signature.",
  failed: "Something went wrong. Please try again.",
};

const field =
  "min-h-[44px] w-full rounded-[9px] border border-border-strong bg-surface px-3 py-2 text-[15px] text-foreground outline-none focus-visible:border-brand";

// the id this phone keeps, so the record can say the same phone or a
// different one; nothing about the person, only about the device
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

export default function ClientSign({ code, view, clientSignByCode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);
  const [kind, setKind] = useState("client");
  const [name, setName] = useState(view.clientName || "");
  const [pad, setPad] = useState(false);
  const [signed, setSigned] = useState(false);

  const present = SIGNER_KINDS.filter((s) => signerIsPresent(s.kind));

  const sign = (png) => {
    setPad(false);
    start(async () => {
      let res = null;
      try { res = await clientSignByCode(code, { signerKind: kind, signerName: name, signaturePng: png, deviceId: deviceId() }); }
      catch { res = null; }
      if (res?.ok) { setErr(null); setSigned(true); router.refresh(); }
      else setErr(ERRORS[res?.error] || ERRORS.failed);
    });
  };

  if (signed) {
    return (
      <section className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5">
        <p className="text-[15px] font-semibold text-emerald-800 dark:text-emerald-200">Thank you. The visit is confirmed.</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">You can close this page.</p>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <p className="text-[15px] font-semibold text-foreground">I am</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {present.map((s) => (
          <button
            key={s.kind} type="button" aria-pressed={kind === s.kind}
            onClick={() => { setKind(s.kind); if (s.kind === "client") setName(view.clientName || ""); else if (name === view.clientName) setName(""); }}
            className={`min-h-[40px] rounded-full border px-3.5 text-[13px] font-semibold ${kind === s.kind ? "border-brand bg-brand text-white" : "border-border-strong bg-surface text-foreground"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <label className="mt-5 block text-[15px] font-semibold text-foreground" htmlFor="signer">Your name</label>
      <input id="signer" value={name} onChange={(e) => setName(e.target.value)} className={`mt-2 ${field}`} autoComplete="name" />

      {err && <p className="mt-3 rounded-[9px] border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-700 dark:text-rose-300">{err}</p>}

      <button
        type="button"
        disabled={pending}
        onClick={() => { if (!name.trim()) return setErr(ERRORS.name); setErr(null); setPad(true); }}
        className="mt-5 min-h-[48px] w-full rounded-[12px] bg-brand text-[15px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Sign"}
      </button>
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Recorded with your signature: the time, this phone&rsquo;s network address and browser, and a device id kept on this phone.
      </p>

      {pad && <SignaturePad onSave={sign} onClose={() => setPad(false)} />}
    </section>
  );
}
