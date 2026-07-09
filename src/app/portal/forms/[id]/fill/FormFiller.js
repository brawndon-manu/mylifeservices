"use client";

// on-form PDF filler. renders the real PDF pages (PDF.js) and overlays input
// boxes exactly where the AcroForm fields are (positions read with pdf-lib), so
// it looks and fills like the actual form. on download it stamps the answers
// into the real PDF (pdf-lib) - entirely in the browser, so the filled copy
// (client info) never touches the server.
import { useEffect, useRef, useState } from "react";
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFTextField,
  PDFCheckBox,
  PDFSignature,
} from "pdf-lib";
import SignaturePad from "./SignaturePad";

const RICH_TEXT_FLAG = 1 << 25;
const WORKER_SRC = "/pdf.worker.min.mjs";
const MAX_WIDTH = 880;

// a real AcroForm signature field always gets a draw box. some forms instead use
// a plain text field named "...signature..." for the signature, so match those
// too - but NOT a "signature date" text field (that's the date beside it).
const isSignatureName = (name) => /signature/i.test(name || "") && !/date/i.test(name || "");

// normalize a widget rectangle: some fields store the corners reversed, so
// getRectangle() hands back a negative width/height and the overlay lands wrong.
function normRect(r) {
  return {
    x: Math.min(r.x, r.x + r.width),
    y: Math.min(r.y, r.y + r.height),
    width: Math.abs(r.width),
    height: Math.abs(r.height),
  };
}

function slugify(s) {
  return (
    (s || "form").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "form"
  );
}

function sendErrorText(code) {
  return (
    {
      norecipients: "This form isn't set up for email submission yet.",
      norecipient: "Pick who this goes to first.",
      info: "Enter your name and a valid email up top first.",
      rate: "Too many submissions in a row. Wait a minute and try again.",
      toobig: "The filled form is too large to email. Download it and send it manually.",
      config: "Email isn't configured on the server. Let IT know.",
      auth: "Your session expired. Refresh and sign in again.",
    }[code] || "Couldn't send. Please try again."
  );
}

// a Uint8Array of PDF bytes -> base64 string (chunked so we don't blow the stack).
function bytesToBase64(bytes) {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export default function FormFiller({
  fileUrl,
  title,
  formId,
  reviewTeam = null,
  publicMode = false,
  submitAction,
}) {
  const [status, setStatus] = useState("loading");
  const [pages, setPages] = useState([]); // { url, w, h }
  const [placements, setPlacements] = useState([]); // { name, kind, page, left, top, width, height, multiline }
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(null); // field name being signed
  const [sendOpen, setSendOpen] = useState(false);
  const [sendMsg, setSendMsg] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendErr, setSendErr] = useState(null);
  const [sent, setSent] = useState(false);
  // who this goes to (a picked holder of the form's recipientTitle) + on the
  // public share link the submitter's own name/email (we don't know them).
  const [recipientId, setRecipientId] = useState("");
  const [empName, setEmpName] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const bytesRef = useRef(null);
  const wrapRef = useRef(null);

  const recipients = reviewTeam?.recipients || [];
  const recipientLabel = reviewTeam?.recipientLabel || "reviewer";
  const chosenRecipient = recipients.find((r) => r.id === recipientId) || null;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error("fetch failed");
        const buf = new Uint8Array(await res.arrayBuffer());
        bytesRef.current = buf;

        const W = Math.min(wrapRef.current?.clientWidth || 700, MAX_WIDTH);

        // field positions via pdf-lib (text + checkbox - the types these forms use)
        const doc = await PDFDocument.load(buf, { updateMetadata: false });
        const docPages = doc.getPages();
        const pageIndexOf = (ref) =>
          docPages.findIndex(
            (p) => p.ref.objectNumber === ref.objectNumber && p.ref.generationNumber === ref.generationNumber,
          );
        const pls = [];
        for (const f of doc.getForm().getFields()) {
          // instanceof, NOT f.constructor.name - the production build minifies
          // pdf-lib and mangles the class names, so a string compare would skip
          // every field (forms rendered but had no fill boxes on prod).
          let kind = null;
          if (f instanceof PDFTextField) kind = isSignatureName(f.getName()) ? "signature" : "text";
          else if (f instanceof PDFCheckBox) kind = "checkbox";
          else if (f instanceof PDFSignature) kind = "signature";
          else continue;
          const multiline = kind === "text" && !!f.isMultiline();
          for (const w of f.acroField.getWidgets()) {
            const pref = w.dict.get(PDFName.of("P"));
            const pi = pref ? pageIndexOf(pref) : -1;
            if (pi < 0) continue;
            const pg = docPages[pi];
            const scale = W / pg.getWidth();
            const r = normRect(w.getRectangle());
            pls.push({
              name: f.getName(),
              kind,
              multiline,
              page: pi,
              left: r.x * scale,
              top: (pg.getHeight() - (r.y + r.height)) * scale,
              width: r.width * scale,
              height: r.height * scale,
            });
          }
        }

        // render the page images with PDF.js
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
        const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const imgs = [];
        for (let i = 0; i < pdf.numPages; i++) {
          const page = await pdf.getPage(i + 1);
          const base = page.getViewport({ scale: 1 });
          const scale = W / base.width;
          const vp = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(vp.width);
          canvas.height = Math.ceil(vp.height);
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
          imgs.push({ url: canvas.toDataURL("image/png"), w: base.width * scale, h: base.height * scale });
        }

        if (active) {
          setPlacements(pls);
          setPages(imgs);
          setStatus("ready");
        }
      } catch {
        if (active) setStatus("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [fileUrl]);

  function setVal(name, v) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  // build the filled PDF bytes in the browser - shared by download + send, so
  // the answers only ever leave the page as a finished PDF (on send).
  async function buildPdfBytes() {
      const doc = await PDFDocument.load(bytesRef.current, { updateMetadata: false });
      const form = doc.getForm();
      for (const f of form.getFields()) {
        if (!(f instanceof PDFTextField)) continue;
        const dict = f.acroField.dict;
        const ff = dict.lookup(PDFName.of("Ff"));
        const n = ff && ff.asNumber ? ff.asNumber() : 0;
        if (n & RICH_TEXT_FLAG) dict.set(PDFName.of("Ff"), PDFNumber.of(n & ~RICH_TEXT_FLAG));
        dict.delete(PDFName.of("RV"));
      }
      // de-dupe by field name (a field can have several widgets)
      const seen = new Set();
      for (const p of placements) {
        if (seen.has(p.name)) continue;
        seen.add(p.name);
        const val = values[p.name];
        try {
          if (p.kind === "text") {
            if (val) form.getTextField(p.name).setText(String(val));
          } else if (p.kind === "checkbox") {
            const cb = form.getCheckBox(p.name);
            if (val) cb.check();
            else cb.uncheck();
          }
        } catch {
          // skip a field that won't accept the value
        }
      }

      // collect each drawn signature's rect + page BEFORE flatten, blank its
      // text field, then draw the images AFTER flatten - otherwise the flattened
      // (empty) field appearance paints over the signature.
      const sigPages = doc.getPages();
      const sigPageIndex = (ref) =>
        sigPages.findIndex(
          (pg) =>
            pg.ref.objectNumber === ref.objectNumber &&
            pg.ref.generationNumber === ref.generationNumber,
        );
      const sigStamps = [];
      const sigFieldsToRemove = [];
      for (const f of form.getFields()) {
        const isTextSig = f instanceof PDFTextField && isSignatureName(f.getName());
        const isRealSig = f instanceof PDFSignature;
        if (!isTextSig && !isRealSig) continue;
        const val = values[f.getName()];
        if (typeof val === "string" && val.startsWith("data:image")) {
          for (const w of f.acroField.getWidgets()) {
            const pref = w.dict.get(PDFName.of("P"));
            const pi = pref ? sigPageIndex(pref) : -1;
            if (pi >= 0) sigStamps.push({ pi, rect: normRect(w.getRectangle()), val });
          }
        }
        // text-sig fields flatten fine once blanked; a real signature field can't
        // be flattened, so drop it first (we draw the image over its spot anyway).
        if (isTextSig) {
          try {
            f.setText("");
          } catch {
            // ignore
          }
        } else {
          sigFieldsToRemove.push(f);
        }
      }
      for (const f of sigFieldsToRemove) {
        try {
          form.removeField(f);
        } catch {
          // ignore
        }
      }

      form.flatten();

      for (const s of sigStamps) {
        let png;
        try {
          png = await doc.embedPng(s.val);
        } catch {
          continue;
        }
        const pg = sigPages[s.pi];
        const r = s.rect;
        const k = Math.min(r.width / png.width, r.height / png.height);
        const dw = png.width * k;
        const dh = png.height * k;
        pg.drawImage(png, {
          x: r.x + (r.width - dw) / 2,
          y: r.y + (r.height - dh) / 2,
          width: dw,
          height: dh,
        });
      }
      const out = await doc.save();
      return out;
  }

  async function download() {
    if (!bytesRef.current) return;
    setBusy(true);
    try {
      const out = await buildPdfBytes();
      const blob = new Blob([out], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(title)}-filled.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      // ignore - nothing saved, user can retry
    } finally {
      setBusy(false);
    }
  }

  async function sendToTeam() {
    if (!bytesRef.current || !submitAction) return;
    // need someone to send to; on the public link also need the submitter's info.
    if (!recipientId) {
      setSendErr(sendErrorText("norecipient"));
      return;
    }
    if (publicMode && (!empName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empEmail.trim()))) {
      setSendErr(sendErrorText("info"));
      return;
    }
    setSendBusy(true);
    setSendErr(null);
    try {
      const out = await buildPdfBytes();
      const pdfBase64 = bytesToBase64(out);
      const payload = {
        formId,
        message: sendMsg,
        pdfBase64,
        pdfName: `${slugify(title)}-filled.pdf`,
        recipientId,
      };
      if (publicMode) {
        payload.employeeName = empName.trim();
        payload.employeeEmail = empEmail.trim();
      }
      const r = await submitAction(payload);
      if (r?.ok) {
        setSent(true);
        setSendOpen(false);
      } else {
        setSendErr(sendErrorText(r?.error));
      }
    } catch {
      setSendErr("Couldn't send. Please try again.");
    } finally {
      setSendBusy(false);
    }
  }

  return (
    <div ref={wrapRef} className="mt-4">
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <LockIcon className="mt-0.5 h-4 w-4 flex-none" />
        <p>
          Nothing is saved here. Fill it in, then{" "}
          {reviewTeam ? "submit it to the review team or download the PDF." : "download the official PDF to your device."}
        </p>
      </div>

      {/* public share link: we don't know who they are, so collect a name + email
          (the email becomes reply-to so the reviewer can match + write back). */}
      {publicMode && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            Your info
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="empName" className="block text-sm font-medium text-foreground">
                Your full name <span className="text-rose-500">*</span>
              </label>
              <input
                id="empName"
                type="text"
                value={empName}
                onChange={(e) => setEmpName(e.target.value)}
                maxLength={80}
                placeholder="Employee name"
                className="mt-1.5 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="empEmail" className="block text-sm font-medium text-foreground">
                Your email <span className="text-rose-500">*</span>
              </label>
              <input
                id="empEmail"
                type="email"
                value={empEmail}
                onChange={(e) => setEmpEmail(e.target.value)}
                maxLength={254}
                placeholder="you@email.com"
                className="mt-1.5 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
              />
              <p className="mt-1 text-xs text-faint">
                So the reviewer can reply to you. Use the email you normally get MLS
                mail at.
              </p>
            </div>
          </div>
        </div>
      )}

      {status === "loading" && (
        <p className="mt-8 text-sm text-muted">Loading the form…</p>
      )}
      {status === "error" && (
        <p className="mt-8 text-sm text-rose-600">
          Couldn&apos;t load this form. Try the download instead, or refresh.
        </p>
      )}

      {status === "ready" && (
        <>
          <div className="mt-5 space-y-4">
            {pages.map((pg, i) => (
              <div
                key={i}
                className="relative mx-auto overflow-hidden rounded-md border border-border bg-white shadow-sm"
                style={{ width: pg.w, height: pg.h }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pg.url} alt="" width={pg.w} height={pg.h} className="block select-none" draggable={false} />
                {placements
                  .filter((p) => p.page === i)
                  .map((p, j) =>
                    p.kind === "signature" ? (
                      <button
                        key={p.name + j}
                        type="button"
                        onClick={() => setSigning(p.name)}
                        aria-label="Draw signature"
                        style={{
                          position: "absolute",
                          left: p.left,
                          top: p.top,
                          width: p.width,
                          height: p.height,
                          border: "1px solid rgba(37,99,235,0.45)",
                          background: values[p.name] ? "transparent" : "rgba(255,255,255,0.55)",
                          borderRadius: 2,
                          padding: 0,
                          margin: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          overflow: "hidden",
                          boxSizing: "border-box",
                        }}
                      >
                        {values[p.name] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={values[p.name]}
                            alt="signature"
                            style={{ maxWidth: "100%", maxHeight: "100%" }}
                          />
                        ) : (
                          <span
                            style={{
                              fontSize: Math.min(Math.max(p.height * 0.4, 9), 12),
                              color: "#2563eb",
                              fontWeight: 500,
                            }}
                          >
                            Sign
                          </span>
                        )}
                      </button>
                    ) : p.kind === "checkbox" ? (
                      <input
                        key={p.name + j}
                        type="checkbox"
                        checked={!!values[p.name]}
                        onChange={(e) => setVal(p.name, e.target.checked)}
                        style={{
                          position: "absolute",
                          left: p.left,
                          top: p.top,
                          width: Math.max(p.width, 11),
                          height: Math.max(p.height, 11),
                          margin: 0,
                          accentColor: "#1d4ed8",
                          cursor: "pointer",
                        }}
                      />
                    ) : p.multiline ? (
                      <textarea
                        key={p.name + j}
                        value={values[p.name] || ""}
                        onChange={(e) => setVal(p.name, e.target.value)}
                        style={overlayStyle(p, true)}
                      />
                    ) : (
                      <input
                        key={p.name + j}
                        type="text"
                        value={values[p.name] || ""}
                        onChange={(e) => setVal(p.name, e.target.value)}
                        style={overlayStyle(p, false)}
                      />
                    ),
                  )}
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-faint">
            Tip: tap a signature box to draw your signature with your mouse or
            finger. Everything else types in.
          </p>

          {sent ? (
            <div className="mt-5 flex items-start gap-3 rounded-lg border border-emerald-300/60 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <CheckIcon className="mt-0.5 h-5 w-5 flex-none text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  Submitted - thank you!
                </p>
                <p className="mt-0.5 text-sm text-emerald-700 dark:text-emerald-200/80">
                  This will be reviewed{chosenRecipient ? ` by ${chosenRecipient.name}` : ""}. Thank you for your submission.
                </p>
                <button
                  type="button"
                  onClick={download}
                  disabled={busy}
                  className="mt-2 text-sm font-medium text-brand transition hover:text-brand-dark disabled:opacity-60"
                >
                  {busy ? "Preparing…" : "Download a copy for your records →"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-5">
              {reviewTeam && (
                <button
                  type="button"
                  onClick={() => { setSendErr(null); setSendOpen(true); }}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:opacity-60"
                >
                  <SendIcon className="h-4 w-4" />
                  Submit to review team
                </button>
              )}
              <button
                type="button"
                onClick={download}
                disabled={busy}
                className={`inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold shadow-sm transition disabled:opacity-60 ${
                  reviewTeam
                    ? "border border-border-strong text-muted hover:text-foreground"
                    : "bg-brand-light text-white hover:bg-brand"
                }`}
              >
                <DownloadIcon className="h-4 w-4" />
                {busy ? "Preparing…" : "Download filled PDF"}
              </button>
            </div>
          )}

          {sendOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              onClick={() => !sendBusy && setSendOpen(false)}
            >
              <div
                className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-base font-semibold text-foreground">Submit this form</h2>
                <p className="mt-1 text-sm text-muted">
                  Pick the {recipientLabel} this goes to. The completed PDF is
                  attached.
                </p>

                {recipients.length === 0 ? (
                  <p className="mt-4 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    No {recipientLabel} is set up to receive this yet. Let IT know
                    so they can assign one.
                  </p>
                ) : (
                  <div className="mt-4">
                    <label htmlFor="recipient" className="block text-sm font-medium text-foreground">
                      Send to ({recipientLabel}) <span className="text-rose-500">*</span>
                    </label>
                    <select
                      id="recipient"
                      value={recipientId}
                      onChange={(e) => setRecipientId(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
                    >
                      <option value="">Select a {recipientLabel}…</option>
                      {recipients.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    {reviewTeam?.ccNames?.length > 0 && (
                      <p className="mt-1.5 text-sm text-muted">
                        CC: <span className="font-medium text-foreground">{reviewTeam.ccNames.join(", ")}</span> and you
                      </p>
                    )}
                  </div>
                )}

                <label className="mt-4 block text-sm font-medium text-foreground">
                  Additional info <span className="text-faint">(optional)</span>
                </label>
                <textarea
                  value={sendMsg}
                  onChange={(e) => setSendMsg(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Anything you want the reviewers to know…"
                  className="mt-1.5 w-full rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
                />
                {sendErr && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{sendErr}</p>}
                <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() => setSendOpen(false)}
                    disabled={sendBusy}
                    className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={sendToTeam}
                    disabled={sendBusy || recipients.length === 0}
                    className="inline-flex items-center gap-2 rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand disabled:opacity-60"
                  >
                    {sendBusy ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {signing && (
            <SignaturePad
              onClose={() => setSigning(null)}
              onSave={(data) => {
                setVal(signing, data);
                setSigning(null);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function overlayStyle(p, multiline) {
  return {
    position: "absolute",
    left: p.left,
    top: p.top,
    width: p.width,
    height: p.height,
    border: "1px solid rgba(37,99,235,0.45)",
    background: "rgba(255,255,255,0.55)",
    color: "#111827",
    fontSize: Math.min(Math.max(p.height * 0.62, 9), 13),
    lineHeight: multiline ? 1.2 : `${p.height}px`,
    padding: multiline ? "2px 3px" : "0 3px",
    margin: 0,
    borderRadius: 2,
    resize: "none",
    outline: "none",
    boxSizing: "border-box",
  };
}

function LockIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function DownloadIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function SendIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
