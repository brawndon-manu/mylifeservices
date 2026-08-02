import { put } from "@vercel/blob";

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
