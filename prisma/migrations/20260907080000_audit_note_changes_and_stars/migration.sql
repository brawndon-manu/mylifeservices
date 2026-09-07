-- additive: the new-notes ledger and stars on superseded audit copies
CREATE TABLE "AuditNoteChange" (
    "id" TEXT NOT NULL,
    "shiftKey" TEXT NOT NULL,
    "employeeKey" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "whoLegal" TEXT,
    "date" TEXT NOT NULL,
    "client" TEXT,
    "billedMin" INTEGER,
    "clockedMin" INTEGER,
    "decision" TEXT,
    "seenAt" TIMESTAMP(3),
    "seenById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditNoteChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditShiftStar" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "shiftKey" TEXT NOT NULL,
    "byId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditShiftStar_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditNoteChange_seenAt_idx" ON "AuditNoteChange"("seenAt");

CREATE INDEX "AuditNoteChange_shiftKey_idx" ON "AuditNoteChange"("shiftKey");

CREATE UNIQUE INDEX "AuditShiftStar_batchId_shiftKey_key" ON "AuditShiftStar"("batchId", "shiftKey");

CREATE INDEX "AuditShiftStar_batchId_idx" ON "AuditShiftStar"("batchId");

ALTER TABLE "AuditNoteChange" ADD CONSTRAINT "AuditNoteChange_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TimesheetBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditShiftStar" ADD CONSTRAINT "AuditShiftStar_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TimesheetBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
