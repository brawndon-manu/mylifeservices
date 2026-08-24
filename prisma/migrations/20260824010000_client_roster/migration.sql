-- THE CLIENT ROSTER: WHICH STAFF HAVE WHICH CLIENTS.
--
-- One row per client, imported from HR's roster spreadsheet. The staff half of
-- the Field Supervisor > Staff > Clients hierarchy is this table; the
-- supervisor half is User.supervisorId from the previous migration.
--
-- No email column - client emails are not stored, per Mánu 2026-08-24. A send
-- to a client is a typed address every time until that decision changes.
--
-- ClientAttestation.sentToKind records WHICH KIND of recipient a send went to
-- (supervisor | staff | client | other): the address alone doesn't say, and a
-- supervisor and a typed address look identical a month later.
--
-- Deliberately does NOT touch PtoEntry."from"/"to". Those are applied in
-- production from the unmerged offline-signoff branch, and a schema diff taken
-- from main wants to drop them. They are not ours to drop.

-- AlterTable
ALTER TABLE "ClientAttestation" ADD COLUMN     "sentToKind" TEXT;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "office" TEXT,
    "status" TEXT,
    "caseWorkerName" TEXT,
    "staffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_clientKey_key" ON "Client"("clientKey");

-- CreateIndex
CREATE INDEX "Client_staffUserId_idx" ON "Client"("staffUserId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
