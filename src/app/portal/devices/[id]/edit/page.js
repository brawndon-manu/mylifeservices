import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import DeviceForm from "../../_components/DeviceForm";
import ConfirmButton from "@/components/ConfirmButton";
import { updateDevice, deleteDevice } from "../../actions";

export const metadata = {
  title: "Edit device · MLS Portal",
  robots: { index: false, follow: false },
};

export default async function EditDevicePage({ params, searchParams }) {
  const user = await getCurrentUser();
  if (!user.deviceManager) redirect("/portal");

  const { id } = await params;
  const sp = await searchParams;
  const nameError = sp?.error === "name";

  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) notFound();

  const updateBound = updateDevice.bind(null, id);

  return (
    <section className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <Link
        href="/portal/devices"
        className="text-sm font-medium text-slate-600 transition hover:text-brand"
      >
        ← Back to Device Management
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Edit device
      </h1>

      {nameError && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          Please give the device a name.
        </div>
      )}

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <DeviceForm action={updateBound} device={device} submitLabel="Save changes" />
      </div>

      <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-6">
        <h2 className="text-sm font-semibold text-rose-900">Remove device</h2>
        <p className="mt-1 text-sm text-rose-800">
          Deletes this device from the log. This can&apos;t be undone.
        </p>
        <form action={deleteDevice.bind(null, id)} className="mt-4">
          <ConfirmButton
            message={`Delete "${device.name}" from the device log?`}
            className="rounded-md border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100"
          >
            Delete device
          </ConfirmButton>
        </form>
      </div>
    </section>
  );
}
