"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { cleanBody } from "@/lib/hub";
import {
  isValidDeviceType,
  isValidDeviceStatus,
  dollarsToCents,
  DEVICE_NAME_MAX,
  DEVICE_SERIAL_MAX,
  DEVICE_ASSIGNED_MAX,
  DEVICE_NOTES_MAX,
} from "@/lib/devices";

// adding/editing/deleting devices is Admin-and-up (Admin/IT/Super).
// viewing the list is broader (oversight tier) - that's gated on the page.
async function requireDeviceManager() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdminUp(user.role)) {
    redirect("/portal?error=forbidden");
  }
  return user;
}

function parseDateField(raw) {
  if (typeof raw !== "string" || !raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// pull the shared device fields out of the form, validated.
function readDeviceFields(formData) {
  const name = cleanBody(formData.get("name"), DEVICE_NAME_MAX);
  const type = formData.get("type");
  const status = formData.get("status");
  const rawSerial = formData.get("serialNumber");
  const serialNumber =
    typeof rawSerial === "string" && rawSerial.trim()
      ? rawSerial.trim().slice(0, DEVICE_SERIAL_MAX)
      : null;
  const rawAssigned = formData.get("assignedTo");
  const assignedTo =
    typeof rawAssigned === "string" && rawAssigned.trim()
      ? rawAssigned.trim().slice(0, DEVICE_ASSIGNED_MAX)
      : null;
  const priceCents = dollarsToCents(formData.get("price"));
  const purchaseDate = parseDateField(formData.get("purchaseDate"));
  const notes = cleanBody(formData.get("notes"), DEVICE_NOTES_MAX);
  return {
    name,
    type: isValidDeviceType(type) ? type : "LAPTOP",
    status: isValidDeviceStatus(status) ? status : "IN_USE",
    serialNumber,
    assignedTo,
    priceCents,
    purchaseDate,
    notes,
  };
}

export async function addDevice(formData) {
  const user = await requireDeviceManager();
  const fields = readDeviceFields(formData);
  if (!fields.name) redirect("/portal/devices/new?error=name");

  await prisma.device.create({
    data: { ...fields, createdById: user.id },
  });
  revalidatePath("/portal/devices");
  redirect("/portal/devices?added=1");
}

export async function updateDevice(deviceId, formData) {
  await requireDeviceManager();
  const existing = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { id: true },
  });
  if (!existing) redirect("/portal/devices");

  const fields = readDeviceFields(formData);
  if (!fields.name) redirect(`/portal/devices/${deviceId}/edit?error=name`);

  await prisma.device.update({ where: { id: deviceId }, data: fields });
  revalidatePath("/portal/devices");
  redirect("/portal/devices?updated=1");
}

export async function deleteDevice(deviceId) {
  await requireDeviceManager();
  await prisma.device.delete({ where: { id: deviceId } });
  revalidatePath("/portal/devices");
  redirect("/portal/devices?deleted=1");
}
