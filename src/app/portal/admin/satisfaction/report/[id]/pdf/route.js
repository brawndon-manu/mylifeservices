import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { canManageClientAttestations } from "@/lib/roles";
import { renderSatisfactionPdf } from "@/lib/client-reports/satisfaction-pdf";

// one filled survey as the printed form, built on demand from the stored
// answers so it can never disagree with what was recorded.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const user = await getCurrentUser();
  // client feedback is sensitive - same gate as the survey desk itself
  if (!canManageClientAttestations(user?.role)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { id } = await params;
  const r = await prisma.clientReport.findUnique({
    where: { id },
    select: { clientName: true, answers: true, conductedByName: true, createdAt: true },
  });
  if (!r) return new NextResponse("Not found", { status: 404 });

  const conductedOn = new Date(r.createdAt).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  let bytes;
  try {
    const out = await renderSatisfactionPdf({
      clientName: r.clientName,
      answers: r.answers,
      conductedByName: r.conductedByName,
      conductedOn,
    });
    bytes = out.bytes;
  } catch (e) {
    console.error("satisfaction survey pdf failed:", e);
    return new NextResponse("Could not build the survey", { status: 500 });
  }

  const slug =
    r.clientName
      .toLowerCase()
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "client";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="satisfaction-survey-${slug}-${conductedOn.replaceAll("/", "-")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
