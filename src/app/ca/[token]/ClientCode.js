"use client";

// THE CODE THE PERSON SERVED SCANS, on the staff member's screen once they
// have signed. nothing is handed over: the client opens the camera, the
// client-only page opens on their own phone, they sign there, and this
// screen says so on its own. two devices, two signatures.
//
// the QR is drawn here from the short link at the highest error-correction
// level, so the logo over its middle costs it nothing a phone camera minds.
// the typed line under it is the same link for a camera that will not focus.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import qrcode from "qrcode-generator";

function Qr({ text, size = 176 }) {
  const cells = useMemo(() => {
    const q = qrcode(0, "H");
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    const dark = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) dark.push([r, c]);
    return { n, dark };
  }, [text]);
  const cell = size / cells.n;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Code that opens the signing page">
      {cells.dark.map(([r, c]) => (
        <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell + 0.15} height={cell + 0.15} fill="#000" />
      ))}
    </svg>
  );
}

export default function ClientCode({ token, view, staffName, endTime, clientHalfStatus, refreshClientCode, emailClientLink, onHandoff }) {
  const router = useRouter();
  const [code, setCode] = useState(view.clientCode);
  const [link, setLink] = useState(view.clientLink);
  const [expired, setExpired] = useState(view.codeExpired);
  const [emailing, setEmailing] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(view.clientLinkEmail || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // ask every few seconds whether the client half has landed; the page
  // re-reads itself the moment it has, so the thank-you appears on its own
  useEffect(() => {
    let live = true;
    const tick = async () => {
      let s = null;
      try { s = await clientHalfStatus(token); } catch { s = null; }
      if (!live || !s?.ok) return;
      if (s.signed || s.unavailable || s.approved) { router.refresh(); return; }
      if (s.expired !== expired) setExpired(s.expired);
    };
    const t = setInterval(tick, 4000);
    return () => { live = false; clearInterval(t); };
  }, [token, clientHalfStatus, router, expired]);

  const newCode = async () => {
    setBusy(true);
    setErr(null);
    let res = null;
    try { res = await refreshClientCode(token); } catch { res = null; }
    setBusy(false);
    if (!res?.ok) { setErr("Could not make a new code. Please try again."); return; }
    setCode(res.code);
    setLink(res.link);
    setExpired(false);
  };

  const sendLink = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr("That does not look like an email address."); return; }
    setBusy(true);
    setErr(null);
    let res = null;
    try { res = await emailClientLink(token, email.trim()); } catch { res = null; }
    setBusy(false);
    if (!res?.ok) { setErr(res?.error === "send" ? "The email could not be sent." : "Could not send the link. Please try again."); return; }
    setSent(email.trim());
    setEmailing(false);
  };

  const shown = link ? link.replace(/^https?:\/\/(www\.)?/, "") : null;

  return (
    <div className="mt-5">
      <h2 className="text-[17px] font-semibold text-foreground">Now {view.clientName} signs, on their own phone</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Ask them to open their camera and point it at the code. The form opens on their phone and they sign there.
        Nothing is handed over, and their signature arrives from their own device.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <div className="relative mx-auto w-[196px] rounded-xl bg-white p-2.5 sm:mx-0">
          {link && !expired ? (
            <>
              <Qr text={link} />
              {/* the logo sits in the middle on a white pad; level H leaves
                  room for it */}
              <div className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[11px] bg-white">
                <img src="/icon-192.png" alt="" width={40} height={40} className="rounded-[9px]" />
              </div>
            </>
          ) : (
            <div className="flex h-[176px] w-[176px] items-center justify-center rounded-lg bg-neutral-100 px-4 text-center text-[12.5px] text-neutral-600">
              {expired ? "This code has expired." : "No code yet."}
            </div>
          )}
        </div>
        <div className="min-w-0">
          {shown && !expired && (
            <>
              <p className="text-[11px] text-faint">Or type this on their phone</p>
              <p className="mt-1 break-all font-mono text-[14px] text-foreground">{shown}</p>
            </>
          )}
          {expired && (
            <button type="button" disabled={busy} onClick={newCode} className="mt-1 min-h-[44px] rounded-[10px] border border-border-strong bg-surface px-4 text-[14px] font-semibold text-foreground">
              {busy ? "One moment…" : "Show a new code"}
            </button>
          )}
          <p className="mt-3 flex items-center gap-2 rounded-[9px] bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            Waiting for {view.clientName} to open the code…
          </p>
          {sent && <p className="mt-2 text-[12px] text-emerald-700 dark:text-emerald-300">The link was emailed to {sent}.</p>}
          {err && <p className="mt-2 text-[12px] text-rose-700 dark:text-rose-300">{err}</p>}
          <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
            Can&rsquo;t scan?{" "}
            <button type="button" onClick={() => { setEmailing((v) => !v); setErr(null); }} className="text-brand underline underline-offset-4">Email the link to a parent or representative</button>
            {" · "}
            <button type="button" onClick={onHandoff} className="text-brand underline underline-offset-4">Sign on this phone instead</button>
            {" "}(the document will say so)
          </p>
          {emailing && (
            <div className="mt-2 flex gap-2">
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"
                className="min-h-[44px] min-w-0 flex-1 rounded-[9px] border border-border-strong bg-surface px-3 text-[15px] text-foreground outline-none focus-visible:border-brand"
              />
              <button type="button" disabled={busy} onClick={sendLink} className="min-h-[44px] rounded-[10px] bg-brand px-4 text-[14px] font-semibold text-white disabled:opacity-60">
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-muted">
        They confirm that {staffName} was there on {view.shiftDate}{endTime ? ` and left at about ${endTime}` : ""}. Not a clock reading, just that the visit happened.
      </p>
    </div>
  );
}
