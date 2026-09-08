-- additive: how many of the copy's shifts sit on days no earlier copy collected
ALTER TABLE "TimesheetBatch" ADD COLUMN "auditFreshCount" INTEGER;
