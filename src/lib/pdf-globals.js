// LOADING PDFJS ON A SERVER, in one place.
//
// pdfjs reaches for a few browser globals as it loads. node doesn't have them,
// so on a server it dies with "DOMMatrix is not defined" before parsing
// anything. We only ever read text positions - none of the canvas drawing that
// would actually use these - so minimal stand-ins are enough to get it loaded.
//
// SHARED because there are two readers now: the timesheet engine, which reads
// the payroll exports, and the client attestations, which read the schedule
// export. Both need the same shim and the same lazily-imported module, and a
// second private copy of it is a second thing to fix the next time pdfjs moves.
//
// server-only (node Buffer + the pdfjs legacy build). The import is lazy so
// pulling this module into a client bundle or an edge route never drags the
// whole PDF stack in.
function ensurePdfGlobals() {
  const g = globalThis;
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = class DOMMatrix {
      constructor(init) {
        const m = Array.isArray(init) ? init : [1, 0, 0, 1, 0, 0];
        [this.a, this.b, this.c, this.d, this.e, this.f] = m;
      }
      // pdfjs only ever composes transforms on the paths we don't take
      multiply() {
        return this;
      }
      invertSelf() {
        return this;
      }
      translate() {
        return this;
      }
      scale() {
        return this;
      }
    };
  }
  if (typeof g.Path2D === "undefined") {
    g.Path2D = class Path2D {
      addPath() {}
      moveTo() {}
      lineTo() {}
      closePath() {}
      rect() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
    };
  }
  if (typeof g.ImageData === "undefined") {
    g.ImageData = class ImageData {
      constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(Math.max(0, width * height * 4));
      }
    };
  }
}

let pdfjsPromise = null;
export function getPdfjs() {
  if (!pdfjsPromise) {
    ensurePdfGlobals();
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsPromise;
}
