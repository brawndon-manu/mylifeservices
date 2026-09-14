"use server";

// PRINTING A CERTIFICATE FOR A LIST OF PEOPLE - Mánu 2026-09-13.
//
// The template is uploaded once, the name's place is picked once by clicking
// it, and every name in the run is drawn at that spot. Each certificate is
// stored against the person it went to, so the portal can answer who was issued
// what and reprint a single copy.
//
// A PICKED PERSON PRINTS THEIR LEGAL NAME. A certificate is a document, and
// documents carry legal names here - the screens are where preferred names go.
// A typed name prints exactly as typed, which is the point of allowing them.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { hasBlobStorage, putBlob } from "@/lib/blob";
import { randomBytes } from "node:crypto";
import { renderCertificate, DEFAULT_SIZE, MIN_SIZE, MAX_SIZE } from "@/lib/certificates/render";
import { cleanTitle } from "@/lib/certificates/title";

async function requireAccess() {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) redirect("/portal");
  return user;
}

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// MANY TEMPLATES, ONE LIST OF PEOPLE - Mánu 2026-09-13: "i need to make 6 more
// certificates with 18 staff each and i dont want to enter the names and dates
// 6 different times."
//
// The people and their dates are entered once and used for every template in
// the run. Each template still becomes its OWN batch, because a certificate
// type is what gets looked up later ("who has their CPR card"); a shared runId
// is what lets the whole lot be downloaded in one go.
export async function createCertificates(formData) {
  const me = await requireAccess();
  if (!hasBlobStorage()) return { ok: false, error: "noblob" };

  // one entry per template: its title and where the name and date go on it
  let plans = [];
  try {
    plans = JSON.parse(String(formData.get("templates") || "[]"));
  } catch {
    plans = [];
  }
  if (!Array.isArray(plans) || !plans.length) return { ok: false, error: "notemplate" };
  if (plans.some((t) => !cleanTitle(t?.title))) return { ok: false, error: "notitle" };
  if (plans.some((t) => !(Number(t?.x) >= 0) || !(Number(t?.y) >= 0))) return { ok: false, error: "noplace" };

  const files = formData.getAll("template").filter((f) => f && typeof f === "object" && f.size > 0);
  if (files.length !== plans.length) return { ok: false, error: "notemplate" };

  const issuedOn = String(formData.get("issuedOn") || "").trim() || null;

  // WHO IT IS FOR, from two places at once, and the same for every template.
  const pickedIds = String(formData.get("userIds") || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const picked = pickedIds.length
    ? await prisma.user.findMany({ where: { id: { in: pickedIds } }, select: { id: true, name: true } })
    : [];
  const typed = String(formData.get("typed") || "")
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);

  let dates = {};
  try {
    dates = JSON.parse(String(formData.get("dates") || "{}")) || {};
  } catch {
    dates = {};
  }
  const dateFor = (userId) => (userId ? String(dates[userId] || "").trim() : "") || issuedOn;

  const people = [
    ...picked.map((u) => ({ userId: u.id, printedName: u.name, issuedOn: dateFor(u.id) })),
    ...typed.map((n) => ({ userId: null, printedName: n, issuedOn })),
  ];
  if (!people.length) return { ok: false, error: "nopeople" };

  const runId = randomBytes(12).toString("hex");
  const madeIds = [];
  let issued = 0;

  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i];
    const file = files[i];
    const templateBytes = Buffer.from(await file.arrayBuffer());

    const page = Math.max(0, Math.round(num(plan.page)));
    const x = num(plan.x, -1);
    const y = num(plan.y, -1);
    const size = Math.min(Math.max(num(plan.size, DEFAULT_SIZE), MIN_SIZE), MAX_SIZE);
    const align = plan.align === "left" ? "left" : "center";
    const hasDate = plan.dateX != null && plan.dateY != null;
    const datePage = hasDate ? Math.max(0, Math.round(num(plan.datePage))) : null;
    const dateX = hasDate ? num(plan.dateX, -1) : null;
    const dateY = hasDate ? num(plan.dateY, -1) : null;
    const dateSize = hasDate ? Math.min(Math.max(num(plan.dateSize, 14), MIN_SIZE), MAX_SIZE) : null;
    const dateAlign = plan.dateAlign === "left" ? "left" : "center";

    const stored = await putBlob(
      `certificates/templates/${randomBytes(12).toString("hex")}.pdf`,
      templateBytes,
      { access: "public", contentType: "application/pdf" },
    );

    // RENDER FIRST, WRITE ONCE, per template - a template that cannot be drawn
    // on stops the run rather than leaving some of it made.
    const built = [];
    for (const p of people) {
      let bytes;
      try {
        bytes = await renderCertificate(templateBytes, {
          name: p.printedName, page, x, y, size, align,
          date: p.issuedOn, datePage, dateX, dateY, dateSize, dateAlign,
        });
      } catch (e) {
        console.error("certificate render failed:", e);
        return { ok: false, error: "badtemplate" };
      }
      const put = await putBlob(
        `certificates/${randomBytes(12).toString("hex")}.pdf`,
        bytes,
        { access: "public", contentType: "application/pdf" },
      );
      built.push({
        ...(p.userId ? { user: { connect: { id: p.userId } } } : {}),
        printedName: p.printedName,
        issuedOn: p.issuedOn,
        pdfUrl: put.url,
      });
    }

    try {
      const batch = await prisma.certificateBatch.create({
        data: {
          title: cleanTitle(plan.title),
          templateUrl: stored.url,
          templateName: typeof file.name === "string" ? file.name.slice(0, 200) : null,
          page, x, y, size, align,
          issuedOn,
          datePage, dateX, dateY, dateSize, dateAlign,
          runId,
          createdById: me.id,
          certificates: { create: built },
        },
        select: { id: true },
      });
      madeIds.push(batch.id);
      issued += built.length;
    } catch (e) {
      console.error("certificate batch save failed:", e);
      return { ok: false, error: "save" };
    }
  }

  revalidatePath("/portal/admin/forms", "layout");
  return { ok: true, runId, batchIds: madeIds, batches: madeIds.length, issued };
}

// RENAMING A RUN AFTER IT IS PRINTED - Mánu 2026-09-13: "can i have option to
// rename". The builder names a batch after the file it was uploaded from, so a
// run printed from "BLANK HIPPA Omnibus Rule 13.pdf" is listed under that name
// until somebody says otherwise.
//
// NOTHING IS REDRAWN. The title is never printed on a certificate - only the
// name and the optional date are - and the download names are built from the
// title at request time, so the heading, the list row, both zips and the
// single PDF all follow from this one update.
export async function renameCertificateBatch(batchId, title) {
  await requireAccess();

  const clean = cleanTitle(title);
  if (!clean) return { ok: false, error: "notitle" };

  try {
    await prisma.certificateBatch.update({
      where: { id: String(batchId) },
      data: { title: clean },
    });
  } catch (e) {
    console.error("certificate batch rename failed:", e);
    return { ok: false, error: "save" };
  }

  revalidatePath("/portal/admin/forms", "layout");
  return { ok: true, title: clean };
}

// A CERTIFICATE THAT WENT TO THE WRONG PERSON, or a batch printed twice. The
// whole batch goes, because a certificate is only meaningful as one of a run.
export async function deleteCertificateBatch(batchId) {
  await requireAccess();
  await prisma.certificateBatch.delete({ where: { id: String(batchId) } });
  revalidatePath("/portal/admin/forms", "layout");
  redirect("/portal/admin/forms/certificates");
}
