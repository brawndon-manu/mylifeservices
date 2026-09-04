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
  StandardFonts,
} from "pdf-lib";
import SignaturePad from "./SignaturePad";

const RICH_TEXT_FLAG = 1 << 25;
const WORKER_SRC = "/pdf.worker.min.mjs";
// a load that has not finished by now is not going to. Better a visible failure
// than a spinner nobody can get past: everything in the loader is awaited, so
// any step that neither resolves nor rejects leaves the reader on "Loading the
// form…" with no error and no way on.
const LOAD_TIMEOUT_MS = 45_000;
// a letter page is 8.5in wide, so this width IS the reading resolution: 880px
// worked out to ~103 dpi, and the timesheet's table text is 7.2pt (6pt in the
// comments column), which lands around 9 pixels tall. legible-ish on a retina
// screen, mush on a 1x one.
const MAX_WIDTH = 1100;

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
      nosignature: "Tap the signature box on the document and draw your signature before submitting.",
      config: "Email isn't configured on the server. Let IT know.",
      auth: "Your session expired. Refresh and sign in again.",
      // the signer backed out of a confirmation panel of its own. Nothing went
      // wrong, so this must not read like a failure - the timesheet signer uses
      // it when somebody decides to go back and answer their questions first.
      cancelled: "No problem - nothing has been submitted.",
      // a rest period has to sit inside a shift that was worked - the same rule
      // the "outside your scheduled hours" question is about
      outsideshift: "That break time is outside the shift you worked. Pick a time inside it.",
      // the mirror of the above for lunch: a rest goes INSIDE a shift, a meal
      // goes in the gap between two, and only where a full half hour fits
      nolunchgap: "There isn't a free half hour at that time. Pick one of the gaps offered.",
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
  announcementId = null,
  announcementTitle = null,
  // sign-only mode (timesheets): there's no reviewer to pick and no recipient
  // dialog - the reader just signs their own document and submits it back.
  signMode = false,
  signLabel = null,
  // one line above the document, for a caller that knows what it is
  signIntro = null,
  // SIGNATURE FIELDS THAT MAY STAY EMPTY in sign mode, by field name. The
  // client attestation carries two signature boxes and only the supervisor's is
  // required - the client's is optional on the paper form, and the browser must
  // not demand more than the paper does. Everything not named here is still
  // required, so the timesheet's single signature behaves exactly as before.
  optionalSignatures = [],
  // A FIELD WHOSE VALUE COMES BACK AS payload.employeeName. The attestation
  // form has a "Supervisor name (print)" box; whoever signs from the emailed
  // link types their name there anyway, and the row's audit trail wants the
  // same name without asking twice. Null leaves the payload exactly as it was.
  nameFrom = null,
  // PARTIAL SIGNING: only these fields are offered, and the built PDF stamps
  // exactly them onto the page - value drawn as content, field removed - and
  // DOES NOT flatten the rest. That is what keeps the remaining fields live for
  // the next person: the client attestation is signed by the client first and
  // finished by the field supervisor, and a flatten at the first stage would
  // hand the supervisor a form with nothing left to fill.
  // Null (the default) is the whole form and a full flatten, exactly as before.
  onlyFields = null,
}) {
  const [status, setStatus] = useState("loading");
  const [pages, setPages] = useState([]); // { url, w, h }
  // the pages could not be painted in this browser. Not an error state: the
  // document is still readable through its own link and still signable, so this
  // only changes HOW it is put in front of somebody.
  const [cantDraw, setCantDraw] = useState(false);
  const [placements, setPlacements] = useState([]); // { name, kind, page, left, top, width, height, multiline }
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(null); // field name being signed
  const [sendOpen, setSendOpen] = useState(false);
  const [sendMsg, setSendMsg] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendErr, setSendErr] = useState(null);
  const [sent, setSent] = useState(false);
  const recipients = reviewTeam?.recipients || [];
  const recipientLabel = reviewTeam?.recipientLabel || "reviewer";
  // who this goes to (a picked holder of the form's recipientTitle) + on the
  // public share link the submitter's own name/email (we don't know them).
  // exactly one holder means there is nothing to pick - the document can only
  // go to them - so the choice is preset and the dropdown never renders.
  const [recipientId, setRecipientId] = useState(
    recipients.length === 1 ? recipients[0].id : ""
  );
  const [empName, setEmpName] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const bytesRef = useRef(null);
  const wrapRef = useRef(null);
  const chosenRecipient = recipients.find((r) => r.id === recipientId) || null;

  // THE TYPED SIGNATURE IS NOT A SECOND KIND OF ANSWER. It is written into the
  // SAME `values` slot a drawn one goes in, so everything downstream is
  // untouched: the submit gate that refuses an unsigned sheet already reads
  // this, `buildPdfBytes` stamps it, and the action, the stored PDF and the
  // confirmation email never learn there were two ways to produce it. All that
  // differs is that the value is a name rather than a data URL, which is what
  // `typedStamps` keys off.
  const sigFields = placements.filter((p) => p.kind === "signature");
  const typedSig = sigFields.length ? String(values[sigFields[0].name] || "") : "";
  const setTypedSig = (v) => setValues((prev) => {
    const next = { ...prev };
    for (const p of sigFields) next[p.name] = v;
    return next;
  });

  useEffect(() => {
    let active = true;
    // THE WATCHDOG. Everything below is awaited, and a step that neither
    // resolves nor rejects leaves the reader on "Loading the form…" for ever
    // with no error and no way on. Nothing in the app does that today - this is
    // here because chasing a suspected hang cost an hour, and a silent spinner
    // on a document somebody has to sign is the worst way to find out.
    const watchdog = setTimeout(() => {
      if (active) setStatus((s) => (s === "loading" ? "error" : s));
    }, LOAD_TIMEOUT_MS);
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

        // a partial signer is only offered its own fields; everything else on
        // the page stays visible in the bitmap but takes no input here
        const offered = onlyFields ? pls.filter((p) => onlyFields.includes(p.name)) : pls;

        // DRAWING THE DOCUMENT AND SIGNING IT ARE TWO DIFFERENT JOBS, and only
        // one of them is allowed to fail the page.
        //
        // Everything above is pdf-lib reading field positions off the bytes.
        // Everything below is pdf.js painting those pages onto canvases. They
        // share nothing: `buildPdfBytes` fills and signs from `placements` and
        // `values` and never reads a page image. They were in ONE try, so a
        // canvas that would not paint threw away a working set of placements
        // with it, and the reader landed on "Couldn't load this form" with no
        // signature pad and no download button - both of those live behind
        // `status === "ready"` - and therefore no way to finish at all.
        //
        // An in-app browser is where this bites. Module workers are unsupported
        // in older Android WebViews, and WKWebView has a canvas memory ceiling
        // past which it returns a BLANK canvas rather than throwing. A fortnight
        // sheet is several pages, each held as a full-size base64 PNG at 2x, so
        // the more days somebody worked the likelier it is to go.
        //
        // Now the render is allowed to fail alone. Somebody who cannot be shown
        // the pages is handed the file to open in whatever their phone uses for
        // PDFs, and can still sign.
        let cantDraw = false;
        let imgs = [];
        try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
        const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
        // render at 2x the display size even on a 1x screen. without this the
        // bitmap matches the element pixel for pixel, so small type has nothing
        // to anti-alias against and dense documents come out muddy. capped so a
        // 3x phone doesn't build a canvas we then have to base64 into a data url.
        //
        // A SHORT DOCUMENT AFFORDS MORE. The cap exists because a fortnight
        // timesheet is several pages each held as a full-size PNG, and WKWebView
        // silently blanks canvases past its memory ceiling. A one-page document
        // - the client attestation is a 900pt-wide calendar whose cell type is
        // small on any screen - is nowhere near that ceiling, and at 2.5x it
        // read as "the resolution is so awful" (Mánu 2026-08-24). One page gets
        // 4x; anything longer keeps the old cap.
        const dpr = pdf.numPages === 1 ? 4 : Math.min(Math.max(window.devicePixelRatio || 1, 2), 2.5);
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
        } catch {
          // the pages could not be drawn here. The document is still readable -
          // it is a PDF and the phone has something that opens one - and it is
          // still signable, because signing never needed the pictures.
          cantDraw = true;
          imgs = [];
        }

        if (active) {
          setPlacements(offered);
          setPages(imgs);
          setCantDraw(cantDraw);
          // sign-only documents (timesheets) date themselves - the only date on
          // them is the one beside the signature, and making someone type
          // today's date is just a step to get wrong. still editable if they
          // want to change it. left alone on regular forms, where a "Date"
          // field is as likely to be an incident date as a signing date.
          if (signMode) {
            // pinned to Pacific rather than the device clock, so this agrees
            // with the approval date stamped on the server and a phone left on
            // another timezone can't date a payroll document a day out.
            const today = new Date().toLocaleDateString("en-US", {
              timeZone: "America/Los_Angeles",
            });
            const dated = {};
            for (const p of pls) {
              if (p.kind === "text" && /date/i.test(p.name)) dated[p.name] = today;
            }
            if (Object.keys(dated).length) setValues((v) => ({ ...dated, ...v }));
          }
          setStatus("ready");
        }
      } catch {
        if (active) setStatus("error");
      }
    })();
    return () => {
      active = false;
      clearTimeout(watchdog);
    };
    // onlyFields joined to a string: callers pass array literals, and the raw
    // array would be a new identity every render - depended on directly it
    // refetches the document forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, signMode, onlyFields ? onlyFields.join("|") : null]);

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
      const typedStamps = [];
      const sigFieldsToRemove = [];
      for (const f of form.getFields()) {
        // a partial signer only ever touches its own fields - blanking or
        // removing anybody else's would eat the next signer's boxes
        if (onlyFields && !onlyFields.includes(f.getName())) continue;
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
        } else if (typeof val === "string" && val.trim()) {
          // A TYPED SIGNATURE, for a browser that cannot draw one.
          //
          // The drawn mark is an image built on a canvas, which is exactly the
          // thing that has already failed by the time anybody needs this. So it
          // is drawn as TEXT by pdf-lib instead, which touches no canvas at all
          // and works wherever the fill does.
          for (const w of f.acroField.getWidgets()) {
            const pref = w.dict.get(PDFName.of("P"));
            const pi = pref ? sigPageIndex(pref) : -1;
            if (pi >= 0) typedStamps.push({ pi, rect: normRect(w.getRectangle()), val: val.trim() });
          }
        }
        // text-sig fields flatten fine once blanked; a real signature field can't
        // be flattened, so drop it first (we draw the image over its spot anyway).
        // In a partial build there is no flatten at all, so a blanked field
        // would keep its empty widget on top of the stamped mark - remove it.
        if (isTextSig && !onlyFields) {
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

      if (!onlyFields) {
        form.flatten();
      } else {
        // A PER-FIELD FLATTEN, BY HAND. The values this signer typed become
        // page content - drawn text, a drawn check - and their fields are
        // removed, so what they signed cannot quietly change afterwards. Every
        // field that is not theirs is left exactly as it was: live, empty, and
        // waiting for the supervisor's link.
        const contentFont = await doc.embedFont(StandardFonts.Helvetica);
        for (const f of form.getFields()) {
          if (!onlyFields.includes(f.getName())) continue;
          const val = values[f.getName()];
          const stampable =
            (f instanceof PDFTextField && typeof val === "string" && val.trim() && !isSignatureName(f.getName())) ||
            (f instanceof PDFCheckBox && !!val);
          if (stampable) {
            for (const w of f.acroField.getWidgets()) {
              const pref = w.dict.get(PDFName.of("P"));
              const pi = pref ? sigPageIndex(pref) : -1;
              if (pi < 0) continue;
              const pg = sigPages[pi];
              const r = normRect(w.getRectangle());
              if (f instanceof PDFCheckBox) {
                const size = Math.min(r.height, r.width) * 0.85;
                pg.drawText("X", {
                  x: r.x + (r.width - contentFont.widthOfTextAtSize("X", size)) / 2,
                  y: r.y + (r.height - contentFont.heightAtSize(size)) / 2 + size * 0.1,
                  size,
                  font: contentFont,
                });
              } else {
                let size = Math.min(r.height * 0.62, 11);
                const text = String(val).trim();
                while (size > 5 && contentFont.widthOfTextAtSize(text, size) > r.width * 0.96) size -= 0.5;
                pg.drawText(text, {
                  x: r.x + 2,
                  y: r.y + (r.height - contentFont.heightAtSize(size)) / 2 + size * 0.14,
                  size,
                  font: contentFont,
                });
              }
            }
          }
          try {
            form.removeField(f);
          } catch {
            // ignore
          }
        }
      }

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

      // THE TYPED ONES, drawn after flatten for the same reason the images are:
      // the blanked field's own appearance would otherwise paint over them.
      //
      // Sized to fit the box rather than fixed, because the signature rect
      // differs between documents and a name that overflows it would run into
      // whatever is printed beside it. Italic so it reads as a signature rather
      // than as another filled field, and never larger than the box is tall.
      if (typedStamps.length) {
        const font = await doc.embedFont(StandardFonts.HelveticaOblique);
        for (const s of typedStamps) {
          const pg = sigPages[s.pi];
          if (!pg) continue;
          const r = s.rect;
          let size = Math.min(r.height * 0.6, 18);
          while (size > 5 && font.widthOfTextAtSize(s.val, size) > r.width * 0.94) size -= 0.5;
          const tw = font.widthOfTextAtSize(s.val, size);
          pg.drawText(s.val, {
            x: r.x + (r.width - tw) / 2,
            y: r.y + (r.height - font.heightAtSize(size)) / 2 + size * 0.18,
            size,
            font,
          });
        }
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
    // and never return without saying why. a bare `return` here is what a dead
    // button looks like from the outside.
    if (!bytesRef.current || !submitAction) {
      setSendErr("The document isn't loaded yet. Give it a moment, then try again.");
      return;
    }
    // sign-only mode goes straight back to whoever issued the document, so
    // there's no reviewer to choose and no name/email to collect.
    if (!signMode && !recipientId) {
      setSendErr(sendErrorText("norecipient"));
      return;
    }
    if (!signMode && publicMode && (!empName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empEmail.trim()))) {
      setSendErr(sendErrorText("info"));
      return;
    }
    // A SIGNATURE IS THE WHOLE POINT OF SIGN MODE, AND NOTHING WAS CHECKING FOR
    // ONE. Mánu 2026-08-10 answered every question on his timesheet, submitted,
    // and the stored copy came back with the signature line blank - the
    // AcroForm flattened with nothing in it, one image on the page and that was
    // the logo. Payroll would have filed an attestation nobody signed.
    if (
      signMode &&
      placements.some(
        (p) => p.kind === "signature" && !optionalSignatures.includes(p.name) && !values[p.name],
      )
    ) {
      setSendErr(sendErrorText("nosignature"));
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
        announcementId,
      };
      if (publicMode) {
        payload.employeeName = empName.trim();
        payload.employeeEmail = empEmail.trim();
      }
      if (nameFrom && typeof values[nameFrom] === "string" && values[nameFrom].trim()) {
        payload.employeeName = values[nameFrom].trim();
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
      {announcementId && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
          <CheckIcon className="mt-0.5 h-4 w-4 flex-none" />
          <p>
            Submitting this completes your acknowledgment
            {announcementTitle ? (
              <>
                {" "}
                for &ldquo;<strong>{announcementTitle}</strong>&rdquo;
              </>
            ) : (
              ""
            )}
            .
          </p>
        </div>
      )}
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <LockIcon className="mt-0.5 h-4 w-4 flex-none" />
        <p>
          {/* sign mode was built for timesheets and said so, which read as
              somebody else's document once an HR form started using it. The
              caller names the thing; the fallback stays generic.

              `signIntro` is honoured OUTSIDE sign mode too, as of 2026-08-11.
              A timesheet that cannot be signed yet is rendered here read-only -
              no reviewer, no submit - and the generic line told the employee to
              "fill it in and submit it to the review team", which is neither
              what the page does nor something they are allowed to do. */}
          {signIntro ||
            (signMode
              ? "Read it through, sign at the bottom, then submit. Your signed copy is kept on file."
              : `Nothing is saved here. Fill it in, then ${reviewTeam ? "submit it to the review team or download the PDF." : "download the official PDF to your device."}`)}
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
                Your work email <span className="text-rose-500">*</span>
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
                We&apos;ll cc you a copy at this address, and the reviewer can reply
                here. Use the email you normally get MLS mail at.
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

      {status === "ready" && cantDraw && (
        <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/30">
          {/* WHY THEY ARE SEEING THIS, or it reads as something being wrong with
              their timesheet rather than with the preview. Nothing is wrong with
              the document: it is the same file either way. */}
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            This browser could not draw the document here.
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            Nothing is wrong with your timesheet. Open it below to read it, then come back
            and sign. Opening it in your phone&apos;s own PDF viewer usually works when this
            does not, and it is the same document either way.
          </p>
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
          >
            Open my timesheet →
          </a>
          {signMode && (
            <div className="mt-5 border-t border-amber-300/70 pt-4 dark:border-amber-800/70">
              {/* TYPING THE NAME IS THE SIGNATURE HERE. The drawn mark is built
                  on a canvas, which is the thing that has already failed by the
                  time anybody reads this, so asking for one again would be the
                  same dead end with an extra step. `buildPdfBytes` draws this as
                  text with pdf-lib and the sheet records that it was typed. */}
              <label htmlFor="typedsig" className="block text-sm font-semibold text-foreground">
                Type your full name to sign
              </label>
              <p className="mt-1 text-xs text-muted">
                Typing your name here counts as your signature on this timesheet, the same as
                drawing it. Read it first using the button above.
              </p>
              <input
                id="typedsig"
                type="text"
                autoComplete="name"
                maxLength={80}
                value={typedSig}
                onChange={(e) => setTypedSig(e.target.value)}
                placeholder="Your full name"
                className="mt-2 w-full max-w-sm rounded-lg border border-border-strong bg-background px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none"
              />
            </div>
          )}
        </div>
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
            <>
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-5">
              {signMode ? (
                <button
                  type="button"
                  onClick={() => { setSendErr(null); sendToTeam(); }}
                  disabled={busy || sendBusy}
                  className="inline-flex items-center gap-2 rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:opacity-60"
                >
                  <SendIcon className="h-4 w-4" />
                  {sendBusy ? "Submitting…" : signLabel || "Sign & submit"}
                </button>
              ) : reviewTeam ? (
                <button
                  type="button"
                  onClick={() => { setSendErr(null); setSendOpen(true); }}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:opacity-60"
                >
                  <SendIcon className="h-4 w-4" />
                  Submit to review team
                </button>
              ) : null}
              <button
                type="button"
                onClick={download}
                disabled={busy}
                className={`inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold shadow-sm transition disabled:opacity-60 ${
                  reviewTeam || signMode
                    ? "border border-border-strong text-muted hover:text-foreground"
                    : "bg-brand-light text-white hover:bg-brand"
                }`}
              >
                <DownloadIcon className="h-4 w-4" />
                {busy ? "Preparing…" : "Download filled PDF"}
              </button>
            </div>
            {/* THE ERROR HAD NOWHERE TO GO IN SIGN MODE, so the button read as a
                dud. Every failure path set sendErr, but the only place it was
                ever rendered was inside the "Submit to review team" dialog -
                which sign mode never opens. Mánu 2026-08-10: "sign and submit
                is a dud and doesnt do anything." It was refusing an unsigned
                document exactly as it should and saying so into nowhere. */}
            {!sendOpen && sendErr && (
              <p className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-400">{sendErr}</p>
            )}
            </>
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
                  {recipients.length === 1 ? (
                    <>
                      This goes to{" "}
                      <span className="font-medium text-foreground">
                        {recipients[0].name}
                      </span>{" "}
                      ({recipientLabel}). The completed PDF is attached.
                    </>
                  ) : (
                    <>
                      Pick the {recipientLabel} this goes to. The completed PDF is
                      attached.
                    </>
                  )}
                </p>

                {recipients.length === 0 ? (
                  <p className="mt-4 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    No {recipientLabel} is set up to receive this yet. Let IT know
                    so they can assign one.
                  </p>
                ) : recipients.length === 1 && !reviewTeam?.ccNames?.length ? null : (
                  <div className="mt-4">
                    {recipients.length > 1 && (
                      <>
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
                      </>
                    )}
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
