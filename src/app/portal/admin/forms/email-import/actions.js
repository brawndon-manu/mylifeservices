"use server";

// BACKFILLING THE SIGN-OFFS THAT HAPPENED BEFORE THE PORTAL - Mánu 2026-09-12:
// "i need to find a way to make a section in forms admin side to create a pdf
// of attestation/signed documents for older stuff that wasnt in the portal.
// they would do it via email like this before."
//
// It lands as ordinary form submissions, because that is already the shape:
// FormSubmission carries a nullable user, an `attribution` of "unassigned", the
// name the submitter typed, and a stored PDF - and AssignPicker is already
// built to reconcile the ones nobody could place. Nothing new was needed to
// hold this except the reading of the thread.
//
// TWO PASSES ON PURPOSE. `previewEmailImport` writes nothing and is what the
// confirm screen shows; `saveEmailImport` does the work. A backfill of 80
// acknowledgments is not something to find out about afterwards.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { hasBlobStorage, putBlob } from "@/lib/blob";
import { randomBytes } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { preferredName } from "@/lib/contacts";
import {
  parseEmailThread, parseThreadDate, companyInstant, earliestPerPerson,
} from "@/lib/forms/email-thread";
import { buildDirectory, matchThread, HOW_LABELS } from "@/lib/forms/email-match";
import { parseGmailPrint, readPrintText } from "@/lib/forms/gmail-print";
import { renderEmailAckPdf, renderNoticeCover } from "@/lib/forms/email-ack-pdf";

async function requireRecordsAccess() {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) redirect("/portal");
  return user;
}

// THE WHOLE DIRECTORY, DEACTIVATED INCLUDED. This is a thread from May and
// people have left since - 9 of the 68 on his own thread. A record that drops
// everyone who has moved on is not a record.
async function directory() {
  const users = await prisma.user.findMany({
    select: {
      id: true, name: true, email: true, deactivatedAt: true,
      preferredFirstName: true, preferredLastName: true,
    },
  });
  return { dir: buildDirectory(users), users: new Map(users.map((u) => [u.id, u])) };
}

// TWO WAYS IN, ONE SHAPE OUT. A pasted list is what anybody can produce in ten
// seconds; Gmail's own print is the better source and the primary record - on
// the SB-294 thread the paste held 80 acknowledgments and the print holds 90,
// with every sender's address on it. When both are given the print wins.
// THE PRINT ITSELF. Read for its text here, and stored whole further down -
// it is the primary source, and everything else this makes is a transcription
// of it.
async function printTextFrom(formData) {
  const f = formData.get("print");
  if (!f || typeof f !== "object" || !("size" in f) || f.size === 0) return null;
  try {
    return await readPrintText(Buffer.from(await f.arrayBuffer()));
  } catch {
    return null;
  }
}

function readRows({ text, printText, year, senderName }, dir) {
  const entries = printText
    ? parseGmailPrint(printText).map((e) => ({ ...e, when: null }))
    : parseEmailThread(text);
  const rows = matchThread(entries, dir, { senderName }).map((r) => {
    // the print carries its own parts, year and all; a paste has to be told
    const parts = r.parts || parseThreadDate(r.when, year);
    return { ...r, at: parts ? companyInstant(parts) : null };
  });
  return earliestPerPerson(rows).sort((a, b) => (a.at?.getTime() || 0) - (b.at?.getTime() || 0));
}

export async function previewEmailImport(formData) {
  await requireRecordsAccess();
  const text = String(formData.get("thread") || "");
  const year = Number(formData.get("year")) || new Date().getFullYear();
  const senderName = String(formData.get("senderName") || "").trim();
  const printText = await printTextFrom(formData);
  if (!printText && !text.trim()) return { ok: false, error: "nothread" };

  const { dir, users } = await directory();
  const rows = readRows({ text, printText, year, senderName }, dir);
  return {
    ok: true,
    rows: rows.map((r) => {
      const u = r.userId ? users.get(r.userId) : null;
      return {
        asTyped: r.displayName,
        reply: r.body,
        when: r.at ? r.at.toISOString() : null,
        // what an address typed for this row has to be called to reach the save
        key: `${r.displayName}|${r.when}`,
        email: r.senderEmail || "",
        name: u ? preferredName(u) : null,
        gone: !!u?.deactivatedAt,
        how: HOW_LABELS[r.how] || r.how,
      };
    }),
  };
}

export async function saveEmailImport(formData) {
  const me = await requireRecordsAccess();
  if (!hasBlobStorage()) return { ok: false, error: "noblob" };

  const title = String(formData.get("title") || "").trim();
  const category = String(formData.get("category") || "").trim() || "Notices";
  const text = String(formData.get("thread") || "");
  const year = Number(formData.get("year")) || new Date().getFullYear();
  const senderName = String(formData.get("senderName") || "").trim();
  const printText = await printTextFrom(formData);
  const noticeDate = String(formData.get("noticeDate") || "").trim() || null;
  // the message itself, which is where "your email response will serve as your
  // acknowledgment and electronic signature" is written
  const bodyText = String(formData.get("body") || "").trim() || null;
  if (!title) return { ok: false, error: "notitle" };
  if (!printText && !text.trim()) return { ok: false, error: "nothread" };

  // THE NOTICE ITSELF, one file. His SB-294 went out as three attachments - the
  // memo and the English and Spanish posters - so they are stitched in the
  // order they were picked rather than one being chosen as the real one.
  const files = formData.getAll("notice").filter((f) => f && typeof f === "object" && f.size > 0);
  if (!files.length) return { ok: false, error: "nonotice" };
  const merged = await PDFDocument.create();
  // THE EMAIL FIRST, THEN WHAT IT CARRIED. The attachments are the law; the
  // message is the instruction, and one without the other is half the record.
  if (bodyText) {
    const cover = await renderNoticeCover({
      title, fromName: senderName, sentDate: noticeDate, body: bodyText,
      attachmentNames: files.map((f) => f.name).filter(Boolean),
    });
    const pages = await merged.copyPages(cover, cover.getPageIndices());
    for (const pg of pages) merged.addPage(pg);
  }
  const printFile = formData.get("print");
  const withPrint = printFile && typeof printFile === "object" && printFile.size > 0
    ? [...files, printFile]
    : files;
  for (const f of withPrint) {
    try {
      const src = await PDFDocument.load(new Uint8Array(await f.arrayBuffer()));
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const p of pages) merged.addPage(p);
    } catch {
      return { ok: false, error: "badnotice" };
    }
  }
  const noticeBytes = Buffer.from(await merged.save());

  const { dir, users } = await directory();
  const rows = readRows({ text, printText, year, senderName }, dir);
  if (!rows.length) return { ok: false, error: "noreplies" };

  // AN ADDRESS TYPED ON THE CONFIRM SCREEN - Mánu 2026-09-12, on people who
  // never had an account: "dont need an account just take down the name and
  // email for it". Gmail's list view shows an address on almost nothing (1 of
  // 69 here), and somebody with no account has no other source for one, so the
  // record would otherwise hold a name and nothing to reach them by.
  //
  // Keyed by the name and time the row was read at, not by position: the save
  // re-reads the thread, and a key that survives that is the only honest one.
  const typed = new Map();
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("email:")) continue;
    const addr = String(v || "").trim();
    if (addr) typed.set(k.slice(6), addr);
  }

  const stored = await putBlob(
    `form-email-imports/${randomBytes(12).toString("hex")}.pdf`,
    noticeBytes,
    { access: "public", contentType: "application/pdf" },
  );

  // RENDER FIRST, WRITE ONCE - the rule the schedules upload follows. A failure
  // halfway through leaves no half-imported notice to clean up.
  const built = [];
  for (const r of rows) {
    const u = r.userId ? users.get(r.userId) : null;
    const who = u ? preferredName(u) : r.displayName;
    const bytes = await renderEmailAckPdf({
      noticeTitle: title,
      noticeDate,
      personName: who,
      asTyped: r.displayName,
      replyText: r.body,
      when: r.at,
      recordedBy: preferredName(me),
      matchedHow: (HOW_LABELS[r.how] || r.how).toLowerCase(),
      askedText: bodyText,
      askedFrom: senderName || null,
    });
    const put = await putBlob(
      `form-email-imports/acks/${randomBytes(12).toString("hex")}.pdf`,
      bytes,
      { access: "public", contentType: "application/pdf" },
    );
    built.push({
      // NESTED UNDER THE FORM, so the person is connected rather than set as a
      // raw id - a nested create takes the relation, not the foreign key.
      ...(r.userId ? { user: { connect: { id: r.userId } } } : {}),
      // "email-import" rather than "email-match": this was read off a thread
      // somebody pasted, and the record should say which it was
      attribution: r.userId ? "email-import" : "unassigned",
      submitterName: r.displayName,
      submitterEmail: r.senderEmail || typed.get(`${r.displayName}|${r.when}`) || "",
      pdfUrl: put.url,
      pdfName: `${who} - ${title}.pdf`.replace(/[/\\]/g, "-"),
      // the reply itself, so the record can show what was written without
      // opening 69 documents
      submittedText: r.body || null,
      createdAt: r.at || undefined,
    });
  }

  const form = await prisma.form.create({
    data: {
      title,
      category,
      description: `Acknowledged by email${noticeDate ? ` on ${noticeDate}` : ""}. Imported from the email thread.`,
      fileUrl: stored.url,
      createdById: me.id,
      submissions: { create: built },
    },
    select: { id: true },
  });

  revalidatePath("/portal/admin/forms", "layout");
  return { ok: true, formId: form.id, saved: built.length, unassigned: built.filter((b) => !b.user).length };
}
