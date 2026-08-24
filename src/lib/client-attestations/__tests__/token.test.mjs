import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AUTH_SECRET = "test-secret";
const { signAttestationToken, verifyAttestationToken } = await import("../token.js");

test("a token round-trips its id and audience", () => {
  const t = signAttestationToken("cmt123abc", "client");
  assert.deepEqual(verifyAttestationToken(t), { attestationId: "cmt123abc", audience: "client" });
});

test("the audience cannot be swapped without failing the signature", () => {
  const clientToken = signAttestationToken("cmt123abc", "client");
  const supervisorToken = signAttestationToken("cmt123abc", "supervisor");
  // splice the supervisor body onto the client signature
  const forged = `${supervisorToken.split(".")[0]}.${clientToken.split(".")[1]}`;
  assert.equal(verifyAttestationToken(forged), null);
});

test("a tampered or malformed token verifies to nothing", () => {
  const t = signAttestationToken("cmt123abc", "staff");
  assert.equal(verifyAttestationToken(t.slice(0, -2) + "xx"), null);
  assert.equal(verifyAttestationToken("nonsense"), null);
  assert.equal(verifyAttestationToken(null), null);
});

test("an unknown audience is refused at signing time", () => {
  assert.throws(() => signAttestationToken("cmt123abc", "admin"));
});
