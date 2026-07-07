// full auth.js setup (server-side, can hit the db). the edge-safe
// version is in auth.config.js - that one gets imported by proxy.js
// since middleware/proxy runs on the edge runtime where prisma cant go.

import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { Resend as ResendClient } from "resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";
import { buildSignInEmailHtml } from "@/lib/announcement-email";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    // magic link via resend. apiKey + from come from .env.local.
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.AUTH_RESEND_FROM,
      // override Auth.js's plain default template (the bare "Sign in to
      // localhost:3000" email) so the sign-in link matches our other emails.
      // sending it ourselves via the resend sdk instead of the provider's
      // built-in fetch keeps this in one place with the rest of our mail.
      async sendVerificationRequest({ identifier: to, url, provider }) {
        const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
        // the gradient tree (cyan->blue), matching the light-themed announcement
        // hero. it's a pre-rendered png because email clients strip the css mask
        // + gradient the portal uses to tint the white silhouette. served from a
        // public url (Blob) so it loads in every mail client - a ${base} of
        // localhost in dev would be unreachable from the recipient's device.
        const logoUrl =
          process.env.EMAIL_LOGO_URL || `${base}/logo/treelogo_gradient.png`;
        const resend = new ResendClient(provider.apiKey);
        const { error } = await resend.emails.send({
          from: provider.from,
          to,
          subject: "Your sign-in link for My Life Services",
          html: buildSignInEmailHtml({ logoUrl, url }),
          text: `Sign in to the My Life Services employee portal using the link below.\n\n${url}\n\nThis link is good for the next 24 hours and can only be used once. If you didn't request it, you can safely ignore this email.`,
        });
        if (error) {
          throw new Error(`Resend sign-in email failed: ${error.message || error.name}`);
        }
      },
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
