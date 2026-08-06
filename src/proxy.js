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
  // the whole sign-in flow, not just the form: /login/check-email ("if you have
  // an account you'll get an email") and /login/error are part of it, and
  // bouncing someone to the maintenance splash right after they hit submit
  // makes it look like the sign-in failed.
  const isLogin = pathname === "/login" || pathname.startsWith("/login/");
  const isMaintenancePage = pathname === "/maintenance";
  // unguessable public share links stay reachable during maintenance: forms
  // (/f/<slug>), resources (/r/<id>) and guidebook pages (/g/<slug>). they're
  // direct links handed to specific
  // people, not the public marketing site, so a maintenance window shouldn't
  // break a form you shared with, say, a new hire.
  // /t/<token> is a personal timesheet sign link - payroll deadlines don't pause
  // for a maintenance window, so it stays reachable too.
  // /g/<slug> is a guidebook page shared by its random link. break policy is
  // exactly the sort of thing somebody needs to read on a phone during a
  // maintenance window, and the people it is shared with may have no account.
  const isShareLink =
    pathname.startsWith("/f/") ||
    pathname.startsWith("/r/") ||
    pathname.startsWith("/t/") ||
    pathname.startsWith("/g/");

  // 1. MAINTENANCE GATE - public pages only. the portal, the login page, the
  // maintenance splash, and shared /f/ + /r/ links are always exempt so staff
  // and the people they've shared links with can still get through.
  if (!isPortal && !isLogin && !isMaintenancePage && !isShareLink) {
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
