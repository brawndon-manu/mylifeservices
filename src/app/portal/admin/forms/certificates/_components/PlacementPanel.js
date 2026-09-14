"use client";

// WHERE THE NAME GOES, PICKED BY POINTING AT IT.
//
// Lifted out of CertificateBuilder so that making a batch and going back to fix
// one use the SAME editor - Mánu 2026-09-13: "is there a way we can make it so
// we can go back and edit the certificate placement and regenerate them". Two
// copies of this panel would be two chances for a marker to sit somewhere the
// PDF does not.
//
// It holds no placement of its own. The page above owns spot, size, align and
// the date's spot, and gets them back through onChange; all this component
// knows is the picture, where the marks are, and what to draw in them.
import { useState } from "react";
import { FACES, INKS, faceFor, dateFaceFor, cleanColor, DEFAULT_COLOR } from "@/lib/certificates/faces";
import "./fonts.css";

export default function PlacementPanel({ value, onChange, sample, dateSample }) {
  // which mark a click drops, and whether the centre lines are shown. Both are
  // about using the panel rather than about the batch, so neither is stored.
  const [placing, setPlacing] = useState("name");
  const [guides, setGuides] = useState(true);

  const { pages, spot, size, align, dateSpot, dateSize } = value;
  const face = faceFor(value.face);
  const dateFace = dateFaceFor(value.face);
  const ink = cleanColor(value.color || DEFAULT_COLOR);

  function onPick(e, index) {
    const r = e.currentTarget.getBoundingClientRect();
    const at = {
      page: index,
      xPct: (e.clientX - r.left) / r.width,
      yPct: (e.clientY - r.top) / r.height,
    };
    onChange(placing === "date" ? { dateSpot: at } : { spot: at });
  }

  return (
    <>
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
            value={placing === "date" ? dateSize : size}
            onChange={(e) =>
              onChange(placing === "date"
                ? { dateSize: Number(e.target.value) }
                : { size: Number(e.target.value) })
            }
            className="w-36"
          />
          <span className="w-8 tabular-nums text-foreground">
            {placing === "date" ? dateSize : size}
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
          {dateSpot && (
            <button
              type="button"
              onClick={() => onChange({ dateSpot: null })}
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
              aria-pressed={align === a}
              onClick={() => onChange({ align: a })}
              className={`rounded-md border px-2.5 py-1 font-medium transition ${
                align === a ? "border-brand bg-brand-light text-white" : "border-border-strong text-muted"
              }`}
            >
              {a === "center" ? "Centred on the point" : "Starts at the point"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Font</span>
          {FACES.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={face.key === f.key}
              onClick={() => onChange({ face: f.key })}
              style={{ fontFamily: f.css, fontWeight: f.weight, fontStyle: f.style }}
              className={`rounded-md border px-2.5 py-1 transition ${
                face.key === f.key ? "border-brand bg-brand-light text-white" : "border-border-strong text-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Color</span>
          {INKS.map((c) => (
            <button
              key={c.hex}
              type="button"
              aria-label={c.label}
              title={c.label}
              aria-pressed={ink === c.hex}
              onClick={() => onChange({ color: c.hex })}
              style={{ backgroundColor: c.hex }}
              className={`h-6 w-6 rounded-full border transition ${
                ink === c.hex ? "border-brand ring-2 ring-brand" : "border-border-strong"
              }`}
            />
          ))}
          <input
            value={value.color || DEFAULT_COLOR}
            onChange={(e) => onChange({ color: e.target.value })}
            onBlur={(e) => onChange({ color: cleanColor(e.target.value) })}
            aria-label="Color as hex"
            spellCheck={false}
            className="w-24 rounded-md border border-border-strong bg-surface px-2 py-1 font-mono text-xs text-foreground"
          />
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {pages.map((p, i) => (
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
            {dateSpot?.page === i && (
              <span
                className="pointer-events-none absolute whitespace-nowrap"
                style={{
                  left: `${dateSpot.xPct * 100}%`,
                  top: `${dateSpot.yPct * 100}%`,
                  transform: `translate(${align === "center" ? "-50%" : "0"}, -100%)`,
                  fontSize: dateSize * (p.w / p.pdfW),
                  fontFamily: dateFace.css,
                  fontWeight: dateFace.weight,
                  fontStyle: dateFace.style,
                  color: ink,
                }}
              >
                {dateSample}
              </span>
            )}
            {spot?.page === i && (
              <span
                className="pointer-events-none absolute whitespace-nowrap"
                style={{
                  left: `${spot.xPct * 100}%`,
                  top: `${spot.yPct * 100}%`,
                  transform: `translate(${align === "center" ? "-50%" : "0"}, -100%)`,
                  fontSize: size * (p.w / p.pdfW),
                  fontFamily: face.css,
                  fontWeight: face.weight,
                  fontStyle: face.style,
                  color: ink,
                }}
              >
                {sample}
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
