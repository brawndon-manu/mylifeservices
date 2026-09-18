-- CreateTable
CREATE TABLE "ClockAmendment" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "shiftDate" TEXT NOT NULL,
    "scheduledIn" TEXT,
    "scheduledOut" TEXT,
    "clockedIn" TEXT,
    "clockedOut" TEXT,
    "dsnStart" TEXT,
    "dsnEnd" TEXT,
    "dsnSummary" TEXT,
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "actualIn" TEXT,
    "actualOut" TEXT,
    "filledName" TEXT,
    "filledAt" TIMESTAMP(3),
    "filledIp" TEXT,
    "clientSigner" TEXT,
    "clientSignerKind" TEXT,
    "clientSignedAt" TIMESTAMP(3),
    "clientSignedIp" TEXT,
    "clientUnavailableReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentToEmail" TEXT,
    "intendedEmail" TEXT,
    "mailedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClockAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClockAmendment_staffId_idx" ON "ClockAmendment"("staffId");

-- CreateIndex
CREATE INDEX "ClockAmendment_recipientId_idx" ON "ClockAmendment"("recipientId");

-- CreateIndex
CREATE INDEX "ClockAmendment_approvedAt_idx" ON "ClockAmendment"("approvedAt");

-- CreateIndex
CREATE INDEX "ClockAmendment_createdAt_idx" ON "ClockAmendment"("createdAt");

-- AddForeignKey
ALTER TABLE "ClockAmendment" ADD CONSTRAINT "ClockAmendment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClockAmendment" ADD CONSTRAINT "ClockAmendment_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClockAmendment" ADD CONSTRAINT "ClockAmendment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClockAmendment" ADD CONSTRAINT "ClockAmendment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
