import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { cleanEmail, cleanDisplayName } from "@/lib/security";
import {
  ROLES,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  isElevated,
  isValidRole,
} from "@/lib/roles";

export const metadata = {
  title: "Invite user",
  robots: { index: false, follow: false },
};

// render the role radios in this order. STAFF is the default since
// least-privilege should be the easy choice.
const ROLE_RADIO_ORDER = ["STAFF", "SUPERVISOR", "HR", "MANAGER", "ADMIN", "IT_ADMIN"];

const NAME_MAX_LEN = 30;
const TITLE_MAX_LEN = 60;

// suggested titles for the datalist autocomplete. free-form field but
// these are the common ones for MLS so admins dont have to type from
// scratch.
const TITLE_SUGGESTIONS = [
  "Owner/Director",
  "Program Manager",
  "Field Supervisor",
  "HR Administrator",
  "Independent Living Instructor",
  "Day Program",
  "Supported Living",
  "Self-Determination",
  "Crisis Support",
  "Attendant",
  "Lead Staff",
  "Case Manager",
  "Resources Specialist",
  "Quality Assurance Specialist",
];

async function inviteUser(formData) {
  "use server";

  // gatekeep: only elevated roles can invite. proxy.js gates
  // /portal/admin/* but check again here for defense-in-depth.
  const current = await getCurrentUser();
  if (!isElevated(current?.role)) {
    redirect("/portal");
  }

  // validate email
  const email = cleanEmail(formData.get("email"));
  if (!email) {
    redirect("/portal/admin/users/new?error=email");
  }

  // name is optional. if user left it blank we default to the email's
  // local part (everything before @). gives a sensible placeholder
  // until the new user updates it themselves via /portal/settings.
  const rawName = formData.get("name");
  let name;
  if (typeof rawName === "string" && rawName.trim().length > 0) {
    name = cleanDisplayName(rawName, NAME_MAX_LEN);
    if (!name) {
      redirect("/portal/admin/users/new?error=name");
    }
  } else {
    name = email.split("@")[0];
  }

  // title is also optional. trim + length-cap. if blank we leave it null.
  const rawTitle = formData.get("title");
  let title = null;
  if (typeof rawTitle === "string" && rawTitle.trim().length > 0) {
    title = rawTitle.trim().slice(0, TITLE_MAX_LEN);
  }

  // hire date is optional. <input type="date"> returns YYYY-MM-DD which
  // new Date() parses as UTC midnight.
  const rawHireDate = formData.get("hireDate");
  let hireDate = null;
  if (typeof rawHireDate === "string" && rawHireDate.length > 0) {
    const parsed = new Date(rawHireDate);
    if (!Number.isNaN(parsed.getTime())) {
      hireDate = parsed;
    }
  }

  // validate role - has to be one of our allowed enum values. dont
  // trust the radio value blindly, someone could craft a request with
  // a bogus role string.
  const role = formData.get("role");
  if (!isValidRole(role)) {
    redirect("/portal/admin/users/new?error=role");
  }

  // check for duplicate. if the email is already in the db, redirect
  // back with a specific error so the admin knows to update the role
  // on the existing user instead of trying to re-invite.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/portal/admin/users/new?error=exists");
  }

  await prisma.user.create({
    data: { email, name, role, title, hireDate },
  });

  // back to the admin user list with a success flag.
  redirect(`/portal/admin?invited=${encodeURIComponent(email)}`);
}

export default async function NewUserPage({ searchParams }) {
  const current = await getCurrentUser();
  if (!isElevated(current?.role)) {
    redirect("/portal");
  }

  const params = await searchParams;
  const error = params?.error;

  const errorMessages = {
    email: "That doesn't look like a valid email. Please double-check.",
    name: `Display name must be 1-${NAME_MAX_LEN} characters.`,
    role: "Please pick a role for the new user.",
    exists:
      "Someone with that email already has portal access. Edit their role on the user list instead.",
  };
  const errorMessage = error ? errorMessages[error] : null;

  return (
    <section className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-light">
        IT Admin
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Invite user
      </h1>
      <p className="mt-4 text-base leading-relaxed text-slate-700">
        Add someone to the portal. After saving, they can sign in by
        visiting <span className="font-mono text-sm">/login</span> and
        entering their email — they&apos;ll get a magic-link sign-in
        email. No password to share.
      </p>

      {errorMessage && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          <ExclamationIcon className="mt-0.5 h-5 w-5 flex-none text-rose-600" />
          <div>
            <p className="font-semibold">Couldn&apos;t save</p>
            <p className="mt-0.5 text-rose-800">{errorMessage}</p>
          </div>
        </div>
      )}

      <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <form action={inviteUser} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              Email <span className="text-rose-600">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              maxLength={254}
              placeholder="person@example.com"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-slate-500">
              This is the address they&apos;ll receive sign-in links at.
              They&apos;ll sign in by clicking the link, no password.
            </p>
          </div>

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-slate-700"
            >
              Display name <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              maxLength={NAME_MAX_LEN}
              autoComplete="off"
              placeholder="Leave blank to use email prefix"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-slate-500">
              Up to {NAME_MAX_LEN} characters. They can change this
              themselves in Settings after signing in.
            </p>
          </div>

          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-slate-700"
            >
              Job title <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              list="title-suggestions"
              maxLength={TITLE_MAX_LEN}
              autoComplete="off"
              placeholder="e.g. Program Manager, ILS, Field Supervisor"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <datalist id="title-suggestions">
              {TITLE_SUGGESTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-slate-500">
              Their actual job title at MLS. Separate from their portal
              privilege role below. Pick from suggestions or type your own.
            </p>
          </div>

          <div>
            <label
              htmlFor="hireDate"
              className="block text-sm font-medium text-slate-700"
            >
              Hire date <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="hireDate"
              name="hireDate"
              type="date"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-slate-500">
              When they started at MLS. Used on the admin list to show
              tenure. Leave blank if unknown.
            </p>
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-slate-700">
              Privilege role <span className="text-rose-600">*</span>
            </legend>
            <p className="mt-1 text-xs text-slate-500">
              Controls what they can do in the portal. Elevated (IT,
              Admin, Manager) can manage users + post announcements.
              Others get read access.
            </p>
            <div className="mt-3 space-y-2">
              {ROLE_RADIO_ORDER.map((value, i) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 transition hover:border-brand-light hover:bg-sky-50"
                >
                  <input
                    type="radio"
                    name="role"
                    value={value}
                    defaultChecked={i === 0}
                    required
                    className="mt-1 h-4 w-4 accent-brand"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">
                      {ROLE_LABELS[value]}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600">
                      {ROLE_DESCRIPTIONS[value]}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
            <Link
              href="/portal/admin"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-brand-light px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Invite
            </button>
          </div>
        </form>
      </div>
    </section>
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
