// signed forms as a zip, one PDF per submission, so each can be filed on its
// own (QSP takes them one at a time). the bundle routes merge them; this
// keeps them apart.
import { fetchStored } from "@/lib/client-attestations/serve";
import { buildZip, safeEntryName } from "@/lib/zip";
import { submissionRow } from "./query";
import { fileDate } from "../acknowledgments/audit";

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function slugify(title, fallback) {
  return (
    String(title || "")
      .toLowerCase()
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback
  );
}

// groups: [{ folder?, formTitle, submissions }]. a folder puts that form's
// files in their own directory (the all-forms zip); without one they sit at
// the root. every name carries the person, the form and the day signed, so a
// file still says what it is once it's pulled out of the zip.
export async function buildSignedFormsZip(groups) {
  const files = [];
  const seen = new Map();
  for (const g of groups) {
    const bytesList = await Promise.all(g.submissions.map((s) => fetchStored(s.pdfUrl).catch(() => null)));
    g.submissions.forEach((s, i) => {
      const data = bytesList[i];
      if (!data) return;
      const who = submissionRow(s).who || "Unknown";
      const base = safeEntryName(`${who} - ${g.formTitle} - ${dayFmt.format(new Date(s.createdAt))}`, "form");
      const dir = g.folder ? `${safeEntryName(g.folder, "form")}/` : "";
      // same person, same form, same day can happen; a zip can't hold two of one name
      const key = dir + base;
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      files.push({ name: `${dir}${n === 1 ? base : `${base} (${n})`}.pdf`, data });
    });
  }
  return files.length ? buildZip(files) : null;
}

export function zipResponse(buf, slug) {
  return new Response(buf, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}-${fileDate()}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
