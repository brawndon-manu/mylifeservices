import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { cleanDisplayName, isLockedSuperEmail } from "@/lib/security";
import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  roleBadgeClass,
  isElevated,
  isIT,
  isManagerUp,
  isSuper,
  isValidRole,
  canAssignRole,
  canManageUser,
  canSeeRoles,
} from "@/lib/roles";
import { resolveTitle } from "@/lib/positions";
import PositionPicker from "../../_components/PositionPicker";
import PhoneInput from "@/components/PhoneInput";
import { formatUSPhone, PHONE_MAX, WORKING_HOURS_MAX } from "@/lib/contacts";

export const metadata = {
  title: "Edit user",
  robots: { index: false, follow: false },
};

// same order as the invite page for muscle-memory consistency. SUPER is
// appended at runtime only for IT viewers (hidden role).
const ROLE_RADIO_ORDER = ["STAFF", "SUPERVISOR", "HR", "MANAGER", "ADMIN", "IT_ADMIN"];

const NAME_MAX_LEN = 30;

// shared helper: gate the action behind IT_ADMIN + load the target user
// + enforce "can't act on yourself" rule. returns { current, target }
// or redirects on any check failure.
async function loadActionTarget(userId) {
  const current = await getCurrentUser();
  if (!isElevated(current?.role)) {
    redirect("/portal");
  }

  // elevated users can't act on themselves - prevents the worst-case lockout
  // scenarios (last admin deactivates themselves, demotes themselves by
  // accident, etc.). SUPER is exempt: their role is force-locked (via
  // LOCKED_SUPER_EMAILS) and they can't be deactivated, so editing their own
  // row (e.g. to set their own title) is safe.
  if (userId === current.id && !isSuper(current.role)) {
    redirect("/portal/admin/users?error=self");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      preferredFirstName: true,
      preferredLastName: true,
      role: true,
      title: true,
      hireDate: true,
      phone: true,
      workingHours: true,
      deactivatedAt: true,
    },
  });
  if (!target) {
    redirect("/portal/admin/users?error=notfound");
  }

  // authority guard: you can only manage a user at or below your own tier.
  // stops e.g. a Manager from editing an Admin/IT/Super account. (changing
  // the role itself is separately gated to IT/Super - see updateUser.)
  if (!canManageUser(current.role, target.role)) {
    redirect("/portal/admin/users?error=forbidden");
  }

  return { current, target };
}

async function updateUser(userId, formData) {
  "use server";
  const { current, target } = await loadActionTarget(userId);

  const name = cleanDisplayName(formData.get("name"), NAME_MAX_LEN);
  if (!name) {
    redirect(`/portal/admin/users/${userId}/edit?error=name`);
  }

  // optional preferred first / last name (blank clears each).
  const preferredFirstName = cleanDisplayName(formData.get("preferredFirstName"), NAME_MAX_LEN);
  const preferredLastName = cleanDisplayName(formData.get("preferredLastName"), NAME_MAX_LEN);

  // positions come from the checkbox group (can be multiple) + an
  // optional custom text field. joined into the title string.
  const title = resolveTitle(
    formData.getAll("titlePositions"),
    formData.get("titleCustom"),
  );

  // hire date is editable by Manager and up only (HR can't touch it). for
  // anyone else we preserve whatever's already on the record. <input type=
  // "date"> gives YYYY-MM-DD which new Date() parses as UTC midnight.
  let hireDate = target.hireDate;
  if (isManagerUp(current.role)) {
    const rawHireDate = formData.get("hireDate");
    hireDate = null;
    if (typeof rawHireDate === "string" && rawHireDate.length > 0) {
      const parsed = new Date(rawHireDate);
      if (!Number.isNaN(parsed.getTime())) {
        hireDate = parsed;
      }
    }
  }

  // privilege role: only IT/Super can change it. for everyone else we keep
  // whatever's already on the record (the form doesn't even show the field
  // to them, but preserve it server-side so a crafted request can't sneak
  // a role in).
  let role = target.role;
  if (isIT(current.role)) {
    const submitted = formData.get("role");
    if (!isValidRole(submitted)) {
      redirect(`/portal/admin/users/${userId}/edit?error=role`);
    }
    // Super for Super, everything else for IT/Super. blocks crafted requests.
    if (!canAssignRole(current.role, submitted)) {
      redirect(`/portal/admin/users/${userId}/edit?error=role`);
    }
    role = submitted;
  }
  // locked superusers (env LOCKED_SUPER_EMAILS) always stay SUPER - their
  // role can't be changed away, no matter what was submitted.
  if (isLockedSuperEmail(target.email)) {
    role = "SUPER";
  }

  // phone is optional - blank clears it. normalized to (xxx) xxx-xxxx.
  const phone = formatUSPhone(formData.get("phone"));

  // working hours: optional free text, trimmed + capped.
  const workingHours = cleanDisplayName(
    formData.get("workingHours"),
    WORKING_HOURS_MAX,
  );

  await prisma.user.update({
    where: { id: userId },
    data: { name, preferredFirstName, preferredLastName, title, hireDate, phone, workingHours, role },
  });

  redirect(`/portal/admin/users?updated=${encodeURIComponent(userId)}`);
}

async function deactivateUser(userId) {
  "use server";
  const { target } = await loadActionTarget(userId);

  // locked superusers can't be deactivated - prevents locking out the
  // permanent owner/IT accounts.
  if (isLockedSuperEmail(target.email)) {
    redirect(`/portal/admin/users/${userId}/edit?error=locked`);
  }

  // already deactivated? no-op, just bounce.
  if (target.deactivatedAt) {
    redirect("/portal/admin/users");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { deactivatedAt: new Date() },
  });

  redirect(`/portal/admin/users?deactivated=${encodeURIComponent(target.email)}`);
}

async function reactivateUser(userId) {
  "use server";
  const { target } = await loadActionTarget(userId);

  await prisma.user.update({
    where: { id: userId },
    data: { deactivatedAt: null },
  });

  redirect(`/portal/admin/users?reactivated=${encodeURIComponent(target.email)}`);
}

export default async function EditUserPage({ params, searchParams }) {
  const { id } = await params;
  const { current, target } = await loadActionTarget(id);

  // only IT/Super can change a role; Admin can see it (read-only); HR/Manager
  // don't see it at all.
  const canEditRole = isIT(current.role);
  const showRole = canSeeRoles(current.role);

  // role options for the picker (IT/Super only): the roles this actor can
  // assign, plus the target's current role so the radio always reflects
  // reality. SUPER is included only for Super.
  const ALL_ROLES = [...ROLE_RADIO_ORDER, "SUPER"];
  const roleOptions = ALL_ROLES.filter(
    (r) => canAssignRole(current.role, r) || r === target.role,
  );

  const queryParams = await searchParams;
  const error = queryParams?.error;
  const errorMessages = {
    name: `Full name must be 1-${NAME_MAX_LEN} characters.`,
    role: "Please pick a role.",
    locked:
      "This is a permanent superuser account: its role can't be changed and it can't be deactivated.",
  };
  const errorMessage = error ? errorMessages[error] : null;

  // bind the userId into the server actions so the form submission
  // knows which user to operate on. next.js server actions can accept
  // bound args via .bind() pattern.
  const updateBound = updateUser.bind(null, id);
  const deactivateBound = deactivateUser.bind(null, id);
  const reactivateBound = reactivateUser.bind(null, id);

  const isDeactivated = !!target.deactivatedAt;

  return (
    <section className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        IT Admin
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Edit user
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted break-words">
        Manage profile and account status for{" "}
        <span className="font-mono text-sm">{target.email}</span>.
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

      {isDeactivated && (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <InfoIcon className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
          <div>
            <p className="font-semibold">This user is deactivated</p>
            <p className="mt-0.5 text-amber-800">
              They can&apos;t sign in. Their data is preserved; reactivate
              below to restore access.
            </p>
          </div>
        </div>
      )}

      {/* Edit name + role form */}
      <div className="mt-10 rounded-xl border border-border bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {showRole ? "Profile + role" : "Profile"}
        </h2>
        <form action={updateBound} className="mt-6 space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-muted"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={target.email}
              disabled
              className="mt-1 block w-full cursor-not-allowed rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-muted shadow-sm"
            />
            <p className="mt-1 text-xs text-muted">
              Permanent sign-in identity. Cannot be changed.
            </p>
          </div>

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-muted"
            >
              Full name <span className="text-rose-600">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={NAME_MAX_LEN}
              defaultValue={target.name ?? ""}
              placeholder="Legal / full name for records"
              className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-muted">
              Full / legal name for records (admin-managed).
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
                defaultValue={target.preferredFirstName ?? ""}
                placeholder="Preferred first name"
                className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <input
                name="preferredLastName"
                type="text"
                maxLength={NAME_MAX_LEN}
                defaultValue={target.preferredLastName ?? ""}
                placeholder="Preferred last name"
                className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              Shown across the portal; each blank piece falls back to the legal
              name for that part. The user can also set this in Settings.
            </p>
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-muted">
              Job title <span className="text-faint">(optional)</span>
            </legend>
            <p className="mt-1 text-xs text-muted">
              Position at MLS. Separate from the portal privilege role
              below.
            </p>
            <PositionPicker
              currentTitle={target.title}
              fieldName="titlePositions"
              customFieldName="titleCustom"
            />
          </fieldset>

          {/* hire date is Manager-and-up only (HR can't edit it) */}
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
              defaultValue={
                target.hireDate
                  ? target.hireDate.toISOString().split("T")[0]
                  : ""
              }
              className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-muted">
              Start date at MLS. Displayed on the admin list with tenure
              (e.g. &quot;3y 2mo&quot;).
            </p>
          </div>
          )}

          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-muted"
            >
              Phone <span className="text-faint">(optional)</span>
            </label>
            <PhoneInput
              id="phone"
              name="phone"
              maxLength={PHONE_MAX}
              defaultValue={target.phone ?? ""}
              autoComplete="off"
              placeholder="(909) 555-0123"
              className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-muted">
              Shows on the Team Contacts directory. They can also set this
              themselves in Settings.
            </p>
          </div>

          <div>
            <label
              htmlFor="workingHours"
              className="block text-sm font-medium text-muted"
            >
              Working hours <span className="text-faint">(optional)</span>
            </label>
            <input
              id="workingHours"
              name="workingHours"
              type="text"
              maxLength={WORKING_HOURS_MAX}
              defaultValue={target.workingHours ?? ""}
              autoComplete="off"
              placeholder="e.g. Mon–Fri 9am–5pm"
              className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-muted">
              Shown on their contact page. They can also set this in Settings.
            </p>
          </div>

          {canEditRole ? (
            <fieldset>
              <legend className="block text-sm font-medium text-muted">
                Privilege role <span className="text-rose-600">*</span>
              </legend>
              <p className="mt-1 text-xs text-muted">
                Controls portal permissions. Only IT can change this.
              </p>
              <div className="mt-3 space-y-2">
                {roleOptions.map((value) => (
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
                      defaultChecked={target.role === value}
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
          ) : showRole ? (
            // Admin can see the role but not change it - read-only display.
            <div>
              <p className="block text-sm font-medium text-muted">Privilege role</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${roleBadgeClass(target.role)}`}>
                  {ROLE_LABELS[target.role] ?? target.role}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Set by IT. Ask an IT admin to change a privilege role.
              </p>
            </div>
          ) : null}

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
              Save changes
            </button>
          </div>
        </form>
      </div>

      {/* Activate / deactivate */}
      <div className="mt-8 rounded-xl border border-border bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Account status
        </h2>
        {isDeactivated ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Restore portal access. They&apos;ll be able to sign in again
              with the role currently set above.
            </p>
            <form action={reactivateBound} className="mt-5">
              <button
                type="submit"
                className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                Reactivate user
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Block this user from signing in. Their account stays in the
              database with all data intact; you can reactivate at any
              time. Use this when someone leaves the company.
            </p>
            <form action={deactivateBound} className="mt-5">
              <button
                type="submit"
                className="rounded-md border border-rose-300 bg-surface px-5 py-2.5 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
              >
                Deactivate user
              </button>
            </form>
          </>
        )}
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

function InfoIcon({ className }) {
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
      <path d="M10 9v5" />
      <path d="M10 6h.01" />
    </svg>
  );
}
