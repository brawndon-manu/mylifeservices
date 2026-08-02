"use client";

// read-only page render of a stored PDF.
//
// it can't be shown in an <object>/<iframe>: the site sends
// X-Frame-Options: DENY on every response, which blocks framing even
// same-origin. so the bytes are fetched and drawn to canvases with pdf.js, the
// same way the form filler displays a form.
import { useEffect, useRef, useState } from "react";

const WORKER_SRC = "/pdf.worker.min.mjs";
const MAX_WIDTH = 880;

export default function PdfPreview({ fileUrl, label = "timesheet" }) {
  const [pages, setPages] = useState([]);
  const [status, setStatus] = useState("loading");
  const wrapRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error("fetch failed");
        const buf = new Uint8Array(await res.arrayBuffer());

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
        const pdf = await pdfjs.getDocument({ data: buf }).promise;

        const W = Math.min(wrapRef.current?.clientWidth || 700, MAX_WIDTH);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const out = [];
        for (let i = 0; i < pdf.numPages; i++) {
          const page = await pdf.getPage(i + 1);
          const base = page.getViewport({ scale: 1 });
          const scale = W / base.width;
          const vp = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(vp.width);
          canvas.height = Math.ceil(vp.height);
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
          out.push({
            url: canvas.toDataURL("image/png"),
            w: base.width * scale,
            h: base.height * scale,
          });
        }
        if (active) {
          setPages(out);
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

  return (
    <div ref={wrapRef}>
      {status === "loading" && <p className="text-sm text-muted">Loading the {label}…</p>}
      {status === "error" && (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          Couldn&apos;t display the {label}.{" "}
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="underline">
            Open it in a new tab
          </a>{" "}
          to review it.
        </p>
      )}
      {status === "ready" && (
        <div className="space-y-3">
          {pages.map((pg, i) => (
            <div
              key={i}
              className="mx-auto overflow-hidden rounded-md border border-border bg-white shadow-sm"
              style={{ width: pg.w }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pg.url} alt={`Page ${i + 1}`} width={pg.w} height={pg.h} className="block" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
