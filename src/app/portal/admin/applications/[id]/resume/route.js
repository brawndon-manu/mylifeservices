import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";

// gated resume download. the resume lives in Blob under a random key, but Blob is
// a PUBLIC store - so instead of ever handing that url to the browser, we re-check
// the oversight role here and STREAM the file back ourselves. the raw Blob url
// never reaches the client, the network tab, or the address bar.
export async function GET(_req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!isElevated(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const app = await prisma.application.findUnique({
    where: { id },
    select: { resumeUrl: true, resumeName: true },
  });
  if (!app?.resumeUrl) return new NextResponse("Not found", { status: 404 });

  const res = await fetch(app.resumeUrl);
  if (!res.ok) return new NextResponse("Not found", { status: 404 });

  const buf = await res.arrayBuffer();
  const type = res.headers.get("content-type") || "application/octet-stream";
  const safeName = (app.resumeName || "resume").replace(/[^\w.\- ]/g, "_");
  return new NextResponse(buf, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
