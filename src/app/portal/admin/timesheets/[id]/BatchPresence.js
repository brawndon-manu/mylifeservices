"use client";

// ANYWHERE INSIDE A BATCH COUNTS AS BEING IN IT.
//
// Presence used to be mounted on two of the fourteen screens under a batch - the
// all-employees list and one person's page - so somebody working the checks
// screen, the stats or the penalties was invisible. Opening a batch is being in
// the batch, whichever of its screens you happen to be on.
//
// So it mounts ONCE, in the layout, and reads where you are off the URL. Doing it
// per page would mean fourteen mounts to keep in step, and a screen added later
// would be invisible again by default - which is exactly how this happened.
//
// ONE PROVIDER, NEVER TWO. The redis entry is keyed on the person, so a second
// provider under the same user would overwrite the first on every beat and the
// two would fight over what page they were on. The pages below read presence
// from this one through context instead of mounting their own.
import { usePathname } from "next/navigation";
import PresenceProvider from "./Presence";

// what the URL says about where somebody is. `/timesheets/<id>` is the batch
// home; anything deeper names its own screen.
function readPath(pathname, batchId) {
  const after = String(pathname || "").split(`/timesheets/${batchId}`)[1] || "";
  const parts = after.split("/").filter(Boolean);
  if (!parts.length) return { page: "batch", rowKey: null };
  const [first, second] = parts;
  // one person's own screen. The row key is the same shape the marks use, so a
  // face lands on that person's card on the list somebody else is reading.
  if (first === "person" && second) return { page: "person", rowKey: `person-${second}` };
  return { page: first, rowKey: null };
}

export default function BatchPresence({ batchId, children }) {
  const pathname = usePathname();
  const { page, rowKey } = readPath(pathname, batchId);
  return (
    <PresenceProvider batchId={batchId} page={page} rowKey={rowKey}>
      {children}
    </PresenceProvider>
  );
}
