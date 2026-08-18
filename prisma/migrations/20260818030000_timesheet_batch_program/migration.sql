-- AlterTable
ALTER TABLE "TimesheetBatch" ADD COLUMN     "dpAudit" JSONB,
ADD COLUMN     "program" TEXT NOT NULL DEFAULT 'MLS';
