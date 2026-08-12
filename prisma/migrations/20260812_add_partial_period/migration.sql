-- A pay period uploaded before it ended, with the days that had not happened yet
-- dropped from the export.
--
-- QSP prints scheduled shifts exactly like worked ones, so the upload refuses a
-- file holding future days. That refusal is right for payroll and wrong for
-- testing an August period during August, so the partial upload keeps what has
-- happened and records here that it did.
--
-- Recorded for the same reason testMode is: this batch's hours are a partial
-- record and its last workweek is cut off mid-week, and nothing else on the row
-- would say so afterwards.
--
-- Additive with defaults: every existing batch reads as a normal, complete one.
ALTER TABLE "TimesheetBatch" ADD COLUMN "partialPeriod" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TimesheetBatch" ADD COLUMN "partialThrough" TEXT;
