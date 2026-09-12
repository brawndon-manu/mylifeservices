import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canManageClientAttestations } from "@/lib/roles";
import { progressKey, getProgress } from "@/lib/timesheet-progress";

// what the schedules upload is doing right now, for the page that started it.
//
// The key is namespaced under the signed-in user AND under this upload's own
// scope inside progressKey, so this only ever returns your client-schedule
// runs - someone else's id reads a key that does not exist for you, and a
// timesheet id cannot be read here at all. Nothing is cached: a stale count is
// worse than no count.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!canManageClientAttestations(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  const state = await getProgress(progressKey(user.id, id, "ca"));

  return NextResponse.json(state || { stage: null }, {
    headers: { "Cache-Control": "no-store" },
  });
}
