// A BATCH KEPT FOR REHEARSAL, SAID OUT LOUD.
//
// `TimesheetBatch.testOnly` means every rule holds exactly as it does on a live
// batch - the Send all safeguard, the final and superseded refusals, the signing
// gate, the whole question set - and the ONE thing that differs is that every
// message it sends goes to a single address.
//
// WHICH IS PRECISELY WHY IT NEEDS SAYING ON SCREEN. A flag that is true only in
// the database makes a rehearsal batch and a real one look identical on the
// card, the pay period page and the send screen - so the safe one is
// indistinguishable from the one that emails sixty people, which is the wrong
// way round for a guard whose whole job is that you cannot mistake them.
//
// It carries the ADDRESS, not just the state. "TEST BATCH" tells you mail is
// redirected; it does not tell you where, and where is the thing somebody
// checking this actually wants to know.
export default function TestBatchBadge({ batch, size = "md", showAddress = true }) {
  if (!batch?.testOnly) return null;
  const to = String(batch.testEmail || "").trim();
  const sm = size === "sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-wide ${
        sm ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      } border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800/70 dark:bg-violet-950/40 dark:text-violet-300`}
      // VIOLET, and deliberately not one of the four state colours. LIVE is
      // rose, NEEDS A DECISION amber, FINAL emerald and SUPERSEDED grey - this
      // sits BESIDE whichever of those the batch is in rather than replacing it,
      // because a rehearsal batch is still live or final or superseded and the
      // reader needs both facts.
      title={to ? `Every email from this batch goes to ${to} and nowhere else.` : undefined}
    >
      Test batch
      {showAddress && to && (
        <span className="font-mono font-semibold normal-case tracking-normal opacity-80">
          {to}
        </span>
      )}
      {/* FLAGGED WITH NOWHERE TO SEND IS ITS OWN STATE, and a worse one than
          either. `batchForceTo` returns null for it, so the ordinary locks
          decide - which is the safe default, but it is not what somebody
          reading "Test batch" would assume. */}
      {!to && (
        <span className="font-semibold normal-case tracking-normal text-rose-700 dark:text-rose-400">
          no address set
        </span>
      )}
    </span>
  );
}
