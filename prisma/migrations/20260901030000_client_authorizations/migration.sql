-- A CLIENT'S AUTHORIZED HOURS FOR ONE MONTH, 2026-08-31, from QSP's Budget
-- Capture Report - plus the reviewer's corrected billable minutes on a shift
-- decision ("when i go through every shift i can adjust how much of the time
-- is actually billable").
--
-- Additive: one new table, one nullable column.

CREATE TABLE "ClientAuthorization" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "office" TEXT,
    "caseManagerName" TEXT,
    "serviceType" TEXT NOT NULL DEFAULT '',
    "authorizedHours" DOUBLE PRECISION NOT NULL,
    "scheduledHours" DOUBLE PRECISION,
    "sourceName" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientAuthorization_monthKey_clientKey_serviceType_key" ON "ClientAuthorization"("monthKey", "clientKey", "serviceType");
CREATE INDEX "ClientAuthorization_monthKey_idx" ON "ClientAuthorization"("monthKey");
CREATE INDEX "ClientAuthorization_clientKey_idx" ON "ClientAuthorization"("clientKey");

ALTER TABLE "ClientAuthorization" ADD CONSTRAINT "ClientAuthorization_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftReview" ADD COLUMN "billableMin" INTEGER;
