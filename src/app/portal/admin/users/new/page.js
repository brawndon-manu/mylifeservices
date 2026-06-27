import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { notifyOversight } from "@/lib/notify";
import { cleanEmail, cleanDisplayName } from "@/lib/security";
import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  isElevated,
  isIT,
  isManagerUp,
  isValidRole,
  canAssignRole,
} from "@/lib/roles";
import { resolveTitle } from "@/lib/positions";
import { preferredName } from "@/lib/contacts";
import PositionPicker from "../_components/PositionPicker";

export const metadata = {
  title: "Invite user",
  robots: { index: false, follow: false },
};

// render the role radios in this order. STAFF is the default since
// least-privilege should be the easy choice.
const ROLE_RADIO_ORDER = ["STAFF", "SUPERVISOR", "HR", "MANAGER", "ADMIN", "IT_ADMIN"];

const NAME_MAX_LEN = 30;

async function inviteUser(formData) {
  "use server";

  // gatekeep: the oversight tier (HR/Manager/Admin/IT/Super) can invite.
  // proxy.js gates /portal/admin/* but check again here for defense-in-depth.
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

  // positions come from the checkbox group (can be multiple) + an
  // optional custom text field. joined into the title string.
  const title = resolveTitle(
    formData.getAll("titlePositions"),
    formData.get("titleCustom"),
  );

  // hire date is Manager-and-up only (HR can't set it). <input type="date">
  // returns YYYY-MM-DD which new Date() parses as UTC midnight.
  let hireDate = null;
  if (isManagerUp(current.role)) {
    const rawHireDate = formData.get("hireDate");
    if (typeof rawHireDate === "string" && rawHireDate.length > 0) {
      const parsed = new Date(rawHireDate);
      if (!Number.isNaN(parsed.getTime())) {
        hireDate = parsed;
      }
    }
  }

  // privilege role: only IT/Super set it - everyone else creates a Staff
  // user (the form doesn't show the field to them, but force STAFF here so a
  // crafted request can't sneak a role in). don't trust the radio blindly.
  let role = "STAFF";
  if (isIT(current.role)) {
    const submitted = formData.get("role");
    if (!isValidRole(submitted)) {
      redirect("/portal/admin/users/new?error=role");
    }
    // Super for Super, everything else for IT/Super.
    if (!canAssignRole(current.role, submitted)) {
      redirect("/portal/admin/users/new?error=role");
    }
    role = submitted;
  }

  // check for duplicate. if the email is already in the db, redirect
  // back with a specific error so the admin knows to update the role
  // on the existing user instead of trying to re-invite.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/portal/admin/users/new?error=exists");
  }

  // optional preferred first / last name (shown instead of the legal name).
  const preferredFirstName = cleanDisplayName(formData.get("preferredFirstName"), NAME_MAX_LEN);
  const preferredLastName = cleanDisplayName(formData.get("preferredLastName"), NAME_MAX_LEN);

  await prisma.user.create({
    data: { email, name, preferredFirstName, preferredLastName, role, title, hireDate },
  });

  await notifyOversight({
    type: "USER_ADDED",
    title: "New user invited",
    body: `${preferredName(current)} invited ${email} (${ROLE_LABELS[role] ?? role}).`,
    link: "/portal/admin/users",
    exceptUserId: current.id,
  });

  // back to the admin user list with a success flag.
  redirect(`/portal/admin/users?invited=${encodeURIComponent(email)}`);
}

export default async function NewUserPage({ searchParams }) {
  const current = await getCurrentUser();
  if (!isElevated(current?.role)) {
    redirect("/portal");
  }

  // only IT/Super pick a privilege role; everyone else creates a Staff user.
  const canEditRole = isIT(current.role);
  const ALL_ROLES = [...ROLE_RADIO_ORDER, "SUPER"];
  const roleOptions = ALL_ROLES.filter((r) => canAssignRole(current.role, r));

  const params = await searchParams;
  const error = params?.error;

  const errorMessages = {
    email: "That doesn't look like a valid email. Please double-check.",
    name: `Full name must be 1-${NAME_MAX_LEN} characters.`,
    role: "Please pick a role for the new user.",
    exists:
      "Someone with that email already has portal access. Edit their role on the user list instead.",
  };
  const errorMessage = error ? errorMessages[error] : null;

  return (
    <section className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        IT Admin
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Invite user
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        Add someone to the portal. After saving, they can sign in by
        visiting <span className="font-mono text-sm">/login</span> and
        entering their email. They&apos;ll get a magic-link sign-in
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

      <div className="mt-10 rounded-xl border border-border bg-surface p-6 sm:p-8">
        <form action={inviteUser} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-muted"
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
              className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-muted">
              Sign-in address. Magic links are sent here, no password
              required.
            </p>
          </div>

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-muted"
            >
              Full name <span className="text-faint">(optional)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              maxLength={NAME_MAX_LEN}
              autoComplete="off"
              placeholder="Legal / full name for records"
              className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-muted">
              Up to {NAME_MAX_LEN} characters. Leave blank to use the email
              prefix. The user can set a preferred display name in Settings.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted">
              Preferred name <span className="text-faint">(optional)</span>
            </label>
            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                name="preferredFirstName"
                type="text"
                maxLength={NAME_MAX_LEN}
                autoComplete="off"
                placeholder="Preferred first name"
                className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <input
                name="preferredLastName"
                type="text"
                maxLength={NAME_MAX_LEN}
                autoComplete="off"
                placeholder="Preferred last name"
                className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              Shown across the portal; each blank piece falls back to the legal
              name for that part. The user can change this in Settings.
            </p>
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-muted">
              Job title <span className="text-faint">(optional)</span>
            </legend>
            <p className="mt-1 text-xs text-muted">
              Position at MLS. Separate from the portal privilege role
              below. Pick one or use Custom.
            </p>
            <PositionPicker
              fieldName="titlePositions"
              customFieldName="titleCustom"
            />
          </fieldset>

          {/* hire date is Manager-and-up only (HR can't set it) */}
          {isManagerUp(current.role) && (
          <div>
            <label
              htmlFor="hireDate"
              className="block text-sm font-medium text-muted"
            >
              Hire date <span className="text-faint">(optional)</span>
            </label>
            <input
              id="hireDate"
              name="hireDate"
              type="date"
              className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-muted">
              Start date at MLS. Used on the admin list to show tenure.
              Leave blank if unknown.
            </p>
          </div>
          )}

          {canEditRole ? (
            <fieldset>
              <legend className="block text-sm font-medium text-muted">
                Privilege role <span className="text-rose-600">*</span>
              </legend>
              <p className="mt-1 text-xs text-muted">
                Controls portal permissions. Only IT can set this.
              </p>
              <div className="mt-3 space-y-2">
                {roleOptions.map((value, i) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                      value === "SUPER"
                        ? "border-rose-200 bg-rose-50 hover:border-rose-300"
                        : "border-border bg-surface-2 hover:border-brand-light hover:bg-sky-50"
                    }`}
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
                      <div
                        className={`text-sm font-medium ${
                          value === "SUPER" ? "text-rose-700" : "text-foreground"
                        }`}
                      >
                        {ROLE_LABELS[value]}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {ROLE_DESCRIPTIONS[value]}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            // HR/Manager/Admin invite users but don't set roles - new users
            // start as Staff; IT bumps the role later if needed.
            <p className="rounded-md border border-border bg-surface-2 p-3 text-xs text-muted">
              New users start with Staff access. Privilege roles are set by IT.
            </p>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
            <Link
              href="/portal/admin/users"
              className="text-sm font-medium text-muted transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
