import { NextResponse } from "next/server";
import { verifyTimesheetToken } from "@/lib/timesheet-token";
import { getSheetVersion } from "@/lib/timesheet-presence";

// HAS ANYTHING ON MY SHEET MOVED SINCE I LAST LOOKED?
//
// So a change a reviewer makes while they are on the phone about it reaches the
// page the employee is looking at, without either of them saying "reload". The
// case it exists for: somebody rings to say they did take a break, the control
// on their own page will not let them change it, and the fix is made from the
// admin screen while they watch.
//
// THE SAME SHAPE THE ADMIN SCREENS ALREADY USE - see `getBatchVersion` and the
// note above it. A counter, not the data: one redis GET per poll, and the server
// components stay the one place that knows how to read the sheet.
//
// GATED ON THE TOKEN, like every other route under /t. The token IS the
// credential and it only ever unlocks this one timesheet. Nothing here reads a
// session, because the person this is for does not have one.
//
// IT LEAKS A COUNTER AND NOTHING ELSE. A number that goes up says something
// about this sheet changed, which is a fact the holder of the link is entitled
// to and which says nothing about what, or about anybody else.
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { token } = await params;
  const id = verifyTimesheetToken(token);
  if (!id) return new NextResponse("Not found", { status: 404 });

  const v = await getSheetVersion(id);
  return NextResponse.json(
    { v },
    // never cached. A stale counter is a page that stops updating, which is the
    // one failure this whole thing exists to prevent.
    { headers: { "Cache-Control": "no-store" } },
  );
}
