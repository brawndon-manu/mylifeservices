// validates the maintenance bypass password and, on success, drops a signed
// httpOnly cookie so the visitor can browse the site while it's in maintenance.
//
// hardening: rate-limited per IP (upstash, shared limiter), the password is
// checked as a salted HMAC in constant time (see lib/maintenance-token), and
// the cookie is an HMAC-signed short-lived token the edge proxy verifies. the
// raw password is never stored anywhere client-side.

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { checkRateLimit } from "@/lib/security";
import {
  BYPASS_COOKIE,
  checkBypassPassword,
  createBypassToken,
} from "@/lib/maintenance-token";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const { ok: underLimit } = await checkRateLimit(`maint-bypass:${ip}`);
  if (!underLimit) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please wait a minute and try again." },
      { status: 429 },
    );
  }

  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    // fall through with empty password -> fails the check below
  }

  if (!(await checkBypassPassword(password))) {
    return NextResponse.json(
      { ok: false, error: "That password isn't right." },
      { status: 401 },
    );
  }

  const store = await cookies();
  store.set(BYPASS_COOKIE, await createBypassToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8h, matches the token's own expiry
  });

  return NextResponse.json({ ok: true });
}
