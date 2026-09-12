-- additive: routing a person set by hand, for clients the roster could not
-- match. Keyed by clientKey because uploadClientRoster deletes and recreates
-- the Client table from each new export, so anything stored on Client is lost.
CREATE TABLE "ClientRouting" (
    "clientKey" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "staffUserId" TEXT,
    "supervisorUserId" TEXT,
    "setById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientRouting_pkey" PRIMARY KEY ("clientKey")
);

CREATE INDEX "ClientRouting_staffUserId_idx" ON "ClientRouting"("staffUserId");

CREATE INDEX "ClientRouting_supervisorUserId_idx" ON "ClientRouting"("supervisorUserId");

ALTER TABLE "ClientRouting" ADD CONSTRAINT "ClientRouting_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientRouting" ADD CONSTRAINT "ClientRouting_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
