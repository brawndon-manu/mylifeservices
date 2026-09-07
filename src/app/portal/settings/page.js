import { redirect } from "next/navigation";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { cleanDisplayName } from "@/lib/security";
import { isAdminUp, ROLE_LABELS } from "@/lib/roles";
import { formatUSPhone, preferredName, PHONE_MAX, WORKING_HOURS_MAX } from "@/lib/contacts";
import { IMAGE_ACCEPT, IMAGE_MAX_BYTES } from "@/lib/hub";
import Avatar from "@/components/Avatar";
import PhoneInput from "@/components/PhoneInput";
import AppearanceSettings from "../_components/AppearanceSettings";
import PhotoControl from "./PhotoControl";

export const metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

// max length for display name. 30 = comfortable for "First Last" style
// while still being short enough that the portal header doesn't break.
// cleanDisplayName below also strips control chars + zero-width junk.
const NAME_MAX_LEN = 30;

async function updateProfile(formData) {
  "use server";

  const user = await getCurrentUser();
  if (!user) {
    // shouldn't happen since proxy gates /portal/* but defense in depth
    redirect("/login");
  }

  // preferred first / last name - optional, blank clears (the directory then
  // falls back to the legal first/last for that piece). cleanDisplayName trims,
  // strips control chars, caps length; null when blank.
  const preferredFirstName = cleanDisplayName(formData.get("preferredFirstName"), NAME_MAX_LEN);
  const preferredLastName = cleanDisplayName(formData.get("preferredLastName"), NAME_MAX_LEN);

  // phone is optional - blank clears it. normalized to (xxx) xxx-xxxx.
  const phone = formatUSPhone(formData.get("phone"));

  // working hours: optional free text. cleanDisplayName trims + strips
  // control chars + caps length; returns null when blank, which clears it.
  const workingHours = cleanDisplayName(
    formData.get("workingHours"),
    WORKING_HOURS_MAX,
  );

  // photo: optional upload, or a "remove" flag. only touch the
  // image column when one of those is set so a plain name/phone save
  // doesnt wipe an existing photo.
  let imageUpdate = {};
  const removePhoto = formData.get("removePhoto") === "on";
  const file = formData.get("photo");
  const hasFile =
    file && typeof file === "object" && "size" in file && file.size > 0;

  if (hasFile) {
    if (!IMAGE_ACCEPT.includes(file.type)) {
      redirect("/portal/settings?error=photoType");
    }
    if (file.size > IMAGE_MAX_BYTES) {
      redirect("/portal/settings?error=photoSize");
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      redirect("/portal/settings?error=photoUpload");
    }
    try {
      const ext = (file.name?.split(".").pop() || "jpg").toLowerCase().slice(0, 8);
      const key = `avatars/${user.id}-${Date.now()}.${ext}`;
      const blob = await put(key, file, { access: "public", contentType: file.type });
      imageUpdate = { image: blob.url };
    } catch {
      redirect("/portal/settings?error=photoUpload");
    }
    // best-effort cleanup of the previous avatar blob
    if (user.image?.includes("blob.vercel-storage.com")) {
      try {
        await del(user.image);
      } catch {
        // ignore
      }
    }
  } else if (removePhoto) {
    if (user.image?.includes("blob.vercel-storage.com")) {
      try {
        await del(user.image);
      } catch {
        // ignore
      }
    }
    imageUpdate = { image: null };
  }

  // hide the full/legal name from coworkers (oversight + self still see it).
  const hideLegalName = formData.get("hideLegalName") === "on";

  // `sharePhonePublicly` IS NO LONGER WRITTEN, and leaving it out is the whole
  // point rather than an oversight.
  //
  // The public card stopped showing any number on 2026-08-16, so its checkbox
  // came off this form. An unchecked box and an absent box are the same thing
  // to `formData.get`, so had this line stayed, the FIRST TIME each person
  // saved anything here - a new photo, a working-hours edit - it would have
  // quietly written `false` over the choice they had made. Whatever they set is
  // kept untouched, ready for the day the card shows numbers again.
  await prisma.user.update({
    where: { id: user.id },
    data: { preferredFirstName, preferredLastName, phone, workingHours, hideLegalName, ...imageUpdate },
  });

  redirect("/portal/settings?saved=1");
}

// the quiet-fill input every editable field wears.
const INPUT =
  "mt-1.5 block w-full rounded-[9px] bg-fill px-3 py-2 text-sm text-foreground placeholder:text-faint transition focus:outline-2 focus:-outline-offset-1 focus:outline-brand";

export default async function SettingsPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // success/error flags come from the server action's redirect. keeps
  // the page server-rendered (no client js for flash messages).
  const params = await searchParams;
  const justSaved = params?.saved === "1";
  const errorMessages = {
    name: `Display name must be between 1 and ${NAME_MAX_LEN} characters.`,
    photoType: "Photo must be a JPG, PNG, WebP, or GIF.",
    photoSize: `Photo must be under ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB.`,
    photoUpload: "Photo upload failed. Try again.",
  };
  const errorMessage = params?.error ? errorMessages[params.error] : null;

  const displayName = preferredName(user);
  const initials = (displayName || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Settings</h1>
      <p className="mt-1 text-sm text-muted">Your profile, contact details, and appearance.</p>

      {justSaved && (
        <div
          role="status"
          className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <CheckIcon className="mt-0.5 h-5 w-5 flex-none text-emerald-600" />
          <div>
            <p className="font-semibold">Saved</p>
            <p className="mt-0.5 text-emerald-800">
              Your profile has been updated.
            </p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          <ExclamationIcon className="mt-0.5 h-5 w-5 flex-none text-rose-600" />
          <div>
            <p className="font-semibold">Didn&apos;t save</p>
            <p className="mt-0.5 text-rose-800">{errorMessage}</p>
          </div>
        </div>
      )}

      <div className="mt-2 grid gap-x-12 lg:grid-cols-2">
        {/* display:contents so the form can hold the identity row (full
            width) and the Profile column while the office/appearance column
            stays outside it - the grid sees straight through the form tag. */}
        <form action={updateProfile} className="contents">
          <div className="lg:col-span-2">
            <PhotoControl
              hasImage={!!user.image}
              accept={IMAGE_ACCEPT.join(",")}
              initials={initials}
              avatar={
                <Avatar
                  name={displayName}
                  email={user.email}
                  image={user.image}
                  size={56}
                />
              }
              hint={`A headshot helps coworkers put a face to your name. JPG, PNG, WebP, or GIF, up to ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB.`}
            >
              <span className="block truncate text-[17px] font-semibold text-foreground">
                {displayName}
              </span>
              <span className="block truncate text-[13px] text-muted">
                {user.title ? `${user.title} · ${user.email}` : user.email}
              </span>
            </PhotoControl>
          </div>

          <div className="min-w-0">
            <h2 className="mt-7 text-[17px] font-semibold tracking-tight text-foreground">
              Profile
            </h2>
            <p className="mt-0.5 text-[12.5px] text-faint">
              Shown across the portal and the Team Contacts directory.
            </p>

            <div className="mt-4">
              <label className="block text-[13px] font-medium text-muted">
                Preferred name <span className="font-normal text-faint">(optional)</span>
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  id="preferredFirstName"
                  name="preferredFirstName"
                  type="text"
                  maxLength={NAME_MAX_LEN}
                  defaultValue={user.preferredFirstName ?? ""}
                  autoComplete="given-name"
                  placeholder="Preferred first name"
                  className={INPUT}
                />
                <input
                  id="preferredLastName"
                  name="preferredLastName"
                  type="text"
                  maxLength={NAME_MAX_LEN}
                  defaultValue={user.preferredLastName ?? ""}
                  autoComplete="family-name"
                  placeholder="Preferred last name"
                  className={INPUT}
                />
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-faint">
                Shown across the portal. Each blank piece falls back to your legal
                name{user.name ? <> (<span className="font-medium text-muted">{user.name}</span>)</> : ""}
                {" "}for that part. Your legal name is managed by HR/admin.
              </p>
            </div>

            <div className="mt-5">
              <label htmlFor="phone" className="block text-[13px] font-medium text-muted">
                Phone <span className="font-normal text-faint">(optional)</span>
              </label>
              <PhoneInput
                id="phone"
                name="phone"
                maxLength={PHONE_MAX}
                defaultValue={user.phone ?? ""}
                autoComplete="tel"
                placeholder="(909) 555-0123"
                className={INPUT}
              />
              {/* WHO ACTUALLY SEES IT, said plainly. supervisors and management
                  see the number, coworkers see the name, title and email. */}
              <p className="mt-1.5 text-xs leading-relaxed text-faint">
                Shown to supervisors and management in the portal, and on nothing
                public. Your coworkers see your name, title and email. Leave it
                blank to keep it off entirely.
              </p>
            </div>

            <div className="mt-5">
              <label htmlFor="workingHours" className="block text-[13px] font-medium text-muted">
                Working hours <span className="font-normal text-faint">(optional)</span>
              </label>
              <input
                id="workingHours"
                name="workingHours"
                type="text"
                maxLength={WORKING_HOURS_MAX}
                defaultValue={user.workingHours ?? ""}
                autoComplete="off"
                placeholder="e.g. Mon–Fri 9am–5pm"
                className={INPUT}
              />
              <p className="mt-1.5 text-xs leading-relaxed text-faint">
                Shows on your contact page so coworkers know when to reach you.
              </p>
            </div>

            <label className="mt-6 flex cursor-pointer items-center justify-between gap-4 border-t border-sep py-3.5">
              <span className="text-sm font-medium text-foreground">
                Hide my full name from coworkers
                <span className="mt-0.5 block max-w-xs text-xs font-normal leading-relaxed text-faint">
                  Only HR and management can see your full name; everyone else
                  sees just your display name.
                </span>
              </span>
              <input
                type="checkbox"
                name="hideLegalName"
                defaultChecked={user.hideLegalName ?? false}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="relative h-[23px] w-[38px] flex-none rounded-full bg-fill-2 transition-colors peer-checked:bg-emerald-500 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand peer-checked:[&>span]:translate-x-[15px]"
              >
                <span className="absolute left-0.5 top-0.5 block h-[19px] w-[19px] rounded-full bg-white shadow transition-transform" />
              </span>
            </label>

            <div className="flex justify-end border-t border-sep pt-4">
              <button
                type="submit"
                className="rounded-[9px] bg-brand px-5 py-2 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Save changes
              </button>
            </div>
          </div>
        </form>

        <div className="min-w-0">
          <h2 className="mt-7 text-[17px] font-semibold tracking-tight text-foreground">
            Managed by the office
          </h2>
          <p className="mt-0.5 text-[12.5px] text-faint">
            Your email, role, and title are managed by IT and HR.
          </p>
          <div className="mt-1">
            <div className="flex items-center justify-between gap-4 border-b border-sep py-3">
              <span className="text-sm font-medium text-foreground">Email</span>
              <span className="truncate text-[13.5px] text-muted">{user.email}</span>
            </div>
            {isAdminUp(user.role) && (
              <div className="flex items-center justify-between gap-4 border-b border-sep py-3">
                <span className="text-sm font-medium text-foreground">Role</span>
                <span className="truncate text-[13.5px] text-muted">
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 py-3">
              <span className="text-sm font-medium text-foreground">Title</span>
              <span className="truncate text-[13.5px] text-muted">
                {user.title || "No title set"}
              </span>
            </div>
          </div>

          {/* the corner accessibility button is retired inside the portal -
              the same controls live here (appearance also has the quick pill
              in the desktop toolbar; both write the same stored settings). */}
          <AppearanceSettings />
        </div>
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
