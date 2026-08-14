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
import { supersededBy } from "@/lib/timesheet/superseded";
import { companyDate } from "@/lib/company-time";

export default async function TimesheetBatchLayout({ children, params }) {
  const { id } = await params;
  const newer = await supersededBy(id);
  return (
    <BatchPresence batchId={id}>
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
    </BatchPresence>
  );
}
