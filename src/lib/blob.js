import { put, del } from "@vercel/blob";

// always hand @vercel/blob the store token explicitly.
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

export function hasBlobStorage() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

// drop-in replacement for put() that pins the token.
export async function putBlob(key, body, opts = {}) {
  return put(key, body, { token: blobToken(), ...opts });
}

// REMOVING A FILE NOTHING POINTS AT ANY MORE.
//
// Two callers need it. Regenerating a batch replaces every certificate PDF in
// it, and deleting a batch takes its certificates and its stored template with
// it. Without this the store keeps a copy of every version that was ever made,
// reachable by nothing - nudging a placement twice on a run of six by eighteen
// strands 216 files.
//
// Takes one URL or a list of them. A file that is already gone is not an
// error worth stopping for, so callers delete AFTER the record is written.
export async function delBlob(urlOrUrls) {
  return del(urlOrUrls, { token: blobToken() });
}
