-- THE SERVICE NOTES AUDIT, 2026-08-26.
--
-- The Employee Detailed Daily Service Notes export is one note per shift,
-- written by the person who worked it. It carries its own shift times, and
-- those are the clock times, so a period holds three records of one shift:
-- what the roster billed, what the clock recorded, and what the note documents.
--
-- Additive: one new table, nothing existing changes. The parsed notes are held
-- as jsonb because re-reading the PDF costs 2.6 seconds, too slow for a page
-- view; nothing else in the app loads this table, so no unrelated query pays
-- for the size.

-- CreateTable
CREATE TABLE "ServiceNoteBatch" (
    "id" TEXT NOT NULL,
    "periodFrom" TEXT NOT NULL,
    "periodTo" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "notes" JSONB NOT NULL,
    "noteCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceNoteBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceNoteBatch_createdAt_idx" ON "ServiceNoteBatch"("createdAt");

-- AddForeignKey
ALTER TABLE "ServiceNoteBatch" ADD CONSTRAINT "ServiceNoteBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
