-- AlterTable
ALTER TABLE "ClockAmendment" ADD COLUMN     "clientCode" TEXT,
ADD COLUMN     "clientCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "clientLinkEmail" TEXT,
ADD COLUMN     "clientLinkEmailedAt" TIMESTAMP(3),
ADD COLUMN     "clientSignedDevice" TEXT,
ADD COLUMN     "clientSignedUa" TEXT,
ADD COLUMN     "clientSignedVia" TEXT,
ADD COLUMN     "filledDevice" TEXT,
ADD COLUMN     "filledUa" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ClockAmendment_clientCode_key" ON "ClockAmendment"("clientCode");
