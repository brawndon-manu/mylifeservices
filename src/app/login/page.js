import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/prisma";
import { cleanEmail, safeCallbackUrl, checkRateLimit } from "@/lib/security";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export const metadata = {
  title: "Sign in",
  description: "Sign in to the My Life Services employee portal.",
  // keep this page out of google etc. - its not for the public.
  robots: { index: false, follow: false },
};

async function sendMagicLink(formData) {
  "use server";

  // grab the requester's ip so we can rate-limit by it. vercel puts the
  // real ip in x-forwarded-for (might be a comma-separated list, first
  // entry is the client). fall back to "unknown" if nothing's there -
  // worst case all unknown-ip requests share a bucket which is fine.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

  // cap login attempts per ip. if they're over, just pretend it worked
  // and bounce them to the check-email page - dont tell them we're
  // rate-limiting (no extra info for attackers). awaited cause this
  // hits upstash over the network.
  const limit = await checkRateLimit(`login:${ip}`);
  if (!limit.ok) {
    redirect("/login/check-email");
  }

  // validate + normalize before doing anything with the input. if its
  // garbage, bail out the same way we bail for unknown emails (silent
  // redirect to check-email page) so attackers cant tell the difference.
  const email = cleanEmail(formData.get("email"));
  if (!email) {
    redirect("/login/check-email");
  }

  // only allow callbackUrls that are same-origin paths. blocks open
  // redirects where someone crafts a /login?callbackUrl=//evil.com link.
  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl"));

  // anti-enumeration: if the email isnt one of ours, dont send a magic
  // link but still show the same "check your email" page. attacker
  // cant tell whether an email is on file or not. the signIn callback
  // in auth.js also enforces this server-side as defense-in-depth.
  const exists = await prisma.user.findUnique({ where: { email } });
  if (!exists) {
    redirect("/login/check-email");
  }

  // wrap this so resend hiccups (free-tier limits, api outage, whatever)
  // dont leak via the error page. all failures should look identical to
  // the "we sent it" page from the outside.
  // NEXT_REDIRECT is what next throws to actually perform the redirect
  // after a successful signIn - that one we have to re-throw or nothing
  // happens. AuthError covers everything auth.js wraps internally.
  try {
    await signIn("resend", { email, redirectTo: callbackUrl });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect("/login/check-email");
    }
    throw err;
  }
}

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  // sanitize this on the way in too - this value gets stuffed into a
  // hidden input and posted back. dont want to echo arbitrary stuff.
  const callbackUrl = safeCallbackUrl(params?.callbackUrl);
  const error = params?.error;

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Employee portal
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Sign in
      </h1>
      <p className="mt-3 text-base leading-relaxed text-slate-700">
        Enter your work email and we&apos;ll send you a one-time sign-in
        link.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          Something went wrong. Try again, or contact IT if the problem
          persists.
        </div>
      )}

      <form action={sendMagicLink} className="mt-8 space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-700"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            // hard cap the length on the client too. server still
            // validates with cleanEmail() - dont trust the browser.
            maxLength={254}
            placeholder="you@example.com"
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-brand-light px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Send sign-in link
        </button>
      </form>
    </section>
  );
}
