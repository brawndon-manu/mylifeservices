-- the emailed client link gets its own code, apart from the one on the staff
-- member's screen, so a fresh code there never kills it and it can live 7
-- days. additive: two nullable columns and a unique index; nothing already
-- deployed reads them.
-- AlterTable
ALTER TABLE "ClockAmendment" ADD COLUMN     "clientEmailCode" TEXT,
ADD COLUMN     "clientEmailCodeExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "ClockAmendment_clientEmailCode_key" ON "ClockAmendment"("clientEmailCode");
