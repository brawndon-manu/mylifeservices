-- A BATCH THAT MAY ONLY EVER EMAIL ONE ADDRESS.
--
-- The July 07/16-07/31 period is kept as a strict rehearsal: every rule holds
-- exactly as it does on a live batch - the Send all safeguard, the final and
-- superseded refusals, the signing gate, the whole question set - and the ONE
-- thing that differs is where a message can go.
--
-- A COLUMN AND NOT A LIST OF IDS IN CODE. Every upload creates a new batch row,
-- so an id hard-coded in a source file stops meaning anything the moment that
-- period is re-uploaded - which is the same failure that stranded 70 of Gabe's
-- marks and is why `markKey` exists. A column travels with the row.
--
-- PURELY ADDITIVE, with a default, so old code reading a newer schema sees
-- nothing it does not understand and no existing row changes behaviour.
ALTER TABLE "TimesheetBatch"
  ADD COLUMN "testOnly" BOOLEAN NOT NULL DEFAULT false,
  -- where its mail is forced to. NULL on an ordinary batch and required in
  -- practice on a test one: a batch flagged for testing with nowhere to send is
  -- a batch that would fall back to the ordinary recipient, which is the exact
  -- accident the flag exists to prevent.
  ADD COLUMN "testEmail" TEXT;
