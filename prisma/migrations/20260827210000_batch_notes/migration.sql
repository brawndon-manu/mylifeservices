-- ALL EIGHT EXPORTS ARRIVE ON THE TIMESHEETS PAGE, 2026-08-27.
--
-- Mánu: "i want to be able to upload all of this info just to the timesheets
-- page. and the audit card and more to come can just get it from that info ...
-- i also want to do it by timesheet pay period."
--
-- Three documents join the five the batch already carries. All three optional,
-- like the clock export, so a period still uploads when one is not ready.
--
-- The parsed service notes go in a table of their own rather than a column
-- here: a fortnight of them is about a megabyte, and Repeat patterns loads
-- every batch there has ever been.
--
-- Additive: six nullable columns and one new table. Nothing existing changes,
-- and ServiceNoteBatch is left alone until 08/01-08/15 is re-uploaded.

ALTER TABLE "TimesheetBatch" ADD COLUMN "notesUrl" TEXT;
ALTER TABLE "TimesheetBatch" ADD COLUMN "notesName" TEXT;
ALTER TABLE "TimesheetBatch" ADD COLUMN "serviceNotesUrl" TEXT;
ALTER TABLE "TimesheetBatch" ADD COLUMN "serviceNotesName" TEXT;
ALTER TABLE "TimesheetBatch" ADD COLUMN "scheduleNotesUrl" TEXT;
ALTER TABLE "TimesheetBatch" ADD COLUMN "scheduleNotesName" TEXT;

CREATE TABLE "BatchServiceNotes" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "notes" JSONB NOT NULL,
    "noteCount" INTEGER NOT NULL DEFAULT 0,
    "pdfCount" INTEGER NOT NULL DEFAULT 0,
    "serviceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchServiceNotes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BatchServiceNotes_batchId_key" ON "BatchServiceNotes"("batchId");

ALTER TABLE "BatchServiceNotes" ADD CONSTRAINT "BatchServiceNotes_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "TimesheetBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
