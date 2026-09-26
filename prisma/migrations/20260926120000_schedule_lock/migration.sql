-- the schedule lock: the upload that locks a month's worked days, the uploads
-- checked against it, and every change they found. additive: no existing table
-- changes, and nothing already deployed reads these.
-- CreateTable
CREATE TABLE "ScheduleLockUpload" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "lockId" TEXT,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "summary" JSONB,
    "presentIds" JSONB,
    "goneIds" JSONB,
    "uploadedById" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleLockUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleLockChange" (
    "id" TEXT NOT NULL,
    "lockId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "employee" TEXT,
    "date" TEXT,
    "lastDate" TEXT,
    "before" JSONB,
    "after" JSONB,
    "evidence" JSONB,
    "matchesClock" BOOLEAN NOT NULL DEFAULT false,
    "awayFromClock" BOOLEAN NOT NULL DEFAULT false,
    "firstUploadId" TEXT NOT NULL,
    "lastUploadId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "decision" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleLockChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleLockUpload_monthKey_createdAt_idx" ON "ScheduleLockUpload"("monthKey", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleLockChange_lockId_decision_idx" ON "ScheduleLockChange"("lockId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleLockChange_lockId_key_key" ON "ScheduleLockChange"("lockId", "key");

-- AddForeignKey
ALTER TABLE "ScheduleLockUpload" ADD CONSTRAINT "ScheduleLockUpload_lockId_fkey" FOREIGN KEY ("lockId") REFERENCES "ScheduleLockUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleLockChange" ADD CONSTRAINT "ScheduleLockChange_lockId_fkey" FOREIGN KEY ("lockId") REFERENCES "ScheduleLockUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

