-- additive: what a certificate's name is printed in. Both carry the values
-- that were hardcoded in the renderer until now, so every batch already made
-- keeps printing exactly as it did.
ALTER TABLE "CertificateBatch" ADD COLUMN "face" TEXT NOT NULL DEFAULT 'helvetica-bold';
ALTER TABLE "CertificateBatch" ADD COLUMN "color" TEXT NOT NULL DEFAULT '#0f172a';
