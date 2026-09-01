-- THE DAY-PROGRAM REVIEW ASKS ABOUT PTO AND SICK TIME, 2026-09-01. The staff
-- answer rides the timesheet review as a claim ("timeOff" on the correction
-- row); the record itself stays PtoEntry, which now says which of the two a
-- day was ("kind").
--
-- Additive: two nullable-or-defaulted columns, nothing dropped.

ALTER TABLE "PtoEntry" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'pto';
ALTER TABLE "TimesheetCorrection" ADD COLUMN "timeOff" JSONB;
