"use server";

// UPLOADING A MONTH OF CLIENT SCHEDULES AND CUTTING THEM INTO FORMS.
//
// One QSP export in, one form per client out. Nothing here emails anybody: the
// forms are generated, stored and downloaded, and who collects a signature is a
// separate decision made on the review screen.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageClientAttestations } from "@/lib/roles";
import { hasBlobStorage, putBlob } from "@/lib/blob";
import { randomBytes } from "node:crypto";
import { parseClientSchedules } from "@/lib/client-attestations/parse";
import {
  clientKey,
  staffDirectory,
  expandStaffName,
  matchScheduleStaff,
} from "@/lib/client-attestations/names";
import { renderAttestationForm } from "@/lib/client-attestations/render";
import { signAttestationToken } from "@/lib/client-attestations/token";
import { sendAttestation } from "@/lib/client-attestations/send";
import { fetchStored, formFileName } from "@/lib/client-attestations/serve";
import { preferredName } from "@/lib/contacts";
import { titleHasSegment } from "@/lib/positions";
import { attestationLiveSend } from "@/lib/timesheet-mode";
import { SEND_TARGETS } from "@/lib/client-attestations/targets";
import { readClientRoster, matchRosterStaff } from "@/lib/client-attestations/roster";

const NEW = "/portal/admin/client-attestations/new?";

async function requireAccess() {
  const user = await getCurrentUser();
  if (!canManageClientAttestations(user?.role)) redirect("/portal");
  return user;
}

export async function uploadClientSchedules(formData) {
  const user = await requireAccess();

  const file = formData.get("file");
  if (!file || typeof file !== "object" || !("size" in file) || file.size === 0) {
    redirect(`${NEW}error=nofile`);
  }
  if (file.type && file.type !== "application/pdf") {
    redirect(`${NEW}error=notpdf`);
  }
  if (!hasBlobStorage()) redirect(`${NEW}error=noblob`);

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseClientSchedules(buffer);
  } catch (e) {
    console.error("client schedule parse failed:", e?.message || e);
    redirect(`${NEW}error=parse`);
  }

  if (!parsed.clients.length) redirect(`${NEW}error=empty`);
  // EVERY PAGE PRINTS ITS OWN MONTH, so a mixed export is caught here rather
  // than becoming a batch labelled one month and holding another.
  if (!parsed.monthLabel) {
    redirect(
      `${NEW}error=months&why=${encodeURIComponent(parsed.months.join(", "))}`,
    );
  }

  // WHO WE CAN NAME. Portal accounts first - the agency's own record of who
  // somebody is - then HR's case workers off the imported roster, which reaches
  // people with no portal account. Anything still unresolved keeps QSP's
  // abbreviation on the form, which is true even when it is not helpful.
  const [staffAccounts, roster] = await Promise.all([
    prisma.user.findMany({
      where: { deactivatedAt: null },
      select: {
        id: true,
        name: true,
        preferredFirstName: true,
        preferredLastName: true,
        supervisorId: true,
      },
    }),
    prisma.client.findMany({
      select: {
        clientKey: true,
        office: true,
        caseWorkerName: true,
        staffUserId: true,
      },
    }),
  ]);
  const directory = staffDirectory([
    ...staffAccounts,
    ...roster.map((r) => r.caseWorkerName).filter(Boolean),
  ]);
  const rosterByKey = new Map(roster.map((r) => [r.clientKey, r]));

  const source = await putBlob(
    `client-attestations/${randomBytes(12).toString("hex")}.pdf`,
    buffer,
    { access: "public", contentType: "application/pdf" },
  );

  // RENDER FIRST, WRITE ONCE. Every form is built and stored before a single
  // row is created, so a failure halfway through leaves nothing behind to clean
  // up - the same reason the timesheet upload does its whole batch in one write.
  //
  // IN PARALLEL, IN SMALL GROUPS. Drawing a form takes about 11ms; storing it
  // takes a network round trip, and 252 of those one after another is most of
  // the wait. A handful at a time keeps it quick without opening 252 sockets at
  // once - and the results are collected in order, so page 1 is still row 1.
  const rows = [];
  const LANES = 8;
  const build = async (client) => {
    const staffNames = {};
    const matches = [];
    for (const printed of client.staff) {
      const full = expandStaffName(printed, directory);
      if (full) staffNames[printed] = full;
      matches.push(matchScheduleStaff(printed, staffAccounts));
    }

    // THE STAFF THIS FORM ROUTES THROUGH. The roster's assignment first - that
    // is the record of whose client this is - and only where the roster has no
    // answer, the schedule's own staff, and then only when exactly one of them
    // matched an account. A client seen by two staff has no single answer, so
    // that case waits for a person rather than picking one of them.
    const rosterRow = rosterByKey.get(clientKey(client.clientName)) || null;
    const resolved = [...new Set(matches.map((m) => m.userId).filter(Boolean))];
    const staffUserId =
      rosterRow?.staffUserId || (resolved.length === 1 ? resolved[0] : null);
    const staffUser = staffUserId ? staffAccounts.find((u) => u.id === staffUserId) : null;

    let formUrl = null;
    try {
      const pdf = await renderAttestationForm({ client, staffNames });
      const stored = await putBlob(
        `client-attestations/forms/${randomBytes(12).toString("hex")}.pdf`,
        pdf,
        { access: "public", contentType: "application/pdf" },
      );
      formUrl = stored.url;
    } catch (e) {
      // a form that will not draw must be visible on the review screen, not a
      // silent gap - so the row is still created, with no document on it
      console.error(`attestation render failed for ${client.clientName}:`, e?.message || e);
    }

    return {
      clientName: client.clientName,
      clientKey: clientKey(client.clientName),
      sourcePage: client.page,
      staffNames: client.staff,
      scheduledHours: client.scheduledHours,
      entryCount: client.entryCount,
      caseWorker: rosterRow?.caseWorkerName || null,
      office: rosterRow?.office || null,
      staffUserId,
      supervisorUserId: staffUser?.supervisorId || null,
      matchMethod: rosterRow?.staffUserId
        ? "roster"
        : staffUserId
          ? "initial"
          : matches.some((m) => m.method === "ambiguous")
            ? "ambiguous"
            : "unmatched",
      formUrl,
    };
  };

  for (let i = 0; i < parsed.clients.length; i += LANES) {
    const group = parsed.clients.slice(i, i + LANES);
    rows.push(...(await Promise.all(group.map(build))));
  }

  const batch = await prisma.clientAttestationBatch.create({
    data: {
      monthLabel: parsed.monthLabel,
      sourceUrl: source.url,
      sourceName: file.name || "client-schedules.pdf",
      uploadedById: user.id,
      attestations: { create: rows },
    },
    select: { id: true },
  });

  revalidatePath("/portal/admin/client-attestations");
  redirect(`/portal/admin/client-attestations/${batch.id}`);
}

// ASSIGNING THE SUPERVISOR BY HAND, until the per-staff mapping is filled in.
export async function setAttestationSupervisor(attestationId, supervisorUserId) {
  await requireAccess();
  const id = String(supervisorUserId || "") || null;
  const row = await prisma.clientAttestation.update({
    where: { id: attestationId },
    data: { supervisorUserId: id },
    select: { batchId: true },
  });
  revalidatePath(`/portal/admin/client-attestations/${row.batchId}`);
  return { ok: true };
}

export async function deleteAttestationBatch(batchId) {
  await requireAccess();
  await prisma.clientAttestationBatch.delete({ where: { id: batchId } });
  revalidatePath("/portal/admin/client-attestations");
  redirect("/portal/admin/client-attestations");
}


// ---------------------------------------------------------------- sending

function baseUrl() {
  return (
    process.env.AUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}

// SEND ONE CLIENT'S FORM. One row, one recipient, one email - the send button
// on each row of the review screen. The recipient is one of SEND_TARGETS; the
// two assigned ones resolve to accounts, the other two are typed addresses.
//
// Every send goes through the shared off-production guard, so until the live
// phrase is set on the real deployment everything is redirected to the test
// inbox whatever is picked here.
export async function sendAttestationOne(attestationId, formData) {
  await requireAccess();

  const target = String(formData.get("target") || "");
  if (!SEND_TARGETS.includes(target)) return { ok: false, error: "target" };

  const row = await prisma.clientAttestation.findUnique({
    where: { id: attestationId },
    select: {
      id: true,
      clientName: true,
      formUrl: true,
      signedAt: true,
      clientSignedAt: true,
      clientSignedPdfUrl: true,
      batch: { select: { id: true, monthLabel: true } },
      staffUser: {
        select: { email: true, name: true, preferredFirstName: true, preferredLastName: true },
      },
      supervisor: {
        select: { email: true, name: true, preferredFirstName: true, preferredLastName: true },
      },
    },
  });
  if (!row) return { ok: false, error: "norow" };
  if (row.signedAt) return { ok: false, error: "signed" };
  if (!row.formUrl) return { ok: false, error: "noform" };

  let to = null;
  if (target === "supervisor") {
    if (!row.supervisor?.email) return { ok: false, error: "nosupervisor" };
    to = { email: row.supervisor.email, name: preferredName(row.supervisor) };
  } else if (target === "staff") {
    if (!row.staffUser?.email) return { ok: false, error: "nostaff" };
    to = { email: row.staffUser.email, name: preferredName(row.staffUser) };
  } else {
    const email = String(formData.get("email") || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "noemail" };
    to = { email, name: null };
  }

  // a client or staff link only carries the client's fields; the other two get
  // the whole form. "other" is a typed address standing in for whoever collects
  // the signature, so it gets the full form too.
  const audience = target === "client" || target === "staff" ? target : "supervisor";
  // a link cut for the client's fields is pointless once that half is on file
  if (audience !== "supervisor" && row.clientSignedAt) {
    return { ok: false, error: "clientsigned" };
  }

  // once the client's half exists, every send carries on from that copy
  const pdf = await fetchStored(row.clientSignedPdfUrl || row.formUrl);
  if (!pdf) return { ok: false, error: "noform" };

  const result = await sendAttestation({
    intendedEmail: to.email,
    recipientName: to.name,
    kind: target,
    clientName: row.clientName,
    monthLabel: row.batch.monthLabel,
    signUrl: `${baseUrl()}/a/schedule/${signAttestationToken(row.id, audience)}`,
    pdf,
    pdfName: formFileName(row.clientName, row.batch.monthLabel),
  });
  if (!result.ok) return { ok: false, error: result.error };

  await prisma.clientAttestation.update({
    where: { id: row.id },
    data: {
      sentAt: new Date(),
      sentToEmail: result.to[0],
      intendedEmail: result.intendedEmail,
      sentToKind: target,
    },
  });
  await prisma.clientAttestationBatch.update({
    where: { id: row.batch.id },
    // what this send actually was, recorded on the batch so a test run can
    // never be mistaken for a real one later
    data: { testMode: !attestationLiveSend() },
  });

  revalidatePath(`/portal/admin/client-attestations/${row.batch.id}`);
  return {
    ok: true,
    to: result.to[0],
    redirected: result.redirected,
    intendedEmail: result.intendedEmail,
  };
}

// ---------------------------------------------------------------- roster

// IMPORT HR'S CLIENT ROSTER: which staff have which clients.
//
// Replaces the whole table each time. The roster is a point-in-time export -
// half-merging two months of it would show clients nobody serves any more next
// to their replacements, and there is no row-level history worth keeping here:
// the attestation rows copy what they need at their own upload.
export async function uploadClientRoster(formData) {
  const user = await requireAccess();
  void user;

  const file = formData.get("file");
  if (!file || typeof file !== "object" || !("size" in file) || file.size === 0) {
    redirect(`/portal/admin/client-attestations/caseloads?error=nofile`);
  }

  let read;
  try {
    read = readClientRoster(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    console.error("roster parse failed:", e?.message || e);
    redirect(`/portal/admin/client-attestations/caseloads?error=parse`);
  }
  if (read.error === "columns") {
    redirect(
      `/portal/admin/client-attestations/caseloads?error=columns&why=${encodeURIComponent(
        read.headers.join(", ") || "no header row found",
      )}`,
    );
  }
  if (!read.rows.length) {
    redirect(`/portal/admin/client-attestations/caseloads?error=empty`);
  }

  const accounts = await prisma.user.findMany({
    where: { deactivatedAt: null },
    select: {
      id: true,
      name: true,
      preferredFirstName: true,
      preferredLastName: true,
      supervisorId: true,
    },
  });

  const rows = read.rows.map((r) => ({
    ...r,
    staffUserId: r.caseWorkerName
      ? matchRosterStaff(r.caseWorkerName, accounts)?.id || null
      : null,
  }));

  // one transaction: the old roster is only gone once the new one is in
  await prisma.$transaction([
    prisma.client.deleteMany({}),
    prisma.client.createMany({ data: rows }),
  ]);

  // BACKFILL THE OPEN ATTESTATION ROWS. A month uploaded before this import
  // routes off whatever the roster said at ITS upload - nothing, if the roster
  // came second - and re-uploading 252 pages to fix a routing column is the
  // wrong tool. Signed rows are never touched: they are records of what
  // happened, not projections of the current roster.
  const supervisorOf = new Map(accounts.map((a) => [a.id, a.supervisorId || null]));
  const byKey = new Map(rows.map((r) => [r.clientKey, r]));
  const open = await prisma.clientAttestation.findMany({
    where: { signedAt: null },
    select: { id: true, clientKey: true },
  });
  const updates = [];
  for (const a of open) {
    const r = byKey.get(a.clientKey);
    if (!r?.staffUserId) continue;
    updates.push(
      prisma.clientAttestation.update({
        where: { id: a.id },
        data: {
          caseWorker: r.caseWorkerName,
          office: r.office,
          staffUserId: r.staffUserId,
          supervisorUserId: supervisorOf.get(r.staffUserId) || null,
          matchMethod: "roster",
        },
      }),
    );
  }
  for (let i = 0; i < updates.length; i += 25) {
    await prisma.$transaction(updates.slice(i, i + 25));
  }

  revalidatePath("/portal/admin/client-attestations/caseloads");
  revalidatePath("/portal/admin/client-attestations");
  redirect("/portal/admin/client-attestations/caseloads");
}

// WHICH FIELD SUPERVISOR A STAFF MEMBER REPORTS TO - the mapping the hierarchy
// runs on. Set from the caseloads screen, per staff member.
export async function setStaffSupervisor(staffUserId, formData) {
  await requireAccess();
  const supervisorId = String(formData.get("supervisorId") || "") || null;
  if (supervisorId === staffUserId) return; // nobody supervises themselves
  await prisma.user.update({
    where: { id: staffUserId },
    data: { supervisorId },
  });
  // the open attestation rows routed through this staff member follow the
  // change; signed ones stay as they were signed
  await prisma.clientAttestation.updateMany({
    where: { signedAt: null, staffUserId },
    data: { supervisorUserId: supervisorId },
  });
  revalidatePath("/portal/admin/client-attestations/caseloads");
  revalidatePath("/portal/admin/client-attestations");
}

// SEND THE WHOLE MONTH, or what is left of it. The row buttons handle one
// client; this is the same send repeated over every unsigned row.
//
// DESTINATIONS ARE CHECKBOXES, NOT A CHOICE OF ONE (Mánu 2026-08-24): a round
// can go to each client's field supervisor AND their assigned staff AND a typed
// address in one press. Every row gets one email per destination that resolves;
// what does not resolve is skipped by name, never silently.
//
//   supervisor  full form, to the supervisor over the client's assigned staff
//   staff       the client-fields link - the staff member sits with the client,
//               who signs off the staff's email
//   client      no addresses are stored for clients, so today every row under
//               this destination reports as skipped; it is offered so the round
//               is described honestly rather than the option missing
//   other       full form, to one typed address
export async function sendAttestations(batchId, formData) {
  await requireAccess();

  const targets = formData.getAll("target").map(String);
  const valid = ["supervisor", "staff", "client", "other"];
  if (!targets.length || targets.some((t) => !valid.includes(t))) {
    return { ok: false, error: "target" };
  }
  const message = String(formData.get("message") || "").trim().slice(0, 300) || null;
  const dueAt = String(formData.get("dueAt") || "").trim() || null;
  const onlyUnsent = formData.get("onlyUnsent") === "on";

  let otherEmail = null;
  if (targets.includes("other")) {
    otherEmail = String(formData.get("customEmail") || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(otherEmail)) return { ok: false, error: "noemail" };
  }

  const batch = await prisma.clientAttestationBatch.findUnique({
    where: { id: batchId },
    select: { id: true, monthLabel: true },
  });
  if (!batch) return { ok: false, error: "nobatch" };

  const rows = await prisma.clientAttestation.findMany({
    where: {
      batchId,
      signedAt: null,
      formUrl: { not: null },
      ...(onlyUnsent ? { sentAt: null } : {}),
    },
    select: {
      id: true,
      clientName: true,
      formUrl: true,
      clientSignedAt: true,
      clientSignedPdfUrl: true,
      supervisor: {
        select: { email: true, name: true, preferredFirstName: true, preferredLastName: true },
      },
      staffUser: {
        select: { email: true, name: true, preferredFirstName: true, preferredLastName: true },
      },
    },
    orderBy: { clientName: "asc" },
  });

  let sent = 0;
  const skipped = [];
  const failed = [];

  for (const row of rows) {
    const pdf = await fetchStored(row.clientSignedPdfUrl || row.formUrl);
    if (!pdf) {
      failed.push(`${row.clientName} (noform)`);
      continue;
    }

    for (const target of targets) {
      let to = null;
      // who this destination means for THIS row, and why it may mean nobody
      if (target === "supervisor") {
        if (!row.supervisor?.email) {
          skipped.push(`${row.clientName} (no supervisor)`);
          continue;
        }
        to = { email: row.supervisor.email, name: preferredName(row.supervisor) };
      } else if (target === "staff") {
        if (!row.staffUser?.email) {
          skipped.push(`${row.clientName} (no staff account)`);
          continue;
        }
        to = { email: row.staffUser.email, name: preferredName(row.staffUser) };
      } else if (target === "client") {
        // client emails are not stored - see the Client roster model
        skipped.push(`${row.clientName} (no client email on file)`);
        continue;
      } else {
        to = { email: otherEmail, name: null };
      }

      // staff and client links carry only the client's fields; those are spent
      // once the client's half is on file
      const audience = target === "staff" || target === "client" ? target : "supervisor";
      if (audience !== "supervisor" && row.clientSignedAt) {
        skipped.push(`${row.clientName} (client already signed)`);
        continue;
      }

      const result = await sendAttestation({
        intendedEmail: to.email,
        recipientName: to.name,
        kind: target,
        clientName: row.clientName,
        monthLabel: batch.monthLabel,
        signUrl: `${baseUrl()}/a/schedule/${signAttestationToken(row.id, audience)}`,
        message,
        dueAt,
        pdf,
        pdfName: formFileName(row.clientName, batch.monthLabel),
      });
      if (!result.ok) {
        failed.push(`${row.clientName} (${result.error})`);
        continue;
      }
      sent++;
      // several destinations on one row: the row records the latest send,
      // which is what the Sent column shows
      await prisma.clientAttestation.update({
        where: { id: row.id },
        data: {
          sentAt: new Date(),
          sentToEmail: result.to[0],
          intendedEmail: result.intendedEmail,
          sentToKind: target,
          dueAt: dueAt ? new Date(dueAt) : null,
        },
      });
    }
  }

  await prisma.clientAttestationBatch.update({
    where: { id: batchId },
    data: { testMode: !attestationLiveSend() },
  });

  revalidatePath(`/portal/admin/client-attestations/${batchId}`);
  return { ok: true, sent, skipped, failed };
}

// RECORD A SIGNATURE THAT CAME BACK ON PAPER.
//
// The other half of "download the individual form to sign and it get stored in
// the portal once signed": a supervisor prints the form, sits with the client,
// both sign with a pen - and until this existed the portal had no way to take
// that piece of paper back. The row read "Not signed" for ever while the signed
// copy sat in somebody's bag.
//
// THE FILE IS REQUIRED, unlike the timesheet sibling. Storing the signed
// document is the point of this card - HR wants the portal to hold it and say
// who signed - so a record with nothing behind it is refused rather than
// warned about. A photo can be saved as a PDF from any phone.
export async function recordPaperSignature(attestationId, formData) {
  const user = await requireAccess();

  const row = await prisma.clientAttestation.findUnique({
    where: { id: attestationId },
    select: { id: true, batchId: true, signedAt: true },
  });
  if (!row) return { ok: false, error: "gone" };
  if (row.signedAt) return { ok: false, error: "already" };

  const name = String(formData.get("signedName") || "").trim().slice(0, 120);
  if (!name) return { ok: false, error: "noname" };

  // THE DATE THEY SIGNED, NOT THE DATE IT WAS TYPED IN. A form signed on the
  // 18th and filed on the 19th is a document dated the 18th.
  const whenRaw = String(formData.get("signedOn") || "").trim();
  const when = whenRaw ? new Date(whenRaw) : new Date();
  if (Number.isNaN(when.getTime())) return { ok: false, error: "baddate" };
  if (when.getTime() > Date.now() + 24 * 60 * 60 * 1000) return { ok: false, error: "baddate" };

  const file = formData.get("file");
  if (!file || typeof file !== "object" || !("size" in file) || file.size === 0) {
    return { ok: false, error: "nofile" };
  }
  if (file.size > 8_000_000) return { ok: false, error: "toobig" };
  if (file.type && file.type !== "application/pdf") return { ok: false, error: "notpdf" };
  if (!hasBlobStorage()) return { ok: false, error: "noblob" };

  let stored;
  try {
    stored = await putBlob(
      `client-attestations/signed/${randomBytes(12).toString("hex")}.pdf`,
      Buffer.from(await file.arrayBuffer()),
      { access: "public", contentType: "application/pdf" },
    );
  } catch (e) {
    console.error("paper signature upload failed:", e?.message || e);
    return { ok: false, error: "store" };
  }

  // conditional write, so a browser signature landing in the same moment
  // cannot be overwritten by the scan - whichever files first stands
  const updated = await prisma.clientAttestation.updateMany({
    where: { id: row.id, signedAt: null },
    data: {
      signedAt: when,
      signedName: name,
      signedPdfUrl: stored.url,
      signedVia: "paper",
      // NOT an ip: nothing about this came from the signer's browser, and the
      // filer's address in a field that means "where they signed from" would be
      // a small lie in a record built to be checkable
      signedIp: null,
      filedById: user.id,
      filedByName: preferredName(user) || user.email || user.id,
    },
  });
  if (updated.count === 0) return { ok: false, error: "already" };

  revalidatePath(`/portal/admin/client-attestations/${row.batchId}`);
  revalidatePath(`/portal/admin/client-attestations/${row.batchId}/caseloads`);
  return { ok: true };
}
