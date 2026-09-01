// THE TOKEN DESK FOR BROWSER-TO-BLOB UPLOADS. The upload form's big exports
// go straight from the browser into Blob storage - one request carrying eight
// exports runs to 30MB+, which Vercel's 4.5MB serverless body cap refuses in
// production and the preview pane chokes on locally. This route only hands out
// scoped upload tokens; the files themselves never pass through it.
//
// The token is scoped hard: timesheet access required, the timesheets upload
// prefix only, the export content types only, 64MB a file. `uploadBatch` then
// receives the blob URLs and re-fetches the bytes itself, so what gets parsed
// is what landed in our own store.
import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { blobToken } from "@/lib/blob";

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
    const json = await handleUpload({
      body,
      request,
      token: blobToken(),
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("timesheets/src/")) {
          throw new Error("uploads live under timesheets/src/");
        }
        return {
          allowedContentTypes: [
            "application/pdf",
            "application/vnd.ms-excel",
            // browsers label .xls octet-stream often enough that refusing it
            // would refuse real QSP exports
            "application/octet-stream",
          ],
          maximumSizeInBytes: 64 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    console.error("blob upload token refused:", e);
    return NextResponse.json({ error: e?.message || "refused" }, { status: 400 });
  }
}
