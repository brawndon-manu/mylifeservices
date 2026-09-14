"use client";

// MOVING THE NAME ON A BATCH THAT IS ALREADY PRINTED - Mánu 2026-09-13: "is
// there a way we can make it so we can go back and edit the certificate
// placement and regenerate them".
//
// The blank template was kept when the run was made, so this fetches it back
// and hands it to the SAME panel the builder uses. The stored placement is in
// PDF points and the panel works in fractions of the picture, so the markers
// are seeded once the page sizes are known - see toSpot.
//
// EVERY CERTIFICATE IN THE BATCH IS REDRAWN. The people and their dates do not
// change; only where their name sits does.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toPoints, toSpot } from "@/lib/certificates/placement";
import { DEFAULT_FACE, DEFAULT_COLOR, cleanColor } from "@/lib/certificates/faces";
import PlacementPanel from "../../_components/PlacementPanel";
import { renderPages } from "../../_components/render-pages";

const ERRORS = {
  noplace: "Click the certificate to say where the name goes.",
  notemplate: "The blank this was printed from could not be opened.",
  badtemplate: "That PDF could not be written on.",
  nopeople: "This one has no certificates in it.",
  gone: "This batch is no longer here.",
  noblob: "File storage is not configured, so nothing was saved.",
  save: "The certificates were redrawn but could not be saved. Nothing changed.",
};

export default function PlacementEditor({ batch, sample, dateSample, action }) {
  const router = useRouter();
  const { id, templateUrl, page: atPage, x, y, datePage, dateX, dateY } = batch;

  const [pages, setPages] = useState(null);
  const [spot, setSpot] = useState(null);
  const [size, setSize] = useState(batch.size);
  const [align, setAlign] = useState(batch.align === "left" ? "left" : "center");
  const [dateSpot, setDateSpot] = useState(null);
  const [dateSize, setDateSize] = useState(batch.dateSize || 14);
  const [face, setFace] = useState(batch.face || DEFAULT_FACE);
  const [color, setColor] = useState(batch.color || DEFAULT_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(templateUrl);
        if (!res.ok) throw new Error(`template ${res.status}`);
        const built = await renderPages(await res.arrayBuffer());
        if (!alive) return;

        // points back to a marker, now that the real page size is known
        const n = Math.min(Math.max(atPage || 0, 0), built.length - 1);
        const np = built[n];
        setSpot(toSpot({ page: n, x, y, pdfW: np.pdfW, pdfH: np.pdfH }));

        if (dateX != null && dateY != null) {
          const dn = Math.min(Math.max(datePage || 0, 0), built.length - 1);
          const dp = built[dn];
          setDateSpot(toSpot({ page: dn, x: dateX, y: dateY, pdfW: dp.pdfW, pdfH: dp.pdfH }));
        }
        setPages(built);
      } catch (e) {
        console.error("template could not be opened:", e);
        if (alive) setError(ERRORS.notemplate);
      }
    })();
    return () => { alive = false; };
  }, [templateUrl, atPage, x, y, datePage, dateX, dateY]);

  function onChange(fields) {
    if ("spot" in fields) setSpot(fields.spot);
    if ("dateSpot" in fields) setDateSpot(fields.dateSpot);
    if ("size" in fields) setSize(fields.size);
    if ("dateSize" in fields) setDateSize(fields.dateSize);
    if ("align" in fields) setAlign(fields.align);
    if ("face" in fields) setFace(fields.face);
    if ("color" in fields) setColor(fields.color);
  }

  // NOT A SUBMIT BUTTON. There is no form here and no action on one, so a press
  // before hydration would navigate and the maintenance proxy would answer it.
  async function onSave() {
    if (busy || !spot || !pages) return;
    setError("");
    const np = pages[spot.page];
    const plan = {
      page: spot.page,
      ...toPoints({ xPct: spot.xPct, yPct: spot.yPct, pdfW: np.pdfW, pdfH: np.pdfH }),
      size,
      align,
      face,
      color: cleanColor(color),
    };
    if (dateSpot) {
      const dp = pages[dateSpot.page];
      const d = toPoints({ xPct: dateSpot.xPct, yPct: dateSpot.yPct, pdfW: dp.pdfW, pdfH: dp.pdfH });
      plan.datePage = dateSpot.page;
      plan.dateX = d.x;
      plan.dateY = d.y;
      plan.dateSize = dateSize;
      plan.dateAlign = align;
    }

    setBusy(true);
    let res;
    try {
      res = await action(id, plan);
    } catch {
      res = { ok: false, error: "save" };
    }
    setBusy(false);
    if (!res?.ok) { setError(ERRORS[res?.error] || ERRORS.save); return; }
    router.push(`/portal/admin/forms/certificates/${id}`);
  }

  if (!pages) {
    return (
      <div className="mt-8 rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-muted">{error || "Opening the blank certificate…"}</p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-surface p-5">
      <PlacementPanel
        value={{ pages, spot, size, align, dateSpot, dateSize, face, color }}
        onChange={onChange}
        sample={sample}
        dateSample={dateSample}
      />

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <button
          type="button"
          disabled={busy || !spot}
          onClick={onSave}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? `Redrawing ${batch.count}…` : `Redraw all ${batch.count}`}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => router.push(`/portal/admin/forms/certificates/${id}`)}
          className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-muted transition hover:border-brand hover:text-brand disabled:opacity-50"
        >
          Cancel
        </button>
        <span className="text-xs text-muted">
          The same people and the same dates. Every certificate is replaced.
        </span>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
