import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { isElevated } from "@/lib/roles";
import { logFileOpen, logFileDenied } from "@/lib/file-log";
import { accessLabel } from "@/lib/access-labels";
import { parseBlobUrl } from "@/lib/blob-paths";
import { fetchBlob } from "@/lib/blob";

// gated resume download. the resume lives in the private store under a random
// key; we re-check the oversight role here and STREAM the file back ourselves,
// so the stored url never reaches the client, the network tab, or the address
// bar. every open and every refusal is written down.
export async function GET(req, { params }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!isElevated(user?.role)) {
    await logFileDenied({ user, pathname: `applications/${id}`, req, label: "Application résumé" });
    return new NextResponse("Forbidden", { status: 403 });
  }

  const app = await prisma.application.findUnique({
    where: { id },
    select: { resumeUrl: true, resumeName: true, firstName: true, lastName: true },
  });
  if (!app?.resumeUrl) return new NextResponse("Not found", { status: 404 });

  const res = await fetchBlob(app.resumeUrl);
  if (!res.ok) return new NextResponse("Not found", { status: 404 });

  const buf = await res.arrayBuffer();
  await logFileOpen({
    user,
    pathname: parseBlobUrl(app.resumeUrl)?.pathname || `applications/${id}`,
    req,
    label: accessLabel("Application résumé", `${app.firstName} ${app.lastName}`),
  });
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
