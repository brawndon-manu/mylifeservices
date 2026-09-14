-- additive: a date per person, and an optional place to print it.
ALTER TABLE "Certificate" ADD COLUMN "issuedOn" TEXT;

ALTER TABLE "CertificateBatch" ADD COLUMN "datePage" INTEGER;
ALTER TABLE "CertificateBatch" ADD COLUMN "dateX" DOUBLE PRECISION;
ALTER TABLE "CertificateBatch" ADD COLUMN "dateY" DOUBLE PRECISION;
ALTER TABLE "CertificateBatch" ADD COLUMN "dateSize" DOUBLE PRECISION DEFAULT 14;
ALTER TABLE "CertificateBatch" ADD COLUMN "dateAlign" TEXT DEFAULT 'center';
