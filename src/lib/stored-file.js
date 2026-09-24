// READING A STORED DOCUMENT BACK, from either place this site keeps one.
//
// Two shapes exist and both are stored in the same columns, which is the whole
// reason this is one function rather than an `if` at each call site. A library
// pick is a same-origin path into public/ - "/forms/qsp-guide.pdf" - and an
// upload is an absolute blob url. `fetch` cannot take the first one in node,
// which is exactly how the forms file route came back 502 the first time it
// was pointed at an ordinary form.
//
// SERVER ONLY: it reads the filesystem.
import fs from "node:fs/promises";
import path from "node:path";
import { readBlob } from "./blob.js";
import { isBlobUrl } from "./blob-paths.js";

// The disk read builds its path at runtime and the tracer does not follow one,
// so every route that calls this has to name its directory in
// next.config.mjs's outputFileTracingIncludes - the trap that ENOENT'd the
// certificate fonts, and the one thing here that only proves itself on a build.
export async function readStoredPdf(url) {
  if (typeof url !== "string" || !url) return null;

  if (url.startsWith("/") && !url.startsWith("//")) {
    const base = path.join(process.cwd(), "public");
    const full = path.resolve(base, url.replace(/^\/+/, ""));
    // never let a stored path climb out of public/. These strings have been
    // through cleanAttachment, but a traversal here reads any file on the
    // server into a document somebody downloads.
    if (full !== base && !full.startsWith(base + path.sep)) return null;
    try {
      return new Uint8Array(await fs.readFile(full));
    } catch {
      return null;
    }
  }

  // ours: either store, the private one included
  if (isBlobUrl(url)) {
    const file = await readBlob(url);
    return file ? file.bytes : null;
  }

  if (/^https:\/\//i.test(url)) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  // anything else - a protocol-relative "//evil.example/x.pdf", an http url, a
  // data uri - is refused rather than fetched
  return null;
}
