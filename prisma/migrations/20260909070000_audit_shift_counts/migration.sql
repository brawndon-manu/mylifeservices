-- additive: the audit copy's shift count and its count of shifts that
-- appeared on days an earlier copy already covered
ALTER TABLE "TimesheetBatch" ADD COLUMN "auditShiftCount" INTEGER;
ALTER TABLE "TimesheetBatch" ADD COLUMN "auditNewCount" INTEGER;
