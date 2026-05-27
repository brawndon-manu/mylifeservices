// runs before every request hits a page. used to be called middleware.js
// before next 16 renamed it to proxy.js. job: gate /portal/* routes so
// only signed-in users get through, and only IT_ADMIN can see /portal/admin.
//
// runs on the edge runtime - thats why we import authConfig (no db) instead
// of the full auth.js (which has prisma).

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

// admin-only routes. anything matching this pattern needs role IT_ADMIN.
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

  // signed in but not an admin -> bounce them back to the regular
  // dashboard. the admin page itself also checks this (defense-in-depth)
  // in case someone bypasses the proxy.
  if (ADMIN_ONLY.test(pathname) && req.auth.user?.role !== "IT_ADMIN") {
    return NextResponse.redirect(new URL("/portal", req.url));
  }
});

// only run on portal routes - dont waste cycles on the public site.
export const config = {
  matcher: ["/portal/:path*"],
};
