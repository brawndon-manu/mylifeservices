// Everything under one batch shares its presence.
//
// See BatchPresence: being in a batch is being in the batch, whichever of its
// fourteen screens you are on. Mounting it here rather than per page means a
// screen added later is covered by default instead of being invisible until
// somebody remembers.
//
// No auth here on purpose - every page below already redirects on its own, and
// a layout that redirected would be a second place for that rule to drift from.
import BatchPresence from "./BatchPresence";

export default async function TimesheetBatchLayout({ children, params }) {
  const { id } = await params;
  return <BatchPresence batchId={id}>{children}</BatchPresence>;
}
