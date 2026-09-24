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
import { hasBlobStorage, putBlob, delBlob } from "@/lib/blob";
import { randomBytes } from "node:crypto";
import { renderCertificate, DEFAULT_SIZE, MIN_SIZE, MAX_SIZE } from "@/lib/certificates/render";
import { cleanTitle } from "@/lib/certificates/title";
import { faceFor, cleanColor } from "@/lib/certificates/faces";
import { fetchBlob } from "@/lib/blob";

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
    // an unknown face or a mistyped colour falls back rather than printing
    // something nobody chose across a whole run
    const face = faceFor(plan.face).key;
    const color = cleanColor(plan.color);

    const stored = await putBlob(
      `certificates/templates/${randomBytes(12).toString("hex")}.pdf`,
      templateBytes,
      { contentType: "application/pdf" },
    );

    // RENDER FIRST, WRITE ONCE, per template - a template that cannot be drawn
    // on stops the run rather than leaving some of it made.
    const built = [];
    for (const p of people) {
      let bytes;
      try {
        bytes = await renderCertificate(templateBytes, {
          name: p.printedName, page, x, y, size, align, face, color,
          date: p.issuedOn, datePage, dateX, dateY, dateSize, dateAlign,
        });
      } catch (e) {
        console.error("certificate render failed:", e);
        return { ok: false, error: "badtemplate" };
      }
      const put = await putBlob(
        `certificates/${randomBytes(12).toString("hex")}.pdf`,
        bytes,
        { contentType: "application/pdf" },
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
          page, x, y, size, align, face, color,
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

// GOING BACK TO A PLACEMENT - Mánu 2026-09-13: "is there a way we can make it
// so we can go back and edit the certificate placement and regenerate them".
//
// NOTHING NEEDS RE-UPLOADING, because the blank template was kept at
// templateUrl when the batch was made and each certificate row still holds the
// name and the date that were drawn on it. So this re-draws the SAME people
// with the SAME dates at a new spot.
//
// PLACEMENT ONLY, HIS CALL. Who got one and what date it carries are the
// record of what was issued; moving a name is fixing how the document looks,
// which is a different act from changing what it says.
export async function regenerateCertificateBatch(batchId, plan) {
  await requireAccess();
  if (!hasBlobStorage()) return { ok: false, error: "noblob" };

  const batch = await prisma.certificateBatch.findUnique({
    where: { id: String(batchId) },
    select: {
      id: true, templateUrl: true,
      certificates: { select: { id: true, printedName: true, issuedOn: true, pdfUrl: true } },
    },
  });
  if (!batch) return { ok: false, error: "gone" };
  if (!batch.certificates.length) return { ok: false, error: "nopeople" };

  const page = Math.max(0, Math.round(num(plan?.page)));
  const x = num(plan?.x, -1);
  const y = num(plan?.y, -1);
  if (!(x >= 0) || !(y >= 0)) return { ok: false, error: "noplace" };
  const size = Math.min(Math.max(num(plan?.size, DEFAULT_SIZE), MIN_SIZE), MAX_SIZE);
  const align = plan?.align === "left" ? "left" : "center";
  const hasDate = plan?.dateX != null && plan?.dateY != null;
  const datePage = hasDate ? Math.max(0, Math.round(num(plan.datePage))) : null;
  const dateX = hasDate ? num(plan.dateX, -1) : null;
  const dateY = hasDate ? num(plan.dateY, -1) : null;
  const dateSize = hasDate ? Math.min(Math.max(num(plan.dateSize, 14), MIN_SIZE), MAX_SIZE) : null;
  const dateAlign = hasDate ? (plan.dateAlign === "left" ? "left" : "center") : null;
  const face = faceFor(plan?.face).key;
  const color = cleanColor(plan?.color);

  let templateBytes;
  try {
    const res = await fetchBlob(batch.templateUrl);
    if (!res.ok) throw new Error(`template fetch ${res.status}`);
    templateBytes = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error("certificate template fetch failed:", e);
    return { ok: false, error: "notemplate" };
  }

  // RENDER EVERY ONE BEFORE REPLACING ANY, the same rule the run itself
  // follows. A template that cannot be drawn on stops this before the batch is
  // left half at the old spot and half at the new one.
  const made = [];
  for (const c of batch.certificates) {
    let bytes;
    try {
      bytes = await renderCertificate(templateBytes, {
        name: c.printedName, page, x, y, size, align, face, color,
        date: c.issuedOn, datePage, dateX, dateY, dateSize, dateAlign,
      });
    } catch (e) {
      console.error("certificate render failed:", e);
      return { ok: false, error: "badtemplate" };
    }
    const put = await putBlob(
      `certificates/${randomBytes(12).toString("hex")}.pdf`,
      bytes,
      { contentType: "application/pdf" },
    );
    made.push({ id: c.id, was: c.pdfUrl, now: put.url });
  }

  try {
    await prisma.$transaction([
      prisma.certificateBatch.update({
        where: { id: batch.id },
        data: { page, x, y, size, align, face, color, datePage, dateX, dateY, dateSize, dateAlign },
      }),
      ...made.map((m) => prisma.certificate.update({ where: { id: m.id }, data: { pdfUrl: m.now } })),
    ]);
  } catch (e) {
    console.error("certificate batch regenerate save failed:", e);
    return { ok: false, error: "save" };
  }

  // THE REPLACED FILES GO, AFTER the record points at the new ones - Mánu
  // 2026-09-13 chose this over letting them pile up. Nudging a placement twice
  // on a run of six by eighteen would otherwise strand 216 PDFs. A failure
  // here costs storage, never the batch, so it is logged rather than returned.
  try {
    await delBlob(made.map((m) => m.was));
  } catch (e) {
    console.error("old certificate files could not be removed:", e);
  }

  revalidatePath("/portal/admin/forms", "layout");
  return { ok: true, redrawn: made.length };
}

// A CERTIFICATE THAT WENT TO THE WRONG PERSON, or a batch printed twice. The
// whole batch goes, because a certificate is only meaningful as one of a run.
//
// ITS FILES GO WITH IT. Deleting the rows used to leave every PDF and the
// stored template in blob storage with nothing able to reach them. The
// template blob belongs to this batch alone - the run uploads its own copy per
// certificate type - so both are safe to remove.
export async function deleteCertificateBatch(batchId) {
  await requireAccess();

  const batch = await prisma.certificateBatch.findUnique({
    where: { id: String(batchId) },
    select: { id: true, templateUrl: true, certificates: { select: { pdfUrl: true } } },
  });
  if (!batch) redirect("/portal/admin/forms/certificates");

  await prisma.certificateBatch.delete({ where: { id: batch.id } });

  const files = [...batch.certificates.map((c) => c.pdfUrl), batch.templateUrl].filter(Boolean);
  if (files.length && hasBlobStorage()) {
    try {
      await delBlob(files);
    } catch (e) {
      console.error("certificate files could not be removed:", e);
    }
  }

  revalidatePath("/portal/admin/forms", "layout");
  redirect("/portal/admin/forms/certificates");
}
