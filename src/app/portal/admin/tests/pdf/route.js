import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canManageTimesheets } from "@/lib/roles";
import { renderSheet } from "@/lib/timesheet/render-sheet";
import { fixtureTimesheet, FIXTURE_BREAK_REASONS } from "../fixture";

// The fabricated sheet, rendered on demand for the Tests card.
//
// `renderSheet` is a pure function of what it is handed - including
// `breakReasons` - so a reason nobody has given can be printed into a real PDF
// without a row existing anywhere. That is what makes this route possible and
// it is the only reason the printed Comments Details block can be seen at all:
// `TimesheetBreakAnswer` is at zero rows, so no real sheet has ever carried one.
//
// NO DATABASE. Nothing is read and nothing is written. The document is built
// from `fixture-sheet.js` and thrown away.
//
// `?reasons=0` renders the same sheet WITHOUT them, which is the comparison
// worth having: the block continues QSP's own numbering, so the thing to check
// is that ours start at 3) and not at 1).
export async function GET(req) {
  const user = await getCurrentUser();
  if (!canManageTimesheets(user?.role)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const withReasons = new URL(req.url).searchParams.get("reasons") !== "0";
  const rendered = await renderSheet(fixtureTimesheet(), {
    basis: "projected",
    breakReasons: withReasons ? FIXTURE_BREAK_REASONS : [],
  });
  if (!rendered) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(rendered.bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="tests-fixture.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
