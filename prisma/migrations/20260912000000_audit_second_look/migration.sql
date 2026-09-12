-- additive: a shift can carry marks that still need a person, one per subject
-- ("note", "schedule", "shift"). Supersedes AuditNoteFlag, whose empty table is
-- deliberately left in place - migrations here do not drop.
CREATE TABLE "AuditSecondLook" (
    "id" TEXT NOT NULL,
    "shiftKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "employeeKey" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reason" TEXT,
    "sourceBatchId" TEXT,
    "byId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditSecondLook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditSecondLook_shiftKey_subject_key" ON "AuditSecondLook"("shiftKey", "subject");

CREATE INDEX "AuditSecondLook_shiftKey_idx" ON "AuditSecondLook"("shiftKey");

CREATE INDEX "AuditSecondLook_employeeKey_idx" ON "AuditSecondLook"("employeeKey");

CREATE INDEX "AuditSecondLook_date_idx" ON "AuditSecondLook"("date");
