-- AlterTable
ALTER TABLE "DayProgramBatch" ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedById" TEXT,
ADD COLUMN     "lockedByName" TEXT,
ADD COLUMN     "testMode" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "DayProgramSheet" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "approvedPdfUrl" TEXT,
ADD COLUMN     "disputedAt" TIMESTAMP(3),
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "intendedEmail" TEXT,
ADD COLUMN     "message" TEXT;
