import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import DeviceForm from "../_components/DeviceForm";
import { addDevice } from "../actions";

export const metadata = {
  title: "Add device · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function NewDevicePage({ searchParams }) {
  const user = await getCurrentUser();
  if (!isAdminUp(user.role)) redirect("/portal");

  const params = await searchParams;
  const nameError = params?.error === "name";

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <Link
        href="/portal/devices"
        className="text-sm font-medium text-muted transition hover:text-brand"
      >
        ← Back to Device Management
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Add a device
      </h1>

      {nameError && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          Please give the device a name.
        </div>
      )}

      <div className="mt-8 rounded-xl border border-border bg-surface p-6 sm:p-8">
        <DeviceForm action={addDevice} submitLabel="Add device" />
      </div>
    </section>
  );
}
