-- CreateTable
CREATE TABLE "TimesheetContactLog" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "via" TEXT,
    "byId" TEXT NOT NULL,
    "byName" TEXT,
    "byImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimesheetContactLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimesheetContactLog_batchId_rowKey_idx" ON "TimesheetContactLog"("batchId", "rowKey");

-- CreateIndex
CREATE INDEX "TimesheetContactLog_batchId_idx" ON "TimesheetContactLog"("batchId");
