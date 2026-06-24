// runs before every request hits a page. used to be called middleware.js
// before next 16 renamed it to proxy.js. job: gate /portal/* routes so
// only signed-in users get through, and only IT_ADMIN can see /portal/admin.
//
// runs on the edge runtime - thats why we import authConfig (no db) instead
// of the full auth.js (which has prisma).

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import { isElevated } from "./lib/roles";
import { PREVIEW_COOKIE, resolveEffectiveRole } from "./lib/preview";

const { auth } = NextAuth(authConfig);

// admin-only routes. anything matching this pattern needs an elevated
// privilege role (IT_ADMIN / ADMIN / MANAGER per src/lib/roles.js).
const ADMIN_ONLY = /^\/portal\/admin(\/.*)?$/;

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // not signed in -> back to login, but remember where they were trying
  // to go so we can drop them there after they sign in.
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // signed in but role doesnt have elevated access -> bounce to the
  // regular dashboard. the admin pages also check this (defense-in-depth)
  // in case someone bypasses the proxy somehow. we gate on the EFFECTIVE
  // role so the "view as role" preview is consistent here too (a preview
  // can only ever lower access, so this never opens anything up).
  const effectiveRole = resolveEffectiveRole(
    req.auth.user?.role,
    req.cookies.get(PREVIEW_COOKIE)?.value,
  );
  if (ADMIN_ONLY.test(pathname) && !isElevated(effectiveRole)) {
    return NextResponse.redirect(new URL("/portal", req.url));
  }
});

// only run on portal routes - dont waste cycles on the public site.
export const config = {
  matcher: ["/portal/:path*"],
};
