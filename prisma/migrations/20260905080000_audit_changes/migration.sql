-- additive: what moved since the previous audit copy of the same month
ALTER TABLE "TimesheetBatch" ADD COLUMN "auditChanges" JSONB;
