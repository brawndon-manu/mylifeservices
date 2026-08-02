-- CreateTable
CREATE TABLE "TimesheetBatch" (
    "id" TEXT NOT NULL,
    "periodFrom" TEXT NOT NULL,
    "periodTo" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "testMode" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timesheet" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "userId" TEXT,
    "matchMethod" TEXT NOT NULL DEFAULT 'unmatched',
    "rawHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "regularHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "doubleHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "premiumHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "partialWeek" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "pdfUrl" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentToEmail" TEXT,
    "intendedEmail" TEXT,
    "dueAt" TIMESTAMP(3),
    "message" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedPdfUrl" TEXT,
    "signedName" TEXT,
    "signedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimesheetBatch_createdAt_idx" ON "TimesheetBatch"("createdAt");

-- CreateIndex
CREATE INDEX "Timesheet_batchId_idx" ON "Timesheet"("batchId");

-- CreateIndex
CREATE INDEX "Timesheet_userId_idx" ON "Timesheet"("userId");

-- CreateIndex
CREATE INDEX "Timesheet_signedAt_idx" ON "Timesheet"("signedAt");

-- AddForeignKey
ALTER TABLE "TimesheetBatch" ADD CONSTRAINT "TimesheetBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TimesheetBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
