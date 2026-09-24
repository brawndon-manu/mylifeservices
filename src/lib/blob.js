import { put, del, get, BlobNotFoundError } from "@vercel/blob";
import { isPublicKey, parseBlobUrl } from "./blob-paths.js";

// TWO STORES. the original one is public and now only keeps what the website
// and the emails show to anybody (see blob-paths.js). every record goes in the
// private one.
//
// the PUBLIC store: always hand @vercel/blob its token explicitly.
//
// why: when VERCEL_OIDC_TOKEN is present in the environment (vercel env pull
// writes one), the SDK prefers OIDC auth over BLOB_READ_WRITE_TOKEN. those OIDC
// tokens expire in hours, so once it goes stale every upload fails with
// "Access denied" even though the real Blob token is valid and right there.
// passing the token explicitly skips that resolution entirely and behaves the
// same locally and on Vercel.
export function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN || undefined;
}

// the PRIVATE store has no long-lived key at all: it signs in with Vercel's
// rotating OIDC token plus its store id. on Vercel that token is always there;
// on a laptop `vercel env pull` writes one into the env, good for 12 hours.
// a PRIVATE_BLOB_READ_WRITE_TOKEN, if one is ever set, wins over OIDC.
export function privateBlobAuth() {
  const token = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
  if (token) return { token };
  return { storeId: process.env.PRIVATE_BLOB_STORE_ID || undefined };
}

export function hasPrivateBlobStorage() {
  return !!(process.env.PRIVATE_BLOB_READ_WRITE_TOKEN || process.env.PRIVATE_BLOB_STORE_ID);
}

// both stores configured. a record has nowhere to go without the private one,
// and the callers that ask this skip the upload rather than fail the action,
// so a deploy missing the private store would quietly drop signed copies. say
// so loudly.
let warned = false;
export function hasBlobStorage() {
  const ok = !!process.env.BLOB_READ_WRITE_TOKEN && hasPrivateBlobStorage();
  if (!ok && !warned && process.env.VERCEL_ENV === "production") {
    warned = true;
    console.error("file storage is not fully configured: BLOB_READ_WRITE_TOKEN and PRIVATE_BLOB_STORE_ID are both needed");
  }
  return ok;
}

// drop-in replacement for put(). the key decides the store: a public key goes
// to the public store, anything else to the private one. whatever `access` the
// caller passes is ignored - the bucket is not the caller's call.
export async function putBlob(key, body, opts = {}) {
  const { access: _ignored, token: _alsoIgnored, ...rest } = opts;
  if (isPublicKey(key)) {
    return put(key, body, { ...rest, access: "public", token: blobToken() });
  }
  if (!hasPrivateBlobStorage()) {
    throw new Error("private file storage is not configured (PRIVATE_BLOB_STORE_ID)");
  }
  return put(key, body, { ...rest, access: "private", ...privateBlobAuth() });
}

// what the SDK needs to reach the store behind this url
function authFor(parsed) {
  return parsed.access === "private" ? privateBlobAuth() : { token: blobToken() };
}

// READING A STORED FILE BACK, from whichever store holds it.
//
// returns { bytes, contentType } or null. used wherever the server needs the
// actual bytes - an email attachment, a zip, a page cut out of a pdf.
// `useCache: false` because a few paths are written twice (an addendum's
// service-note pages are cut again when it is raised again), and a read right
// after that must not get the old copy back from the CDN. private store only:
// the public store answers that option with a 400, and nothing in it is ever
// rewritten in place anyway.
export async function readBlob(url) {
  const parsed = parseBlobUrl(url);
  if (!parsed) return null;
  const fresh = parsed.access === "private" ? { useCache: false } : {};
  try {
    const res = await get(url, { access: parsed.access, ...authFor(parsed), ...fresh });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const bytes = new Uint8Array(await new Response(res.stream).arrayBuffer());
    return { bytes, contentType: res.blob.contentType || null };
  } catch (e) {
    console.error("stored file could not be read:", parsed.pathname, e?.message || e);
    return null;
  }
}

// fetch() FOR A STORED FILE. hands back the Response every caller was already
// reading - ok, status, arrayBuffer(), the content-type header - but from
// whichever store holds the file, so a caller swaps one word and the private
// store just works. a url that isn't one of ours is fetched as before.
export async function fetchBlob(url) {
  if (!parseBlobUrl(url)) return fetch(url, { cache: "no-store" });
  const file = await readBlob(url);
  if (!file) return new Response(null, { status: 404 });
  return new Response(file.bytes, {
    status: 200,
    headers: { "content-type": file.contentType || "application/octet-stream" },
  });
}

// OPENING A FILE FOR THE GATE, by pathname rather than url, because the gate
// only ever sees a pathname. the private store first; the public one second,
// for a record still waiting to be moved across. a public PICTURE never comes
// through here - its own url is what the page links to.
export async function openBlob(pathname, { ifNoneMatch } = {}) {
  if (hasPrivateBlobStorage()) {
    try {
      const res = await get(pathname, { access: "private", ...privateBlobAuth(), ifNoneMatch });
      if (res) return res;
    } catch (e) {
      // a pathname the private store has never heard of can throw rather than
      // come back null; the public store still gets its turn
      if (!(e instanceof BlobNotFoundError)) {
        console.error("private store read failed:", pathname, e?.message || e);
      }
    }
  }
  if (!blobToken()) return null;
  try {
    return await get(pathname, { access: "public", token: blobToken(), ifNoneMatch });
  } catch (e) {
    if (e instanceof BlobNotFoundError) return null;
    throw e;
  }
}

// REMOVING A FILE NOTHING POINTS AT ANY MORE.
//
// Two callers need it. Regenerating a batch replaces every certificate PDF in
// it, and deleting a batch takes its certificates and its stored template with
// it. Without this the store keeps a copy of every version that was ever made,
// reachable by nothing - nudging a placement twice on a run of six by eighteen
// strands 216 files.
//
// Takes one URL or a list of them, from either store. A file that is already
// gone is not an error worth stopping for, so callers delete AFTER the record
// is written.
export async function delBlob(urlOrUrls) {
  const urls = (Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls]).filter(Boolean);
  const privateUrls = [];
  const publicUrls = [];
  for (const u of urls) {
    const parsed = parseBlobUrl(u);
    if (!parsed) continue;
    (parsed.access === "private" ? privateUrls : publicUrls).push(u);
  }
  if (privateUrls.length) await del(privateUrls, privateBlobAuth());
  if (publicUrls.length) await del(publicUrls, { token: blobToken() });
}
