// full auth.js setup (server-side, can hit the db). the edge-safe
// version is in auth.config.js - that one gets imported by proxy.js
// since middleware/proxy runs on the edge runtime where prisma cant go.

import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    // magic link via resend. apiKey + from come from .env.local.
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.AUTH_RESEND_FROM,
    }),
  ],
  // explicit cookie config so we know exactly what's happening rather
  // than relying on defaults that might change. Auth.js already does
  // most of this for us but writing it down so future-me knows.
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true, // js cant read it - blocks xss session theft
        sameSite: "lax", // strict would break the magic link redirect from email
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    // gatekeeper - only ACTIVE emails already in the User table can
    // sign in. blocks unknown emails AND deactivated users.
    async signIn({ user, account }) {
      if (account?.provider === "resend") {
        const existing = await prisma.user.findUnique({
          where: { email: user.email },
        });
        if (!existing) return false;
        if (existing.deactivatedAt) return false; // soft-deleted, no entry
      }
      return true;
    },
  },
});
