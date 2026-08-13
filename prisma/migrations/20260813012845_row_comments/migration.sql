-- CreateTable
CREATE TABLE "TimesheetRowComment" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "userImage" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimesheetRowComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimesheetRowComment_batchId_rowKey_idx" ON "TimesheetRowComment"("batchId", "rowKey");

-- CreateIndex
CREATE INDEX "TimesheetRowComment_batchId_idx" ON "TimesheetRowComment"("batchId");
