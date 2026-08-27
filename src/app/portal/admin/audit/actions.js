"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isAdminUp } from "@/lib/roles";
import { putBlob, hasBlobStorage } from "@/lib/blob";
import { parseServiceNotesPdf } from "@/lib/timesheet/service-notes";
import { unstorable } from "@/lib/timesheet/storable";

const NEW = "/portal/admin/audit/new?";

// the first and last day the notes themselves cover, read off the notes rather
// than typed. A batch labelled one range and holding another is not a mistake
// anybody catches later - the same rule the client attestations follow for the
// month on their header.
function coverageOf(notes) {
  const key = (d) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(d || "");
    return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0;
  };
  const dates = [...new Set(notes.map((n) => n.date).filter(Boolean))].sort((a, b) => key(a) - key(b));
  return { from: dates[0] || "", to: dates[dates.length - 1] || "" };
}

export async function uploadServiceNotes(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");

  const file = formData.get("file");
  if (!file || typeof file === "string" || !file.size) redirect(`${NEW}error=nofile`);
  if (!/\.pdf$/i.test(file.name || "")) redirect(`${NEW}error=notpdf`);

  const bytes = new Uint8Array(await file.arrayBuffer());

  let notes;
  try {
    notes = await parseServiceNotesPdf(bytes);
  } catch (e) {
    console.error("service notes parse failed:", e);
    redirect(`${NEW}error=parse`);
  }
  if (!notes.length) redirect(`${NEW}error=empty`);

  // The notes carry free text written by staff, straight into jsonb. A NUL in
  // there comes back as `22P05` and a stack trace naming neither the person nor
  // the character - the same net the rest report and the clock export have.
  const bad = unstorable(notes);
  if (bad) {
    console.error(`service notes refused: they carry ${bad.what} - ${bad.near}`);
    redirect(`${NEW}error=unstorable&why=${encodeURIComponent(bad.what)}`);
  }

  let sourceUrl = null;
  if (hasBlobStorage()) {
    try {
      const key = `audit/service-notes/${randomBytes(10).toString("hex")}.pdf`;
      sourceUrl = (await putBlob(key, Buffer.from(bytes), {
        access: "public",
        contentType: "application/pdf",
      })).url;
    } catch (e) {
      // the parsed notes are what the audit reads; the file is kept so a
      // reviewer can open the page a note was printed on. Losing it costs the
      // link, not the audit.
      console.error("service notes upload failed:", e);
    }
  }

  const { from, to } = coverageOf(notes);
  const batch = await prisma.serviceNoteBatch.create({
    data: {
      periodFrom: from,
      periodTo: to,
      sourceUrl,
      sourceName: file.name || null,
      notes,
      noteCount: notes.length,
      uploadedById: user.id,
    },
    select: { id: true },
  });

  revalidatePath("/portal/admin/audit");
  redirect(`/portal/admin/audit/${batch.id}`);
}

export async function deleteServiceNotes(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  await prisma.serviceNoteBatch.delete({ where: { id } });
  revalidatePath("/portal/admin/audit");
  redirect("/portal/admin/audit");
}

// A REVIEWER'S DECISION ABOUT ONE SHIFT.
//
// Mánu 2026-08-26: approve means "it looks good as far as billing", and anyone
// who can reach the page may record one - which is admin and up, so field staff
// cannot sign off their own work by reaching this screen.
//
// WHO decided is recorded on every row regardless. An approval is only worth
// what the reviewer's independence makes it worth, and the one person in this
// data who could approve their own shifts is the person reading this.
export async function reviewShift(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");

  const decision = formData.get("decision");
  if (decision !== "approved" && decision !== "flagged") return { ok: false, error: "unknown" };

  const shiftKey = String(formData.get("shiftKey") || "");
  if (!shiftKey) return { ok: false, error: "noshift" };

  const reason = String(formData.get("reason") || "").trim();
  // a flag routes to somebody, and a flag with no reason gives them nothing to
  // act on. An approval needs none: it says the reading in front of the
  // reviewer looked right.
  if (decision === "flagged" && !reason) return { ok: false, error: "noreason" };

  const num = (k) => {
    const v = formData.get(k);
    return v === null || v === "" || v === "null" ? null : Number(v);
  };

  const row = {
    shiftKey,
    employeeKey: String(formData.get("employeeKey") || ""),
    date: String(formData.get("date") || ""),
    startMin: num("startMin"),
    client: String(formData.get("client") || "") || null,
    service: String(formData.get("service") || "") || null,
    decision,
    reason: decision === "flagged" ? reason : null,
    // THE READING AS IT STOOD. A later upload can move these figures; what was
    // signed off should not move with them.
    billedMin: num("billedMin"),
    clockedMin: num("clockedMin"),
    documentedMin: num("documentedMin"),
    decidedById: user.id,
  };

  await prisma.shiftReview.upsert({
    where: { shiftKey },
    create: row,
    // changing your mind is allowed and overwrites the decision, the reason and
    // who made it - the row is the current decision, not a history of them
    update: {
      decision: row.decision, reason: row.reason, decidedById: user.id,
      billedMin: row.billedMin, clockedMin: row.clockedMin, documentedMin: row.documentedMin,
      service: row.service, client: row.client,
    },
  });

  revalidatePath("/portal/admin/audit");
  return { ok: true };
}

export async function undoReview(formData) {
  const user = await getCurrentUser();
  if (!isAdminUp(user?.role)) redirect("/portal");
  const shiftKey = String(formData.get("shiftKey") || "");
  if (!shiftKey) return { ok: false };
  await prisma.shiftReview.deleteMany({ where: { shiftKey } });
  revalidatePath("/portal/admin/audit");
  return { ok: true };
}
