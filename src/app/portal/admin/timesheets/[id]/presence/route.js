import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { preferredName } from "@/lib/contacts";
import { heartbeat, clearPresence, whoIsHere, getBatchVersion } from "@/lib/timesheet-presence";

// WHERE EVERYBODY IS ON THIS BATCH, and a note that I am still here.
//
// ONE ROUND TRIP, not two. The obvious shape is a POST to say "I am here" and a
// GET to ask "who else is", which doubles the requests for a screen that polls
// every few seconds. Saying and asking are the same moment, so they are the same
// call: the answer comes back from the write.
//
// Behind `canManageTimesheets` like every other route on these screens. Presence
// leaks who is working on what, which is nobody's business but the reviewers'.
//
// Nothing is cached. A stale face is worse than no face - the whole point is not
// ringing somebody Gabe is already talking to.
export async function POST(req, { params }) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { id } = await params;
  let body = {};
  try {
    body = await req.json();
  } catch {
    // a heartbeat with no body is still a heartbeat
  }

  // LEAVING IS THE ONE CASE WE CAN BE TOLD ABOUT. A tab navigating away can say
  // so on the way out, which takes the face off immediately instead of after the
  // 30 second timeout. Everything else - a crash, a closed laptop, a lost
  // connection - falls back to the timeout, which is why the timeout is the real
  // mechanism and this is only a courtesy.
  if (body.leaving) {
    await clearPresence({ batchId: id, userId: user.id });
    return NextResponse.json({ here: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  // the row they are on, if they are on one. Bounded and stripped because it
  // comes from the browser and lands in a redis value.
  const rowKey = String(body.rowKey || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80) || null;
  const page = String(body.page || "").replace(/[^a-z]/g, "").slice(0, 20) || null;

  await heartbeat({
    batchId: id,
    // a hover is a pointer resting on a card; anything else is the page they
    // have open. Only the sender can tell them apart - see the note in
    // Presence.js about why this stopped being inferred.
    hover: body.hover === true,
    // WHETHER THE WINDOW IS IN FRONT OF THEM. Only the sender knows, same as
    // `hover`. Left off here it arrives undefined and every hidden tab reads as
    // somebody sitting looking at the screen - which is the difference between
    // "he has it open" and "do not upload on top of him".
    hidden: body.hidden === true,
    userId: user.id,
    name: preferredName(user) || user.name || user.email || null,
    image: user.image || null,
    rowKey,
    page,
  });

  const [here, version] = await Promise.all([
    whoIsHere(id, { exceptUserId: user.id }),
    // WHAT ELSE MOVED. The poll is already happening, so the counter rides back
    // with it: a client whose number changed re-fetches the page, which is how
    // somebody else's note or flag appears without a reload.
    getBatchVersion(id),
  ]);

  return NextResponse.json({ here, version }, { headers: { "Cache-Control": "no-store" } });
}
