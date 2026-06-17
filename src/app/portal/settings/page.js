import { redirect } from "next/navigation";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { cleanDisplayName } from "@/lib/security";
import { formatUSPhone, PHONE_MAX, WORKING_HOURS_MAX } from "@/lib/contacts";
import { IMAGE_ACCEPT, IMAGE_MAX_BYTES } from "@/lib/hub";
import Avatar from "@/components/Avatar";
import PhoneInput from "@/components/PhoneInput";

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

  // cleanDisplayName handles: type check, trim, strip control chars,
  // length cap. returns null on garbage input.
  const name = cleanDisplayName(formData.get("name"), NAME_MAX_LEN);
  if (!name) {
    redirect("/portal/settings?error=name");
  }

  // phone is optional - blank clears it. normalized to (xxx) xxx-xxxx.
  const phone = formatUSPhone(formData.get("phone"));

  // working hours: optional free text. cleanDisplayName trims + strips
  // control chars + caps length; returns null when blank, which clears it.
  const workingHours = cleanDisplayName(
    formData.get("workingHours"),
    WORKING_HOURS_MAX,
  );

  // photo: optional upload, or a "remove" checkbox. only touch the
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

  await prisma.user.update({
    where: { id: user.id },
    data: { name, phone, workingHours, ...imageUpdate },
  });

  redirect("/portal/settings?saved=1");
}

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

  return (
    <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">
        Settings
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Your account
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        Update how you appear in the portal: your name, photo, and phone
        show on the Team Contacts directory. Your email and role are
        managed by IT and can&apos;t be edited here.
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
              Your profile has been updated.
            </p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          <ExclamationIcon className="mt-0.5 h-5 w-5 flex-none text-rose-600" />
          <div>
            <p className="font-semibold">Didn&apos;t save</p>
            <p className="mt-0.5 text-rose-800">{errorMessage}</p>
          </div>
        </div>
      )}

      <div className="mt-10 rounded-xl border border-border bg-surface p-6 sm:p-8">
        <form action={updateProfile} className="space-y-6">
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
              value={user.email}
              disabled
              className="mt-1 block w-full cursor-not-allowed rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-muted shadow-sm"
            />
          </div>

          <div>
            <label
              htmlFor="role"
              className="block text-sm font-medium text-muted"
            >
              Role
            </label>
            <input
              id="role"
              type="text"
              value={user.role}
              disabled
              className="mt-1 block w-full cursor-not-allowed rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-muted shadow-sm"
            />
          </div>

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-muted"
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
              className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-muted">
              Up to {NAME_MAX_LEN} characters. Shows on the dashboard
              greeting and in the admin user list.
            </p>
          </div>

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
              defaultValue={user.phone ?? ""}
              autoComplete="tel"
              placeholder="(909) 555-0123"
              className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-muted">
              Shows on the Team Contacts directory. Leave blank to keep it
              private.
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
              defaultValue={user.workingHours ?? ""}
              autoComplete="off"
              placeholder="e.g. Mon–Fri 9am–5pm"
              className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-foreground shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-muted">
              Shows on your contact page so coworkers know when to reach you.
            </p>
          </div>

          <div>
            <label
              htmlFor="photo"
              className="block text-sm font-medium text-muted"
            >
              Photo <span className="text-faint">(optional)</span>
            </label>
            <div className="mt-2 flex items-center gap-4">
              <Avatar
                name={user.name}
                email={user.email}
                image={user.image}
                size={64}
              />
              <div className="flex-1">
                <input
                  id="photo"
                  name="photo"
                  type="file"
                  accept={IMAGE_ACCEPT.join(",")}
                  className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand-light file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand"
                />
                {user.image && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      name="removePhoto"
                      className="h-3.5 w-3.5 accent-brand"
                    />
                    Remove current photo
                  </label>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-muted">
              A headshot helps coworkers put a face to your name. JPG, PNG,
              WebP, or GIF, up to {Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB.
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
