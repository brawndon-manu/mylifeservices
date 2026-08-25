import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

// LOCAL DEV SIGN-IN, because a home-screen web app starts logged out and has
// no address bar to paste a magic link into. iOS gives an installed web app
// its own cookie container - Safari's session never carries over - and the
// sign-in email lands in a mailbox the simulator can't open. This route mints
// the same one-time verification token the email would carry and walks the
// browser through the normal Auth.js callback, so the session lands in
// WHATEVER container opened it - including the installed app's.
//
// `next dev` ONLY. Production and preview builds both run with
// NODE_ENV=production, so there this route is a 404 and the login page never
// renders a link to it. Signs in as the seed admin - the same account every
// other dev convenience uses.
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  const email = (process.env.SEED_ADMIN_EMAILS || "").split(",")[0]?.trim();
  if (!email) return new NextResponse("Not found", { status: 404 });

  // the exact token shape Auth.js expects: raw in the URL, sha256 of
  // raw+secret in the table. the callback consumes it - single use.
  const raw = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: createHash("sha256").update(`${raw}${process.env.AUTH_SECRET}`).digest("hex"),
      expires: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  const url = new URL("/api/auth/callback/resend", req.url);
  url.searchParams.set("callbackUrl", "/portal");
  url.searchParams.set("token", raw);
  url.searchParams.set("email", email);
  return NextResponse.redirect(url);
}
