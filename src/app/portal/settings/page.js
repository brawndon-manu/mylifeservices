import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { cleanDisplayName } from "@/lib/security";

export const metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

// max length for display name. 30 = comfortable for "First Last" style
// while still being short enough that the portal header doesn't break.
// cleanDisplayName below also strips control chars + zero-width junk.
const NAME_MAX_LEN = 30;

async function updateDisplayName(formData) {
  "use server";

  const user = await getCurrentUser();
  if (!user) {
    // shouldn't happen since proxy gates /portal/* but defense in depth
    redirect("/login");
  }

  // cleanDisplayName handles: type check, trim, strip control chars,
  // length cap. returns null on garbage input. shared with any other
  // place that accepts a name in the future.
  const name = cleanDisplayName(formData.get("name"), NAME_MAX_LEN);
  if (!name) {
    redirect("/portal/settings?error=1");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { name },
  });

  // back to /portal/settings?saved=1 - the layout re-fetches the user
  // fresh from db so the new name shows in the header immediately, and
  // the query param triggers the green "Saved" banner so the user
  // actually knows the change went through.
  redirect("/portal/settings?saved=1");
}

export default async function SettingsPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // success/error flags come from the server action's redirect. keeps
  // the page server-rendered (no client js for flash messages).
  const params = await searchParams;
  const justSaved = params?.saved === "1";
  const hadError = params?.error === "1";

  return (
    <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-light">
        Settings
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Your account
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-700">
        Update how your name appears in the portal. Your email and role
        are managed by IT and can&apos;t be edited here.
      </p>

      {justSaved && (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <CheckIcon className="mt-0.5 h-5 w-5 flex-none text-emerald-600" />
          <div>
            <p className="font-semibold">Saved</p>
            <p className="mt-0.5 text-emerald-800">
              Your display name has been updated.
            </p>
          </div>
        </div>
      )}

      {hadError && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          <ExclamationIcon className="mt-0.5 h-5 w-5 flex-none text-rose-600" />
          <div>
            <p className="font-semibold">Didn&apos;t save</p>
            <p className="mt-0.5 text-rose-800">
              Display name must be between 1 and {NAME_MAX_LEN} characters.
            </p>
          </div>
        </div>
      )}

      <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <form action={updateDisplayName} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={user.email}
              disabled
              className="mt-1 block w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-base text-slate-500 shadow-sm"
            />
          </div>

          <div>
            <label
              htmlFor="role"
              className="block text-sm font-medium text-slate-700"
            >
              Role
            </label>
            <input
              id="role"
              type="text"
              value={user.role}
              disabled
              className="mt-1 block w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-base text-slate-500 shadow-sm"
            />
          </div>

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-slate-700"
            >
              Display name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={NAME_MAX_LEN}
              defaultValue={user.name ?? ""}
              autoComplete="name"
              placeholder="How you want your name to appear"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-slate-500">
              Up to {NAME_MAX_LEN} characters. Shows on the dashboard
              greeting and in the admin user list.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Save changes
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

// small inline icons for the success/error banners. keeping them local
// so the file is self-contained - if i end up using these elsewhere ill
// hoist them into src/components/Icons.js later.
function CheckIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

function ExclamationIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" />
      <path d="M10 6v4" />
      <path d="M10 14h.01" />
    </svg>
  );
}
