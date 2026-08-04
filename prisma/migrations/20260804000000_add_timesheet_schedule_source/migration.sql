-- store the Employee Schedules PDF alongside the timesheet export.
--
-- additive only: two nullable columns on an existing table, no data touched, no
-- index, no constraint. every existing batch keeps working and simply reports
-- that it has no stored schedule.
ALTER TABLE "TimesheetBatch" ADD COLUMN "scheduleUrl" TEXT;
ALTER TABLE "TimesheetBatch" ADD COLUMN "scheduleName" TEXT;
