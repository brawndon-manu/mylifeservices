-- AlterTable
ALTER TABLE "Timesheet" ADD COLUMN     "disputedAt" TIMESTAMP(3),
ADD COLUMN     "overrides" JSONB,
ADD COLUMN     "recomputedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TimesheetCorrection" (
    "id" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "date" TEXT,
    "kind" TEXT NOT NULL,
    "claimedHours" DOUBLE PRECISION,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimesheetCorrection_timesheetId_idx" ON "TimesheetCorrection"("timesheetId");

-- CreateIndex
CREATE INDEX "TimesheetCorrection_status_idx" ON "TimesheetCorrection"("status");

-- CreateIndex
CREATE INDEX "TimesheetCorrection_createdAt_idx" ON "TimesheetCorrection"("createdAt");

-- CreateIndex
CREATE INDEX "Timesheet_disputedAt_idx" ON "Timesheet"("disputedAt");

-- AddForeignKey
ALTER TABLE "TimesheetCorrection" ADD CONSTRAINT "TimesheetCorrection_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetCorrection" ADD CONSTRAINT "TimesheetCorrection_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
