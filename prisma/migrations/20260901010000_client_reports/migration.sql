-- A REPORT FILLED OUT ABOUT ONE CLIENT, 2026-08-31. One table for every report
-- kind to come; the first is "annual-satisfaction". Keyed by clientKey rather
-- than Client.id because the roster import replaces the Client table wholesale
-- and a filled survey must outlive every re-import.
--
-- Additive: one new table, nothing existing changes.

CREATE TABLE "ClientReport" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "conductedById" TEXT NOT NULL,
    "conductedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientReport_clientKey_idx" ON "ClientReport"("clientKey");
CREATE INDEX "ClientReport_kind_createdAt_idx" ON "ClientReport"("kind", "createdAt");

ALTER TABLE "ClientReport" ADD CONSTRAINT "ClientReport_conductedById_fkey" FOREIGN KEY ("conductedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
