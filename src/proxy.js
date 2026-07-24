// runs before every request hits a page. used to be called middleware.js
// before next 16 renamed it to proxy.js. two jobs:
//
//   1. MAINTENANCE MODE - when the switch is on (flipped from the portal), the
//      public site is replaced by the /maintenance splash. the employee portal
//      and the login page stay reachable so staff can still work and sign in,
//      and anyone holding a valid signed bypass cookie gets straight through.
//
//   2. PORTAL GATE - only signed-in users get into /portal/*, and only elevated
//      roles get into /portal/admin.
//
// runs on the edge runtime - thats why we import authConfig (no db) instead of
// the full auth.js (which has prisma). the maintenance flag + bypass check are
// edge-safe too (upstash over fetch, HMAC over Web Crypto).

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import { isElevated } from "./lib/roles";
import { PREVIEW_COOKIE, resolveEffectiveRole } from "./lib/preview";
import { isMaintenanceOn } from "./lib/maintenance";
import { BYPASS_COOKIE, verifyBypassToken } from "./lib/maintenance-token";

const { auth } = NextAuth(authConfig);

// admin-only routes. anything matching this pattern needs an elevated
// privilege role (IT_ADMIN / ADMIN / MANAGER per src/lib/roles.js).
const ADMIN_ONLY = /^\/portal\/admin(\/.*)?$/;

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const isPortal = pathname.startsWith("/portal");
  const isLogin = pathname === "/login";
  const isMaintenancePage = pathname === "/maintenance";

  // 1. MAINTENANCE GATE - public pages only. the portal, the login page, and
  // the maintenance splash itself are always exempt so staff can still get in.
  if (!isPortal && !isLogin && !isMaintenancePage) {
    if (await isMaintenanceOn()) {
      const token = req.cookies.get(BYPASS_COOKIE)?.value;
      if (!(await verifyBypassToken(token))) {
        // redirect (not rewrite) so the URL becomes /maintenance - that lets the
        // page drop the public header/footer (PublicChrome keys off the path).
        return NextResponse.redirect(new URL("/maintenance", req.url));
      }
    }
  }

  // 2. PORTAL GATE.
  if (isPortal) {
    // not signed in -> back to login, but remember where they were trying to
    // go so we can drop them there after they sign in.
    if (!req.auth) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // signed in but role doesnt have elevated access -> bounce to the regular
    // dashboard. gated on the EFFECTIVE role so the "view as role" preview is
    // consistent here too (a preview can only ever lower access).
    const effectiveRole = resolveEffectiveRole(
      req.auth.user?.role,
      req.cookies.get(PREVIEW_COOKIE)?.value,
    );
    if (ADMIN_ONLY.test(pathname) && !isElevated(effectiveRole)) {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  }
});

// run on everything except api routes, next internals, and static files (which
// carry a dot, e.g. /logo/tree.png). the maintenance gate needs to see public
// pages, not just /portal like it used to.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
