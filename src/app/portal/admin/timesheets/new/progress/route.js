import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { progressKey, getProgress } from "@/lib/timesheet-progress";

// what the upload is doing right now, for the page that kicked it off.
//
// The key is namespaced under the signed-in user inside progressKey, so this
// only ever returns YOUR upload - passing someone else's id just reads a key
// that doesn't exist for you. Nothing here is cached; a stale count is worse
// than no count.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  const state = await getProgress(progressKey(user.id, id));

  return NextResponse.json(state || { stage: null }, {
    headers: { "Cache-Control": "no-store" },
  });
}
