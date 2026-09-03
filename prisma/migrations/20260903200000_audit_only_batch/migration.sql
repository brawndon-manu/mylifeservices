-- Additive only: the audit lane. A batch flagged auditOnly feeds the Audit
-- page and nothing else - it never supersedes a payroll batch and nothing
-- sends or signs from it.
ALTER TABLE "TimesheetBatch" ADD COLUMN "auditOnly" BOOLEAN NOT NULL DEFAULT false;
