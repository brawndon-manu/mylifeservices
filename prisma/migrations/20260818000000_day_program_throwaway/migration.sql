-- CreateTable
CREATE TABLE "DayProgramBatch" (
    "id" TEXT NOT NULL,
    "periodFrom" TEXT NOT NULL,
    "periodTo" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "faults" JSONB,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayProgramBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayProgramSheet" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "userId" TEXT,
    "matchMethod" TEXT NOT NULL DEFAULT 'unmatched',
    "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "faultCount" INTEGER NOT NULL DEFAULT 0,
    "days" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sentToEmail" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedPdfUrl" TEXT,
    "signedName" TEXT,
    "signedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayProgramSheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DayProgramBatch_createdAt_idx" ON "DayProgramBatch"("createdAt");

-- CreateIndex
CREATE INDEX "DayProgramSheet_batchId_idx" ON "DayProgramSheet"("batchId");

-- CreateIndex
CREATE INDEX "DayProgramSheet_userId_idx" ON "DayProgramSheet"("userId");

-- AddForeignKey
ALTER TABLE "DayProgramBatch" ADD CONSTRAINT "DayProgramBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayProgramSheet" ADD CONSTRAINT "DayProgramSheet_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DayProgramBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayProgramSheet" ADD CONSTRAINT "DayProgramSheet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
