-- The export set was cut from four QSP reports to three on 2026-08-06. The new
-- Simple Payroll Processing Report (.xls) carries QSP's own regular/overtime
-- figures per employee, so it has to be stored alongside the other sources.
--
-- Additive only. The clock and rest-report columns are deliberately left in
-- place, unused, because collecting them again is an open decision and dropping
-- them would need a second migration to undo.
ALTER TABLE "TimesheetBatch" ADD COLUMN "payrollUrl" TEXT;
ALTER TABLE "TimesheetBatch" ADD COLUMN "payrollName" TEXT;
