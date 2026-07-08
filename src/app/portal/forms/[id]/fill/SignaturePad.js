"use client";

// draw-a-signature modal. a canvas you sign on with the mouse or a finger
// (pointer events cover both); returns a transparent PNG data url that the
// filler stamps into the PDF's signature field. nothing is uploaded.
import { useEffect, useRef, useState } from "react";

export default function SignaturePad({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    // thick on the 500px canvas so it survives the downscale into the (small)
    // PDF signature field and doesn't come out hairline-thin.
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  function pos(e) {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height),
    };
  }
  function start(e) {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current.setPointerCapture?.(e.pointerId);
  }
  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  }
  function end() {
    drawing.current = false;
  }
  function clear() {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  }
  function save() {
    if (empty) return onClose();
    onSave(canvasRef.current.toDataURL("image/png"));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Draw your signature</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted transition hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={500}
          height={180}
          className="mt-3 w-full rounded-md border border-border-strong bg-white"
          style={{ touchAction: "none", aspectRatio: "500 / 180" }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        <p className="mt-1 text-xs text-muted">Sign with your mouse or finger.</p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={clear}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-muted transition hover:text-foreground"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-brand-light px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand"
          >
            Use signature
          </button>
        </div>
      </div>
    </div>
  );
}
