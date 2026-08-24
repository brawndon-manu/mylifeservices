-- THE CLIENT'S HALF OF THE SIGNATURE, when it happens before the supervisor's.
--
-- A link sent to the client (or the staff member sitting with them) fills only
-- the client's fields; the partly-signed PDF lands in clientSignedPdfUrl and
-- goes on to the field supervisor, whose link carries the whole form. The
-- finished copy still lands in signedPdfUrl like every other one.
--
-- Additive only.

-- AlterTable
ALTER TABLE "ClientAttestation"
  ADD COLUMN "clientSignedAt" TIMESTAMP(3),
  ADD COLUMN "clientSignedPdfUrl" TEXT,
  ADD COLUMN "clientSignedIp" TEXT,
  ADD COLUMN "clientSignedVia" TEXT;
