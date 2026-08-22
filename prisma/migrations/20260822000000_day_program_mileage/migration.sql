-- WHERE THE DAY PROGRAM'S MILES COME FROM.
--
-- The agency's batches read mileage off the Simple Payroll Processing Report,
-- which carries a "Miles Driven" column beside QSP's own hour figures. The day
-- program has no payroll report at all - upload-rows.js pinned every one of its
-- sheets to `qspMiles: null` for exactly that reason - so its mileage arrives as
-- a separate export, the Employee Mileage Tracking Report, and needs somewhere
-- of its own to be recorded.
--
-- STORED, NOT JUST READ. Mánu 2026-08-22. The miles print under the totals on
-- the sheet the employee signs, and the paragraph they sign now attests to them,
-- so the document behind that figure has to stay openable. Every other source on
-- this table is kept for the same reason.
--
-- NULLABLE AND ADDITIVE. Null means no mileage report was uploaded, which is not
-- the same as nobody driving anywhere - the same distinction `hasMiles` draws on
-- the payroll side. Every existing batch keeps both columns null and no code
-- that predates them can be surprised.
--
-- DP-ONLY BY CONVENTION, like dpAudit above it: an MLS batch never writes these,
-- because its miles have a column on a report it already collects.
ALTER TABLE "TimesheetBatch"
  ADD COLUMN "dpMileageUrl" TEXT,
  ADD COLUMN "dpMileageName" TEXT;
