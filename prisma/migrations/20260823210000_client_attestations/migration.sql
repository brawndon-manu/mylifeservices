-- CLIENT ATTESTATIONS.
--
-- Once a month HR pulls the client schedule out of QSP and has supervisors sit
-- with each client to confirm three things: they were provided their schedule,
-- they want to continue with their current staff, and staff have been showing
-- up as scheduled. It has been a manual round of emails; this is the portal
-- doing it.
--
-- The upload is QSP's Client Schedules export - one page per client, 252 of
-- them for August 2026 - and each page becomes one form somebody signs.
--
-- `User.supervisorId` is the mapping Mánu described on 2026-08-23: field
-- supervisors assigned per STAFF rather than per client, replacing the current
-- per-client arrangement. It ships EMPTY and is filled in by hand. Nothing
-- depends on it being set - an attestation with no supervisor is one nobody has
-- been assigned yet, and the review screen says exactly that.
--
-- Entirely additive: two new tables and one nullable column. Nothing existing
-- changes shape, so this can go out before the app does.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "supervisorId" TEXT;

-- CreateTable
CREATE TABLE "ClientAttestationBatch" (
    "id" TEXT NOT NULL,
    "monthLabel" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "testMode" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAttestationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAttestation" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "sourcePage" INTEGER NOT NULL,
    "staffNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduledHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "caseWorker" TEXT,
    "clientEmail" TEXT,
    "office" TEXT,
    "staffUserId" TEXT,
    "supervisorUserId" TEXT,
    "matchMethod" TEXT NOT NULL DEFAULT 'unmatched',
    "formUrl" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentToEmail" TEXT,
    "intendedEmail" TEXT,
    "dueAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signedPdfUrl" TEXT,
    "signedName" TEXT,
    "signedIp" TEXT,
    "signedVia" TEXT,
    "filedById" TEXT,
    "filedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientAttestationBatch_createdAt_idx" ON "ClientAttestationBatch"("createdAt");

-- CreateIndex
CREATE INDEX "ClientAttestation_batchId_idx" ON "ClientAttestation"("batchId");

-- CreateIndex
CREATE INDEX "ClientAttestation_clientKey_idx" ON "ClientAttestation"("clientKey");

-- CreateIndex
CREATE INDEX "ClientAttestation_supervisorUserId_idx" ON "ClientAttestation"("supervisorUserId");

-- CreateIndex
CREATE INDEX "ClientAttestation_signedAt_idx" ON "ClientAttestation"("signedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAttestationBatch" ADD CONSTRAINT "ClientAttestationBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAttestation" ADD CONSTRAINT "ClientAttestation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ClientAttestationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAttestation" ADD CONSTRAINT "ClientAttestation_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAttestation" ADD CONSTRAINT "ClientAttestation_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
