-- additive: batches made in one go share a run, so all of them can be
-- downloaded together without merging them into one record.
ALTER TABLE "CertificateBatch" ADD COLUMN "runId" TEXT;

CREATE INDEX "CertificateBatch_runId_idx" ON "CertificateBatch"("runId");
