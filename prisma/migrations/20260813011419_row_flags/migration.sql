-- CreateTable
CREATE TABLE "TimesheetRowFlag" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "userImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimesheetRowFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimesheetRowFlag_batchId_rowKey_idx" ON "TimesheetRowFlag"("batchId", "rowKey");

-- CreateIndex
CREATE INDEX "TimesheetRowFlag_batchId_idx" ON "TimesheetRowFlag"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetRowFlag_batchId_rowKey_userId_key" ON "TimesheetRowFlag"("batchId", "rowKey", "userId");
