-- additive: a note can be flagged for review on its own, apart from the
-- billing decision on its shift. Creates one table, touches nothing existing.
CREATE TABLE "AuditNoteFlag" (
    "id" TEXT NOT NULL,
    "shiftKey" TEXT NOT NULL,
    "employeeKey" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reason" TEXT,
    "sourceBatchId" TEXT,
    "byId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditNoteFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditNoteFlag_shiftKey_key" ON "AuditNoteFlag"("shiftKey");

CREATE INDEX "AuditNoteFlag_employeeKey_idx" ON "AuditNoteFlag"("employeeKey");

CREATE INDEX "AuditNoteFlag_date_idx" ON "AuditNoteFlag"("date");
