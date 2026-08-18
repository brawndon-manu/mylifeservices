-- AlterTable
ALTER TABLE "DayProgramBatch" ADD COLUMN     "restsByDate" JSONB,
ADD COLUMN     "restsName" TEXT,
ADD COLUMN     "restsUrl" TEXT,
ADD COLUMN     "timesheetName" TEXT,
ADD COLUMN     "timesheetUrl" TEXT;
