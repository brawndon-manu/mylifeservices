import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { canSeeForm } from "@/lib/form-visibility";
import { openBlob } from "@/lib/blob";
import { cleanPathname, parseBlobUrl } from "@/lib/blob-paths";
import { canOpenFile, fileRuleFor } from "@/lib/file-access";
import { logFileOpen } from "@/lib/file-log";

// THE GATE. every private file a page links to comes through here: the page
// hands the browser /portal/files/<pathname> (see fileHref), and this checks
// who is asking before it streams a byte. nothing is cached anywhere but the
// visitor's own browser, and a record is not even kept there.
//
// the proxy skips any path with a dot in it, and every file has one, so this
// route is the only check there is - it cannot lean on the proxy.
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { path } = await params;
  const pathname = cleanPathname(path);
  if (!pathname) return new NextResponse("Not found", { status: 404 });

  const user = await getCurrentUser();
  if (!user) {
    // a session that ran out: the file is one sign-in away
    const back = new URL(req.url);
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(back.pathname)}`, req.url),
    );
  }
  const rule = fileRuleFor(pathname);
  let allowed = canOpenFile(user, pathname);
  if (!allowed && rule?.form) allowed = await templateVisibleTo(user, pathname);
  // not yours and not there look the same from outside - but a refused ask
  // for a record is written down, same as an open
  if (!allowed) {
    if (rule?.record) await logFileOpen({ user, pathname, req, action: "denied" });
    return new NextResponse("Not found", { status: 404 });
  }

  const res = await openBlob(pathname, {
    ifNoneMatch: rule.record ? undefined : req.headers.get("if-none-match") ?? undefined,
  });
  if (!res) return new NextResponse("Not found", { status: 404 });

  // a record is never written to disk; a picture may be, and revalidates
  const cacheControl = rule.record ? "private, no-store" : "private, no-cache";
  if (res.statusCode === 304) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: res.blob.etag, "Cache-Control": cacheControl },
    });
  }

  if (rule.record) await logFileOpen({ user, pathname, req });

  const name = (pathname.split("/").pop() || "file").replace(/[^\w.\- ]/g, "_");
  return new NextResponse(res.stream, {
    headers: {
      "Content-Type": res.blob.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
      ETag: res.blob.etag,
      "Cache-Control": cacheControl,
    },
  });
}

// a blank template opens for whoever the forms library would show its form to.
// the stored url ends in the pathname, percent-encoded or not depending on
// what the upload named it, so both spellings are asked for - and then held to
// an exact match, because `_` in a pathname is a wildcard to the database.
async function templateVisibleTo(user, pathname) {
  const encoded = pathname.split("/").map(encodeURIComponent).join("/");
  const forms = await prisma.form.findMany({
    where: { OR: [{ fileUrl: { endsWith: `/${pathname}` } }, { fileUrl: { endsWith: `/${encoded}` } }] },
    select: { fileUrl: true, minRole: true },
    take: 10,
  });
  const owners = forms.filter((f) => parseBlobUrl(f.fileUrl)?.pathname === pathname);
  return owners.length > 0 && owners.every((f) => canSeeForm(f, user.role));
}
