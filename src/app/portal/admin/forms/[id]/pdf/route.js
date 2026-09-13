import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFormRecords } from "@/lib/roles";
import { OFFICE_FILTER_LABELS } from "@/lib/positions";
import { renderFormSignatureReport } from "@/lib/form-report-pdf";
import { appendSourceDocument, appendReplies } from "@/lib/forms/email-ack-pdf";
import { fetchStored } from "@/lib/client-attestations/serve";
import { preferredName } from "@/lib/contacts";
import { PERIODS, readFilters, submissionWhere, submissionRow } from "../../query";
import { fileDate } from "../../../acknowledgments/audit";
import { fmtPosted } from "../../../acknowledgments/roster";

// one form's signature record as a document, honoring the same filters as the
// page. built on demand so it can never disagree with the screen.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const user = await getCurrentUser();
  if (!canViewFormRecords(user?.role)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { id } = await params;
  const form = await prisma.form.findUnique({
    where: { id },
    select: { id: true, title: true, category: true, fileUrl: true },
  });
  if (!form) return new NextResponse("Not found", { status: 404 });

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const filters = { ...readFilters(sp), form: form.id };
  const submissions = await prisma.formSubmission.findMany({
    where: submissionWhere(filters),
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          name: true,
          preferredFirstName: true,
          preferredLastName: true,
          email: true,
        },
      },
    },
  });

  const unassigned = submissions.filter((s) => s.attribution === "unassigned").length;
  const bits = [];
  if (filters.office) bits.push(`${OFFICE_FILTER_LABELS[filters.office]} only`);
  if (filters.status === "unassigned") bits.push("needs assignment only");
  if (filters.status === "attributed") bits.push("attributed only");
  if (filters.period !== "all") bits.push(PERIODS[filters.period].toLowerCase());
  if (filters.q) bits.push(`search "${filters.q}"`);

  let bytes;
  try {
    const out = await renderFormSignatureReport(
      {
        formTitle: form.title,
        category: form.category,
        filterLabel: bits.join(" · "),
        stats: {
          total: submissions.length,
          attributed: submissions.length - unassigned,
          unassigned,
          lastLabel: submissions.length ? fmtPosted(submissions[0].createdAt) : null,
        },
        rows: submissions.map(submissionRow),
      },
      {
        generatedOn: new Date().toLocaleDateString("en-US", {
          timeZone: "America/Los_Angeles",
        }),
      },
    );
    bytes = out.bytes;
  } catch (e) {
    console.error("form signature report pdf failed:", e);
    return new NextResponse("Could not build the report", { status: 500 });
  }

  // WHAT EACH PERSON WROTE, where the submission is words rather than a filled
  // form. Before the roster, the reader sees the evidence; after it, the
  // document they were agreeing to.
  try {
    bytes = await appendReplies(
      Buffer.from(bytes),
      submissions.map((sub) => ({
        name: sub.user ? preferredName(sub.user) : sub.submitterName,
        asTyped: sub.submitterName,
        when: sub.createdAt,
        text: sub.submittedText,
      })),
    );
  } catch (e) {
    console.error("could not attach the replies to the report:", e);
  }

  // AND THE DOCUMENT ITSELF. A roster of who acknowledged does not say what
  // they acknowledged, which is what made this report useless on its own for
  // the SB-294 backfill - it is the notice and the email that carry the
  // obligation. Best effort: a document that will not fetch costs the
  // attachment, never the report.
  try {
    const source = await fetchStored(form.fileUrl);
    if (source) {
      bytes = await appendSourceDocument(Buffer.from(bytes), source, { title: form.title });
    }
  } catch (e) {
    console.error("could not attach the source document to the report:", e);
  }

  const slug = form.title
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "form";
  const suffix = filters.office ? `-${filters.office.toLowerCase()}` : "";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="signatures-${slug}${suffix}-${fileDate()}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
