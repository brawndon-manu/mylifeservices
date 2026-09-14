"use client";

// CHOOSING WHERE THE NAME GOES, BY POINTING AT IT.
//
// Mánu 2026-09-13: "hopefully we can make it so we choose where it goes for the
// name?" So the template is rendered exactly as it will print, and clicking a
// spot puts a real name there at the real size. What you see on the page is the
// same text, the same font and the same placement the PDF will get.
//
// THE CLICK IS CONVERTED BEFORE IT IS SAVED. The picture is however many pixels
// wide the column happens to be; the PDF is points from the bottom-left. Saving
// pixels would tie the batch to today's layout, so the conversion happens here
// and the record only ever holds points.
import { useState } from "react";
import DatePicker from "@/components/DatePicker";
import { printedDate } from "@/lib/certificates/render";

const WORKER_SRC = "/pdf.worker.min.mjs";
const DEFAULT_SIZE = 28;

export default function CertificateBuilder({ candidates, action }) {
  // ONE ENTRY PER TEMPLATE. The people and their dates sit outside this list
  // because they are the same for every one of them - which is the whole point
  // of the run: Mánu 2026-09-13, "i dont want to enter the names and dates 6
  // different times".
  const [templates, setTemplates] = useState([]);
  const [at, setAt] = useState(0);
  const [placing, setPlacing] = useState("name");
  const [guides, setGuides] = useState(true);
  const [picked, setPicked] = useState([]);
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState("");
  const [batchDate, setBatchDate] = useState("");
  const [dates, setDates] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const ERRORS = {
    notitle: "Give the certificate a name.",
    notemplate: "Pick the certificate PDF first.",
    noplace: "Click the certificate to say where the name goes.",
    nopeople: "Pick at least one person, or type a name.",
    badtemplate: "That PDF could not be written on.",
    save: "The certificates were made but could not be saved. Nothing was kept.",
    noblob: "File storage is not configured, so nothing was saved.",
  };

  const cur = templates[at] || null;
  const patch = (i, fields) =>
    setTemplates((list) => list.map((t, n) => (n === i ? { ...t, ...fields } : t)));

  // a file becomes a template: its pages rendered once, and a title taken from
  // the filename so six of them are not six blank boxes to fill in
  async function readTemplate(file) {
    const buf = await file.arrayBuffer();
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
    const W = 700;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = W / base.width;
      const vp = page.getViewport({ scale: scale * dpr });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      pages.push({
        url: canvas.toDataURL("image/png"),
        w: base.width * scale,
        h: base.height * scale,
        pdfW: base.width,
        pdfH: base.height,
      });
    }
    return {
      file,
      fileName: file.name,
      title: file.name.replace(/\.pdf$/i, "").trim(),
      pages,
      spot: null,
      size: DEFAULT_SIZE,
      align: "center",
      dateSpot: null,
      dateSize: 14,
    };
  }

  async function onTemplate(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    const made = [];
    for (const f of files) made.push(await readTemplate(f));
    setTemplates((list) => {
      const next = [...list, ...made];
      setAt(next.length - made.length);
      return next;
    });
    setBusy(false);
  }

  const sample =
    candidates.find((c) => c.id === picked[0])?.legalName
    || typed.split(/\r?\n/).find((v) => v.trim())
    || "Sample Name";

  const shown = q.trim()
    ? candidates.filter((c) => `${c.legalName} ${c.displayName}`.toLowerCase().includes(q.trim().toLowerCase()))
    : candidates;

  const typedCount = typed.split(/\r?\n/).filter((v) => v.trim()).length;
  const people = picked.length + typedCount;
  const placed = templates.filter((t) => t.spot).length;
  const ready = templates.length > 0 && placed === templates.length && people > 0
    && templates.every((t) => t.title.trim());

  function onPick(e, index) {
    const r = e.currentTarget.getBoundingClientRect();
    const at2 = {
      page: index,
      xPct: (e.clientX - r.left) / r.width,
      yPct: (e.clientY - r.top) / r.height,
    };
    patch(at, placing === "date" ? { dateSpot: at2 } : { spot: at2 });
  }

  // NOT A SUBMIT BUTTON, ON PURPOSE. The form has no action of its own - it
  // calls a server action from here - so a press before this component has
  // hydrated makes the browser do a plain submit: a full navigation that the
  // maintenance proxy answers, throwing away every template, placement and
  // name. A button that does nothing until it works is better than one that
  // loses the page.
  async function onSubmit() {
    setError("");
    if (!ready) return;
    const fd = new FormData();
    fd.set("issuedOn", batchDate);
    fd.set("userIds", picked.join(","));
    fd.set("dates", JSON.stringify(dates));
    fd.set("typed", typed);
    // pixels in, points out - the picture is whatever width the column is; the
    // PDF is points from the bottom-left
    const plans = templates.map((t) => {
      const np = t.pages[t.spot.page];
      const plan = {
        title: t.title.trim(),
        page: t.spot.page,
        x: t.spot.xPct * np.pdfW,
        y: (1 - t.spot.yPct) * np.pdfH,
        size: t.size,
        align: t.align,
      };
      if (t.dateSpot) {
        const dp = t.pages[t.dateSpot.page];
        plan.datePage = t.dateSpot.page;
        plan.dateX = t.dateSpot.xPct * dp.pdfW;
        plan.dateY = (1 - t.dateSpot.yPct) * dp.pdfH;
        plan.dateSize = t.dateSize;
        plan.dateAlign = t.align;
      }
      return plan;
    });
    fd.set("templates", JSON.stringify(plans));
    for (const t of templates) fd.append("template", t.file);

    setBusy(true);
    const res = await action(fd);
    setBusy(false);
    if (!res?.ok) { setError(ERRORS[res?.error] || "Could not make those."); return; }
    setDone(res);
  }

  if (done) {
    return (
      <div className="mt-8 rounded-xl border border-border bg-surface p-6">
        <p className="text-sm font-semibold text-foreground">
          {done.issued} certificates made across {done.batches}{" "}
          {done.batches === 1 ? "certificate" : "certificates"}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`/portal/admin/forms/certificates/run/${done.runId}/zip`}
            className="rounded-md bg-brand-light px-4 py-2 text-sm font-semibold text-white"
          >
            Download the whole run
          </a>
          {done.batchIds.map((id, i) => (
            <a
              key={id}
              href={`/portal/admin/forms/certificates/${id}`}
              className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-muted"
            >
              {templates[i]?.title || `Certificate ${i + 1}`}
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="rounded-xl border border-border bg-surface p-5">
        <label className="block text-sm">
          <span className="font-semibold text-foreground">The blank certificates (PDF)</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={onTemplate}
            className="mt-2 block w-full text-sm text-muted file:mr-4 file:rounded-md file:border-0 file:bg-brand-light file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
          <span className="mt-1 block text-xs text-muted">
            Add as many as you like. Everyone below gets one of each, so the names and
            dates are only entered once.
          </span>
        </label>

        {templates.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {templates.map((t, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={i === at}
                onClick={() => setAt(i)}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                  i === at ? "border-brand bg-brand-light text-white" : "border-border-strong text-muted"
                }`}
              >
                <span className={t.spot ? "" : "opacity-60"}>{t.title || t.fileName}</span>
                <span className={t.spot ? "text-emerald-300" : "text-amber-400"}>
                  {t.spot ? "placed" : "not placed"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {cur && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="block flex-1 text-sm">
              <span className="font-semibold text-foreground">What this one is for</span>
              <input
                value={cur.title}
                onChange={(e) => patch(at, { title: e.target.value })}
                placeholder="CPR Recertification 2026"
                className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
              />
              <span className="mt-1 block text-xs text-muted">{cur.fileName}</span>
            </label>
            <button
              type="button"
              onClick={() => {
                setTemplates((l) => l.filter((_, n) => n !== at));
                setAt((n) => Math.max(0, n - 1));
              }}
              className="text-xs font-medium text-muted underline underline-offset-4"
            >
              Remove this one
            </button>
          </div>

          <p className="mt-4 text-sm font-semibold text-foreground">Click where the name goes</p>
          <p className="mt-1 text-xs text-muted">
            Each certificate is placed on its own. The name below is drawn at the size it
            will print.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-muted">
              Size
              <input
                type="range"
                min="8"
                max="96"
                value={placing === "date" ? cur.dateSize : cur.size}
                onChange={(e) =>
                  patch(at, placing === "date"
                    ? { dateSize: Number(e.target.value) }
                    : { size: Number(e.target.value) })
                }
                className="w-36"
              />
              <span className="w-8 tabular-nums text-foreground">
                {placing === "date" ? cur.dateSize : cur.size}
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
              Centre guides
            </label>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted">Clicking places</span>
              {[["name", "the name"], ["date", "the date"]].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={placing === k}
                  onClick={() => setPlacing(k)}
                  className={`rounded-md border px-2.5 py-1 font-medium transition ${
                    placing === k ? "border-brand bg-brand-light text-white" : "border-border-strong text-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
              {cur.dateSpot && (
                <button
                  type="button"
                  onClick={() => patch(at, { dateSpot: null })}
                  className="font-semibold text-brand underline underline-offset-4"
                >
                  Take the date off
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              {["center", "left"].map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={cur.align === a}
                  onClick={() => patch(at, { align: a })}
                  className={`rounded-md border px-2.5 py-1 font-medium transition ${
                    cur.align === a ? "border-brand bg-brand-light text-white" : "border-border-strong text-muted"
                  }`}
                >
                  {a === "center" ? "Centred on the point" : "Starts at the point"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {cur.pages.map((p, i) => (
              <div
                key={i}
                onClick={(e) => onPick(e, i)}
                className="relative mx-auto cursor-crosshair select-none border border-border"
                style={{ width: p.w, height: p.h }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Page ${i + 1}`} width={p.w} height={p.h} draggable={false} />
                {guides && (
                  <>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(to bottom, rgba(15,23,42,.55) 0 6px, transparent 6px 12px)",
                        boxShadow: "0 0 0 1px rgba(255,255,255,.5)",
                      }}
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(to right, rgba(15,23,42,.55) 0 6px, transparent 6px 12px)",
                        boxShadow: "0 0 0 1px rgba(255,255,255,.5)",
                      }}
                    />
                  </>
                )}
                {cur.dateSpot?.page === i && (
                  <span
                    className="pointer-events-none absolute whitespace-nowrap text-[#0f172a]"
                    style={{
                      left: `${cur.dateSpot.xPct * 100}%`,
                      top: `${cur.dateSpot.yPct * 100}%`,
                      transform: `translate(${cur.align === "center" ? "-50%" : "0"}, -100%)`,
                      fontSize: cur.dateSize * (p.w / p.pdfW),
                      fontFamily: "Helvetica, Arial, sans-serif",
                    }}
                  >
                    {printedDate(batchDate) || "Sep 13, 2026"}
                  </span>
                )}
                {cur.spot?.page === i && (
                  <span
                    className="pointer-events-none absolute whitespace-nowrap font-bold text-[#0f172a]"
                    style={{
                      left: `${cur.spot.xPct * 100}%`,
                      top: `${cur.spot.yPct * 100}%`,
                      transform: `translate(${cur.align === "center" ? "-50%" : "0"}, -100%)`,
                      fontSize: cur.size * (p.w / p.pdfW),
                      fontFamily: "Helvetica, Arial, sans-serif",
                    }}
                  >
                    {sample}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-sm font-semibold text-foreground">
          Who gets one{templates.length > 1 ? ` of each of the ${templates.length}` : ""}
        </p>

        <div className="mt-3 max-w-xs">
          <span className="text-xs font-semibold text-foreground">Date on them</span>
          <div className="mt-1">
            <DatePicker value={batchDate} onChange={setBatchDate} />
          </div>
          <span className="mt-1 block text-xs text-muted">
            Used for anyone who has no date of their own.
          </span>
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search staff"
          className="mt-4 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
        />
        <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-border">
          {shown.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-0">
              <input
                type="checkbox"
                checked={picked.includes(c.id)}
                onChange={(e) => setPicked((v) => (e.target.checked ? [...v, c.id] : v.filter((x) => x !== c.id)))}
              />
              <span className="text-foreground">{c.legalName}</span>
              {c.gone && <span className="text-xs text-muted">no longer here</span>}
            </label>
          ))}
          {shown.length === 0 && <p className="px-3 py-3 text-sm text-muted">Nobody matches that.</p>}
        </div>
        <p className="mt-1 text-xs text-muted">
          A certificate is a document, so a picked person prints the legal name on file.
        </p>

        {picked.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-xs font-semibold text-foreground">
              Chosen ({picked.length}) and the date on each
            </p>
            <ul className="mt-2 space-y-2">
              {picked.map((id) => {
                const c = candidates.find((x) => x.id === id);
                return (
                  <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 text-sm text-foreground">{c?.legalName}</span>
                    <DatePicker
                      value={dates[id] || ""}
                      onChange={(v) => setDates((d) => ({ ...d, [id]: v }))}
                      inputClassName="w-36 rounded border border-border-strong bg-surface px-2 py-1 pr-9 font-mono text-xs text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => setPicked((v) => v.filter((x) => x !== id))}
                      className="text-xs font-medium text-muted underline underline-offset-4"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Left blank, a certificate takes the date above. The same date is used on
              every certificate in the run.
            </p>
          </div>
        )}

        <label className="mt-4 block text-sm">
          <span className="font-semibold text-foreground">Anyone else, one per line</span>
          <textarea
            rows={4}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={"Brandon Uribe\nSomebody With No Account"}
            className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground"
          />
          <span className="mt-1 block text-xs text-muted">Printed exactly as written.</span>
        </label>
      </div>

      {error && <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
      {templates.length > 0 && placed < templates.length && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {templates.length - placed} of {templates.length} still need the name placing.
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || !ready}
        className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy
          ? "Making them…"
          : templates.length && people
            ? `Make ${templates.length * people} certificate${templates.length * people === 1 ? "" : "s"}`
            : "Make certificates"}
      </button>
    </div>
  );
}
