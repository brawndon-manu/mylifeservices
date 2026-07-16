"use client";

// inline PDF viewer. renders the pages to <img> with PDF.js (same approach as the
// form filler), so it works WITHOUT embedding an iframe - our global
// X-Frame-Options: DENY blocks framing even same-origin, and canvas rendering
// sidesteps that entirely. `url` is fetched same-origin (cookies included), so a
// gated route works fine. PDF only; callers fall back to download for other types.
import { useEffect, useRef, useState } from "react";

const WORKER_SRC = "/pdf.worker.min.mjs";
const MAX_WIDTH = 860;

export default function PdfPreview({ url }) {
  const [status, setStatus] = useState("loading");
  const [pages, setPages] = useState([]); // data urls
  const wrapRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        const buf = new Uint8Array(await res.arrayBuffer());

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
        const pdf = await pdfjs.getDocument({ data: buf }).promise;

        const W = Math.min(wrapRef.current?.clientWidth || 700, MAX_WIDTH);
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
          imgs.push(canvas.toDataURL("image/png"));
        }
        if (active) {
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
  }, [url]);

  return (
    <div ref={wrapRef}>
      {status === "loading" && (
        <p className="py-8 text-center text-sm text-muted">Loading the resume…</p>
      )}
      {status === "error" && (
        <p className="py-8 text-center text-sm text-rose-600 dark:text-rose-400">
          Couldn&apos;t render the preview. Use the download button above.
        </p>
      )}
      {status === "ready" && (
        <div className="space-y-3">
          {pages.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt={`Resume page ${i + 1}`}
              className="block w-full rounded-lg border border-border bg-white shadow-sm"
            />
          ))}
        </div>
      )}
    </div>
  );
}
