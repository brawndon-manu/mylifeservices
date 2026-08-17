// Everything under one batch shares its presence, and its read-only rule.
//
// See BatchPresence: being in a batch is being in the batch, whichever of its
// fourteen screens you are on. Mounting it here rather than per page means a
// screen added later is covered by default instead of being invisible until
// somebody remembers.
//
// The banner is here for the same reason. A replaced upload is read only on
// EVERY one of its screens, and saying so on each of them separately is a rule
// with fourteen places to forget it.
//
// No auth here on purpose - every page below already redirects on its own, and
// a layout that redirected would be a second place for that rule to drift from.
import Link from "next/link";
import BatchPresence from "./BatchPresence";
import ReadOnlyProvider from "./ReadOnly";
import { supersededBy } from "@/lib/timesheet/superseded";
import { companyDate } from "@/lib/company-time";
import { prisma } from "@/lib/prisma";
import { SignatureBadge } from "../_components/LiveBadge";

export default async function TimesheetBatchLayout({ children, params }) {
  const { id } = await params;
  const newer = await supersededBy(id);
  // OUT FOR SIGNATURE, ON EVERY SCREEN OF THE BATCH.
  //
  // Here rather than on the pages for the reason this file already gives about
  // the presence bar and the read-only banner: it is true of the batch, not of
  // one screen, and a fifteenth screen added later is covered by default rather
  // than being the one that quietly lacks it.
  //
  // Two counts, not sixty rows. `_count` with a filter is one query and no
  // sheet payloads - these pages already load what they need and this must not
  // become a second copy of it.
  const [sent, signed] = await Promise.all([
    prisma.timesheet.count({ where: { batchId: id, sentAt: { not: null } } }),
    prisma.timesheet.count({ where: { batchId: id, signedAt: { not: null } } }),
  ]);
  return (
    <BatchPresence batchId={id}>
      {/* THE LIGHT IS ONLY HONEST IF THE PAGE UNDER IT IS FRESH, and it is:
          `BatchPresence` above already polls the batch version every few
          seconds and calls `router.refresh()` the moment it moves. No second
          poller here - one per screen per tab is how a fourteen-screen batch
          starts making fourteen requests a beat.

          What that poller did NOT see until today is a SIGNATURE. `signTimesheet`
          revalidated the batch page and never bumped the version, so the number
          beside this badge would have sat still while people signed. Fixed in
          `actions.js`; without it this badge would blink over a stale count,
          which is worse than not having one. */}
      {sent > 0 && (
        <div className="mx-auto max-w-7xl px-6 pt-6">
          <SignatureBadge sent={sent} signed={signed} />
        </div>
      )}
      {/* every control below reads this rather than each screen asking. The
          server refuses regardless - this only stops a wasted click. */}
      <ReadOnlyProvider readOnly={!!newer}>
      {newer && (
        <div className="mx-auto max-w-7xl px-6 pt-8">
          <div className="rounded-xl border border-border-strong bg-surface-2 p-4">
            <p className="text-sm font-semibold text-foreground">
              This upload has been replaced. Nothing here can be changed.
            </p>
            <p className="mt-1 text-sm text-muted">
              A newer export of the same pay period landed{" "}
              {companyDate(newer.createdAt, {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
              . You can still read everything on this one.
            </p>
            {/* WHAT CARRIES OVER ANYWAY, said plainly, because the first thought on
                seeing this is that the calling was wasted. It was not: notes,
                marks, contact history and confirmed answers are all keyed on the
                pay period rather than on the upload, so they are already on the
                current one. */}
            <p className="mt-1 text-sm text-muted">
              Notes, contact marks, flags and confirmed answers carry over on their
              own - make the change on the current upload and it applies here too.
            </p>
            <Link
              href={`/portal/admin/timesheets/${newer.id}`}
              className="mt-2 inline-block text-sm font-semibold text-brand"
            >
              Go to the current upload &rarr;
            </Link>
          </div>
        </div>
      )}
        {children}
      </ReadOnlyProvider>
    </BatchPresence>
  );
}
