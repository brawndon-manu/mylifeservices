// edge-safe auth config. this gets imported by proxy.js which runs on
// the edge runtime - no prisma allowed there, so this file has zero
// db code and zero providers (resend has its own deps that pull stuff
// the edge runtime cant handle either).
//
// the full server-side config in auth.js extends this with the prisma
// adapter and the resend provider.

export const authConfig = {
  providers: [], // real providers live in auth.js
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
    error: "/login/error",
  },
  // jwt sessions instead of database sessions. why: lets the proxy/middleware
  // read the user's role from the cookie without a db call on every
  // request. matters more once we're on vercel where db round-trips add up.
  session: { strategy: "jwt" },
  callbacks: {
    // runs on initial sign-in. copy id + role from the db user into
    // the token so we have it for free on every subsequent request.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    // this is what session.user looks like to pages and the proxy.
    // adds id + role on top of the default email/name/image.
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
};
