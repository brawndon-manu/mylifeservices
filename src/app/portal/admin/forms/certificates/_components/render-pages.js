"use client";

// DRAWING A TEMPLATE THE WAY IT WILL PRINT.
//
// One path, two callers: a blank being uploaded for a new run, and a stored
// template being reopened to move its name. The numbers this returns are what
// every placement is measured against - w and h are the picture on screen,
// pdfW and pdfH are the real page - so two versions of this would be two
// different ideas of where the middle of the page is.

const WORKER_SRC = "/pdf.worker.min.mjs";
const SHOWN_WIDTH = 700;

export async function renderPages(buf) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
  const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = SHOWN_WIDTH / base.width;
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
  return pages;
}
