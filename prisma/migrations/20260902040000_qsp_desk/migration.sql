-- THE QUICKSOLVE CORRECTIONS DESK, 2026-09-02: each signed review's entries
-- can be marked as added in QuickSolve one by one, and the review signed off
-- once every entry is marked. A mark is keyed by the correction row and the
-- entry's own fact sentence; the sign-off lives on the timesheet as a record
-- of who attested the whole review was keyed in.
--
-- Additive: one new table, three nullable columns.

CREATE TABLE "QspEntryMark" (
    "id" TEXT NOT NULL,
    "correctionId" TEXT NOT NULL,
    "fact" TEXT NOT NULL,
    "byId" TEXT,
    "byName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QspEntryMark_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QspEntryMark_correctionId_fact_key" ON "QspEntryMark"("correctionId", "fact");

ALTER TABLE "QspEntryMark" ADD CONSTRAINT "QspEntryMark_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "TimesheetCorrection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Timesheet" ADD COLUMN "qspSignedOffAt" TIMESTAMP(3);
ALTER TABLE "Timesheet" ADD COLUMN "qspSignedOffById" TEXT;
ALTER TABLE "Timesheet" ADD COLUMN "qspSignedOffByName" TEXT;
