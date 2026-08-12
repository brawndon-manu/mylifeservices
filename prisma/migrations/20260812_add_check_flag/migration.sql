-- A red mark somebody put on a data-checks row, and whose avatar shows on it.
--
-- Scalars only: the marker records who flagged it AT THE TIME, so it must not
-- follow a later rename or avatar change, and it should survive the user being
-- deleted rather than cascading away. See the model comment for the rest.
CREATE TABLE "TimesheetCheckFlag" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "flaggedById" TEXT NOT NULL,
    "flaggedName" TEXT,
    "flaggedImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimesheetCheckFlag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TimesheetCheckFlag_batchId_rowKey_key" ON "TimesheetCheckFlag"("batchId", "rowKey");
CREATE INDEX "TimesheetCheckFlag_batchId_idx" ON "TimesheetCheckFlag"("batchId");
