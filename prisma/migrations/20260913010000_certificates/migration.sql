-- additive: certificates printed from one template, and who each went to.
CREATE TABLE "CertificateBatch" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "templateUrl" TEXT NOT NULL,
    "templateName" TEXT,
    "page" INTEGER NOT NULL DEFAULT 0,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "size" DOUBLE PRECISION NOT NULL DEFAULT 28,
    "align" TEXT NOT NULL DEFAULT 'center',
    "issuedOn" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT,
    "printedName" TEXT NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CertificateBatch_createdAt_idx" ON "CertificateBatch"("createdAt");

CREATE INDEX "Certificate_batchId_idx" ON "Certificate"("batchId");

CREATE INDEX "Certificate_userId_idx" ON "Certificate"("userId");

ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CertificateBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
