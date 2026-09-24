// THE TOKEN DESK FOR BROWSER-TO-BLOB UPLOADS. The upload form's big exports
// go straight from the browser into Blob storage - one request carrying eight
// exports runs to 30MB+, which Vercel's 4.5MB serverless body cap refuses in
// production and the preview pane chokes on locally. This route only hands out
// presigned upload urls; the files themselves never pass through it.
//
// They land in the PRIVATE store. That store signs in with OIDC and has no
// read-write key, and a key is what the older client-token handshake needs,
// so this is the presigned handshake instead: the browser asks here, gets one
// url good for one file for fifteen minutes, and PUTs the bytes to it.
//
// The url is scoped hard: timesheet access required, the timesheets upload
// prefix only, the export content types only, 64MB a file. `uploadBatch` then
// receives the blob URLs and re-reads the bytes itself, so what gets parsed
// is what landed in our own store.
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { privateBlobAuth } from "@/lib/blob";

const EXPORT_TYPES = [
  "application/pdf",
  "application/vnd.ms-excel",
  // browsers label .xls octet-stream often enough that refusing it
  // would refuse real QSP exports
  "application/octet-stream",
];
const MAX_BYTES = 64 * 1024 * 1024;

export async function POST(request) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    const json = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        if (!pathname.startsWith("timesheets/src/")) {
          throw new Error("uploads live under timesheets/src/");
        }
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: EXPORT_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          validUntil: Date.now() + 15 * 60 * 1000,
          ...privateBlobAuth(),
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: EXPORT_TYPES,
            maximumSizeInBytes: MAX_BYTES,
            addRandomSuffix: true,
            allowOverwrite: false,
          },
        };
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    console.error("blob upload url refused:", e);
    return NextResponse.json({ error: e?.message || "refused" }, { status: 400 });
  }
}
