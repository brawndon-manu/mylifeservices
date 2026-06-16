"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated, isAdminUp } from "@/lib/roles";
import { cleanBody } from "@/lib/hub";
import {
  formatUSPhone,
  isValidResourceCategory,
  isValidOpStatus,
  isDetailedCategory,
  subtypesFor,
  cleanFromList,
  cleanSchedule,
  WHO_IT_SERVES_OPTIONS,
  DISTRIBUTION_METHODS,
  FOOD_SELECTION_OPTIONS,
  SPECIAL_INSTRUCTIONS_OPTIONS,
  RESOURCE_NAME_MAX,
  RESOURCE_NOTES_MAX,
  RESOURCE_URL_MAX,
  RESOURCE_ADDRESS_MAX,
  RESOURCE_CITY_MAX,
  RESOURCE_HOURS_MAX,
} from "@/lib/contacts";
import { cleanEmail } from "@/lib/security";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

async function requireElevated() {
  const user = await requireUser();
  if (!isElevated(user.role)) {
    redirect("/portal/contacts?error=forbidden");
  }
  return user;
}

// light url cleaner - prepend https:// if no scheme, cap length.
function cleanUrl(raw) {
  if (typeof raw !== "string") return null;
  let v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  return v.slice(0, RESOURCE_URL_MAX);
}

// geocode an address to lat/lng via the free OSM Nominatim service so the
// resource can show on the overview map. returns nulls on miss/failure.
async function geocode(address) {
  if (!address) return { lat: null, lng: null };
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
      { headers: { "User-Agent": "MyLifeServices-portal/1.0 (contact@mylifeservicesinc.com)" } },
    );
    const data = await res.json();
    if (Array.isArray(data) && data[0]) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.error("geocode failed:", e);
  }
  return { lat: null, lng: null };
}

// shared parser: read the resource fields off a form into the shape the
// db wants. used by both submit + update. workflow fields (status,
// approver, verification) are handled by the callers, not here.
function parseResourceForm(formData) {
  const name = cleanBody(formData.get("name"), RESOURCE_NAME_MAX);

  const rawCategory = formData.get("category");
  const category = isValidResourceCategory(rawCategory) ? rawCategory : "Other";
  const detailed = isDetailedCategory(category);

  // subtype must be valid for the chosen category, else dropped.
  const rawSubtype = formData.get("subtype");
  const subtype = subtypesFor(category).includes(rawSubtype) ? rawSubtype : null;

  const phone = formatUSPhone(formData.get("phone"));
  const emailRaw = formData.get("email");
  const email =
    typeof emailRaw === "string" && emailRaw.trim()
      ? cleanEmail(emailRaw) || null
      : null;

  const whoItServes = cleanFromList(
    formData.getAll("whoItServes"),
    WHO_IT_SERVES_OPTIONS,
  );

  // schedule rows arrive as a JSON string from the client form.
  let schedule = [];
  try {
    schedule = cleanSchedule(JSON.parse(formData.get("scheduleJson") || "[]"));
  } catch {
    schedule = [];
  }

  // eligibility booleans (apply to all categories).
  const details = {
    idRequired: formData.get("idRequired") === "on",
    proofOfIncomeRequired: formData.get("proofOfIncomeRequired") === "on",
    referralRequired: formData.get("referralRequired") === "on",
    otherEligibility: cleanBody(formData.get("otherEligibility"), 500),
  };
  // food-specific visit details, only when the category uses them.
  if (detailed) {
    const dm = formData.get("distributionMethod");
    const fs = formData.get("foodSelection");
    details.distributionMethod = DISTRIBUTION_METHODS.includes(dm) ? dm : null;
    details.foodSelection = FOOD_SELECTION_OPTIONS.includes(fs) ? fs : null;
    details.whatToBring = cleanBody(formData.get("whatToBring"), 300);
    details.specialInstructions = cleanFromList(
      formData.getAll("specialInstructions"),
      SPECIAL_INSTRUCTIONS_OPTIONS,
    );
  }

  return {
    name,
    category,
    subtype,
    orgName: cleanBody(formData.get("orgName"), 120),
    phone,
    email,
    website: cleanUrl(formData.get("website")),
    appointmentLink: cleanUrl(formData.get("appointmentLink")),
    contactInstructions: cleanBody(formData.get("contactInstructions"), 300),
    address: cleanBody(formData.get("address"), RESOURCE_ADDRESS_MAX),
    city: cleanBody(formData.get("city"), RESOURCE_CITY_MAX),
    state: cleanBody(formData.get("state"), 20),
    zip: cleanBody(formData.get("zip"), 12),
    serviceArea: cleanBody(formData.get("serviceArea"), 120),
    hours: cleanBody(formData.get("hours"), RESOURCE_HOURS_MAX),
    schedule,
    whoItServes,
    appointmentRequired: formData.get("appointmentRequired") === "on",
    details,
    notes: cleanBody(formData.get("notes"), RESOURCE_NOTES_MAX),
    internalNotes: cleanBody(formData.get("internalNotes"), 2000),
    source: cleanBody(formData.get("source"), 300),
  };
}

export async function submitResource(formData) {
  const user = await requireUser();

  const data = parseResourceForm(formData);
  if (!data.name) redirect("/portal/contacts/resources/new?error=name");

  const { lat, lng } = await geocode(data.address);

  const rawOp = formData.get("operationalStatus");
  const operationalStatus = isValidOpStatus(rawOp) ? rawOp : "ACTIVE";

  // elevated submissions are auto-approved (they're the approvers anyway).
  const elevated = isElevated(user.role);

  await prisma.resource.create({
    data: {
      ...data,
      lat,
      lng,
      operationalStatus,
      submittedById: user.id,
      status: elevated ? "APPROVED" : "PENDING",
      approvedById: elevated ? user.id : null,
      approvedAt: elevated ? new Date() : null,
      // an elevated submitter is implicitly verifying it as they add it.
      lastVerifiedAt: elevated ? new Date() : null,
      verifiedById: elevated ? user.id : null,
    },
  });

  revalidatePath("/portal/contacts");
  revalidatePath("/portal/resources");
  redirect(
    elevated ? "/portal/resources?added=1" : "/portal/resources?submitted=1",
  );
}

// edit an existing resource. elevated-only. optionally stamps verification
// when the "mark verified" box is checked.
export async function updateResource(resourceId, formData) {
  const user = await requireElevated();

  const existing = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { id: true, address: true, lat: true, lng: true },
  });
  if (!existing) redirect("/portal/resources");

  const data = parseResourceForm(formData);
  if (!data.name) {
    redirect(`/portal/resources/${resourceId}/edit?error=name`);
  }

  const rawOp = formData.get("operationalStatus");
  const operationalStatus = isValidOpStatus(rawOp) ? rawOp : "ACTIVE";

  // only re-geocode if the address actually changed (saves a Nominatim hit).
  let coords = { lat: existing.lat, lng: existing.lng };
  if ((data.address || null) !== (existing.address || null)) {
    coords = await geocode(data.address);
  }

  const verifyNow = formData.get("markVerified") === "on";

  await prisma.resource.update({
    where: { id: resourceId },
    data: {
      ...data,
      lat: coords.lat,
      lng: coords.lng,
      operationalStatus,
      ...(verifyNow
        ? { lastVerifiedAt: new Date(), verifiedById: user.id }
        : {}),
    },
  });

  revalidatePath("/portal/contacts");
  revalidatePath("/portal/resources");
  revalidatePath(`/portal/resources/${resourceId}`);
  redirect(`/portal/resources/${resourceId}?saved=1`);
}

// one-click "I checked this, it's current" from the card / detail page.
export async function markVerified(resourceId) {
  const user = await requireElevated();
  const r = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { id: true },
  });
  if (!r) redirect("/portal/resources");
  await prisma.resource.update({
    where: { id: resourceId },
    data: { lastVerifiedAt: new Date(), verifiedById: user.id },
  });
  revalidatePath("/portal/resources");
  revalidatePath(`/portal/resources/${resourceId}`);
}

export async function approveResource(resourceId) {
  const user = await requireElevated();
  const r = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { id: true },
  });
  if (!r) redirect("/portal/contacts/resources/review");
  await prisma.resource.update({
    where: { id: resourceId },
    data: {
      status: "APPROVED",
      approvedById: user.id,
      approvedAt: new Date(),
      reviewNote: null,
    },
  });
  revalidatePath("/portal/contacts");
  revalidatePath("/portal/resources");
  revalidatePath("/portal/contacts/resources/review");
}

export async function rejectResource(resourceId, formData) {
  await requireElevated();
  const note = cleanBody(formData.get("note"), RESOURCE_NOTES_MAX);
  await prisma.resource.update({
    where: { id: resourceId },
    data: { status: "REJECTED", reviewNote: note },
  });
  revalidatePath("/portal/contacts/resources/review");
}

export async function deleteResource(resourceId) {
  const user = await requireUser();
  const r = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { id: true, submittedById: true, status: true },
  });
  if (!r) redirect("/portal/resources");

  // submitter can delete their own while it's still pending; elevated
  // can delete anything.
  const ownPending = r.submittedById === user.id && r.status === "PENDING";
  if (!ownPending && !isElevated(user.role)) {
    redirect("/portal/resources?error=forbidden");
  }
  await prisma.resource.delete({ where: { id: resourceId } });
  revalidatePath("/portal/contacts");
  revalidatePath("/portal/resources");
  redirect("/portal/resources?deleted=1");
}

// flip a resource's "staff pick" flag so it surfaces in the featured row.
// curation is restricted to the top tier (Admin/IT/Super), not the whole
// oversight group that can merely approve resources.
export async function toggleStaffPick(resourceId) {
  const user = await requireUser();
  if (!isAdminUp(user.role)) {
    redirect("/portal/resources?error=forbidden");
  }
  const r = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { id: true, staffPick: true },
  });
  if (!r) redirect("/portal/resources");
  await prisma.resource.update({
    where: { id: resourceId },
    data: { staffPick: !r.staffPick },
  });
  revalidatePath("/portal/resources");
  revalidatePath("/portal/contacts");
}
