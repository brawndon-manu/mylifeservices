"use client";

// on-form PDF filler. renders the real PDF pages (PDF.js) and overlays input
// boxes exactly where the AcroForm fields are (positions read with pdf-lib), so
// it looks and fills like the actual form. on download it stamps the answers
// into the real PDF (pdf-lib) - entirely in the browser, so the filled copy
// (client info) never touches the server.
import { useEffect, useRef, useState } from "react";
import { PDFDocument, PDFName, PDFNumber, PDFTextField, PDFCheckBox } from "pdf-lib";
import SignaturePad from "./SignaturePad";

const RICH_TEXT_FLAG = 1 << 25;
const WORKER_SRC = "/pdf.worker.min.mjs";
const MAX_WIDTH = 880;

// signature fields are AcroForm text fields whose name says "signature" - those
// get a draw-it canvas instead of a text box, and stamp as an image.
const isSignatureField = (name) => /signature/i.test(name || "");

function slugify(s) {
  return (
    (s || "form").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "form"
  );
}

export default function FormFiller({ fileUrl, title }) {
  const [status, setStatus] = useState("loading");
  const [pages, setPages] = useState([]); // { url, w, h }
  const [placements, setPlacements] = useState([]); // { name, kind, page, left, top, width, height, multiline }
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(null); // field name being signed
  const bytesRef = useRef(null);
  const wrapRef = useRef(null);

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
          if (f instanceof PDFTextField) kind = isSignatureField(f.getName()) ? "signature" : "text";
          else if (f instanceof PDFCheckBox) kind = "checkbox";
          else continue;
          const multiline = kind === "text" && !!f.isMultiline();
          for (const w of f.acroField.getWidgets()) {
            const pref = w.dict.get(PDFName.of("P"));
            const pi = pref ? pageIndexOf(pref) : -1;
            if (pi < 0) continue;
            const pg = docPages[pi];
            const scale = W / pg.getWidth();
            const r = w.getRectangle();
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

  async function download() {
    if (!bytesRef.current) return;
    setBusy(true);
    try {
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
      for (const f of form.getFields()) {
        if (!(f instanceof PDFTextField) || !isSignatureField(f.getName())) {
          continue;
        }
        const val = values[f.getName()];
        if (typeof val !== "string" || !val.startsWith("data:image")) continue;
        for (const w of f.acroField.getWidgets()) {
          const pref = w.dict.get(PDFName.of("P"));
          const pi = pref ? sigPageIndex(pref) : -1;
          if (pi >= 0) sigStamps.push({ pi, rect: w.getRectangle(), val });
        }
        try {
          f.setText("");
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

  return (
    <div ref={wrapRef} className="mt-4">
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <LockIcon className="mt-0.5 h-4 w-4 flex-none" />
        <p>
          Nothing is saved here. Fill the form below and download the official
          PDF to your device.
        </p>
      </div>

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

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-5">
            <button
              type="button"
              onClick={download}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:opacity-60"
            >
              <DownloadIcon className="h-4 w-4" />
              {busy ? "Preparing…" : "Download filled PDF"}
            </button>
            <span className="text-xs text-faint">Send by email is coming next.</span>
          </div>

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
