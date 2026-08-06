-- store the QSP Rest Periods Report alongside the timesheet.
--
-- additive only: two nullable columns on an existing table, no data touched, no
-- index, no constraint. batches uploaded before this keep working and simply
-- fall back to inferring rest breaks from gaps between punches.
ALTER TABLE "TimesheetBatch" ADD COLUMN "restsUrl" TEXT;
ALTER TABLE "TimesheetBatch" ADD COLUMN "restsName" TEXT;
