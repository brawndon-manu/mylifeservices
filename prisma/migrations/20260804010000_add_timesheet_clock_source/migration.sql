-- store the QSClock Time and Attendance export alongside the timesheet.
--
-- additive only: two nullable columns on an existing table, no data touched, no
-- index, no constraint. batches uploaded before this keep working and simply
-- report that they have no clock evidence.
ALTER TABLE "TimesheetBatch" ADD COLUMN "clockUrl" TEXT;
ALTER TABLE "TimesheetBatch" ADD COLUMN "clockName" TEXT;
