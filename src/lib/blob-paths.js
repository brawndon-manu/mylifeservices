// WHICH BUCKET A STORED FILE BELONGS IN, AND WHAT THE BROWSER GETS TO SEE OF IT.
//
// there are two blob stores. the public one holds what the website and the
// emails show to anybody: site photos, newsletter pictures, the email logo, and
// the pictures an announcement email loads from the web. everything else is a
// record - a signed timesheet, an attestation, a filled form, a certificate, a
// hub photo - and goes in the private store, which nothing can read without the
// server's key. a private file only ever reaches a browser through
// /portal/files, which checks who is asking first.
//
// dependency-free on purpose: client components and the node tests import it.

// the prefixes allowed on the open internet. an announcement's pdfs are the
// exception inside announcements/ - they ride on the email as attachments, so
// nothing outside the portal ever needs to load them from a url.
const PUBLIC_PREFIXES = ["site/", "newsletter/", "email/", "announcements/"];
const PRIVATE_INSIDE_PUBLIC = ["announcements/docs/"];

export const FILES_ROUTE = "/portal/files";

const BLOB_URL = /^https:\/\/([a-z0-9]+)\.(public|private)\.blob\.vercel-storage\.com\/([^?#]+)/i;

export function isPublicKey(key) {
  const k = String(key || "").replace(/^\/+/, "");
  if (PRIVATE_INSIDE_PUBLIC.some((p) => k.startsWith(p))) return false;
  return PUBLIC_PREFIXES.some((p) => k.startsWith(p));
}

// { store, access, pathname } for a url one of our stores handed out, else null.
// the pathname comes back decoded - "timesheets/src/x/clock-Clock Report.xls".
export function parseBlobUrl(url) {
  const m = BLOB_URL.exec(String(url || ""));
  if (!m) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(m[3]);
  } catch {
    return null;
  }
  return { store: m[1].toLowerCase(), access: m[2].toLowerCase(), pathname };
}

export const isBlobUrl = (url) => parseBlobUrl(url) !== null;
export const isPrivateBlobUrl = (url) => parseBlobUrl(url)?.access === "private";

// a stored pathname safe to hand to the store: no empty, "." or ".." segments.
// the access rules key off the first segment, so "hub/../timesheets/x.pdf"
// must never get as far as a lookup.
export function cleanPathname(segments) {
  const parts = Array.isArray(segments) ? segments : String(segments || "").split("/");
  if (!parts.length) return null;
  for (const p of parts) {
    if (typeof p !== "string" || !p || p === "." || p === ".." || p.includes("\\") || p.includes("\0")) {
      return null;
    }
  }
  return parts.join("/");
}

// the link a page hands the browser for a stored file. public pictures keep
// their own url so the CDN serves them; every record goes through the gate,
// whichever store it sits in today - a record still in the public store
// (before the move) gets the gated link as well, so no page shows its address.
export function fileHref(url) {
  const parsed = parseBlobUrl(url);
  if (!parsed) return url;
  if (parsed.access === "public" && isPublicKey(parsed.pathname)) return url;
  return `${FILES_ROUTE}/${parsed.pathname.split("/").map(encodeURIComponent).join("/")}`;
}

// next/image can't optimise a gated file - its optimiser fetches without the
// visitor's cookies and gets turned away - so those render unoptimised.
export const isGatedHref = (href) => typeof href === "string" && href.startsWith(`${FILES_ROUTE}/`);
