import { prisma } from "@/lib/prisma";
import { preferredName } from "@/lib/contacts";
import { parseBlobUrl } from "@/lib/blob-paths";
import { formNumber } from "@/lib/clock-amendment/rules";
import { shortDay } from "@/lib/document-dates";
import { accessLabel, clientInitials, kindOfTarget, periodRange } from "@/lib/access-labels";

// WHAT A STORED FILE IS, IN WORDS, for the access log line the gate writes when
// it serves one. the gate only has the pathname, so this finds the row that
// points at it. best-effort: no match (or any error) is null, and the line
// falls back to the kind its folder says.
export async function describeStoredFile(pathname) {
  try {
    const p = String(pathname || "");
    const kind = kindOfTarget(p);

    if (p.startsWith("clock-amendments/")) {
      const a = await prisma.clockAmendment.findUnique({
        where: { id: p.split("/")[1] || "" },
        select: { id: true, createdAt: true, staff: { select: NAME } },
      });
      return a ? accessLabel(kind, formNumber(a), preferredName(a.staff)) : null;
    }

    if (p.startsWith("timesheets/signed/") || p.startsWith("timesheets/approved/")) {
      const cols = ["signedPdfUrl", "approvedPdfUrl"];
      const select = { user: { select: NAME }, sourceName: true, batch: { select: { periodFrom: true, periodTo: true } } };
      const t = await byUrl("timesheet", cols, p, select);
      if (t) return accessLabel(kind, sheetName(t), periodRange(t.batch.periodFrom, t.batch.periodTo));
      const d = await byUrl("dayProgramSheet", cols, p, select);
      return d ? accessLabel(kind, sheetName(d), periodRange(d.batch.periodFrom, d.batch.periodTo), "Day Program") : null;
    }

    if (p.startsWith("client-attestations/")) {
      const a = await byUrl("clientAttestation", ["formUrl", "signedPdfUrl", "clientSignedPdfUrl"], p, {
        clientName: true,
        batch: { select: { monthLabel: true } },
      });
      if (a) return accessLabel(kind, clientInitials(a.clientName), a.batch.monthLabel);
      const b = await byUrl("clientAttestationBatch", ["sourceUrl"], p, { monthLabel: true });
      return b ? accessLabel("QSP client schedules", b.monthLabel) : null;
    }

    if (p.startsWith("form-submissions/") || p.startsWith("form-email-imports/")) {
      const s = await byUrl("formSubmission", ["pdfUrl"], p, {
        createdAt: true,
        submitterName: true,
        user: { select: NAME },
        form: { select: { title: true } },
      });
      return s ? submissionLabel(s) : null;
    }

    if (p.startsWith("certificates/templates/")) {
      const b = await byUrl("certificateBatch", ["templateUrl"], p, { title: true });
      return b ? accessLabel(kind, b.title) : null;
    }

    if (p.startsWith("certificates/")) {
      const c = await byUrl("certificate", ["pdfUrl"], p, { printedName: true, batch: { select: { title: true } } });
      return c ? accessLabel(kind, c.printedName, c.batch?.title) : null;
    }

    if (p.startsWith("applications/")) {
      const a = await byUrl("application", ["resumeUrl"], p, { firstName: true, lastName: true });
      return a ? accessLabel("Application résumé", `${a.firstName} ${a.lastName}`) : null;
    }
    return null;
  } catch (e) {
    console.error("access log label failed:", pathname, e?.message || e);
    return null;
  }
}

// "Special Incident Report · sent Sep 23 by <name>" - the words a submission
// goes by everywhere the log names one
export function submissionLabel(s) {
  const who = preferredName(s.user) || s.submitterName || "";
  return accessLabel(s.form?.title || "Signed form", `sent ${shortDay(s.createdAt)}${who ? ` by ${who}` : ""}`);
}

// the person on a sheet: their account's name, or the name the export printed
export function sheetName(t) {
  return preferredName(t.user) || t.sourceName || "";
}

const NAME = { name: true, preferredFirstName: true, preferredLastName: true, email: true };

// the row whose url column ends in this pathname, held to an exact match -
// `_` is a wildcard to the database, and an upload may have stored the name
// percent-encoded, so both spellings are asked for (the gate does the same)
async function byUrl(model, columns, pathname, select) {
  const encoded = pathname.split("/").map(encodeURIComponent).join("/");
  const ends = [...new Set([pathname, encoded])];
  const rows = await prisma[model].findMany({
    where: { OR: columns.flatMap((c) => ends.map((e) => ({ [c]: { endsWith: `/${e}` } }))) },
    select: { ...select, ...Object.fromEntries(columns.map((c) => [c, true])) },
    take: 5,
  });
  return rows.find((r) => columns.some((c) => parseBlobUrl(r[c])?.pathname === pathname)) || null;
}
