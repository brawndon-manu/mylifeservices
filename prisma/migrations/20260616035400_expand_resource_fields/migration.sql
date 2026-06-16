/*
  Warnings:

  - You are about to drop the column `availability` on the `Resource` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ResourceOpStatus" AS ENUM ('ACTIVE', 'TEMPORARILY_UNAVAILABLE', 'NEEDS_VERIFICATION', 'CLOSED');

-- AlterTable
ALTER TABLE "Resource" DROP COLUMN "availability",
ADD COLUMN     "appointmentLink" TEXT,
ADD COLUMN     "appointmentRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contactInstructions" TEXT,
ADD COLUMN     "details" JSONB,
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "operationalStatus" "ResourceOpStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "orgName" TEXT,
ADD COLUMN     "schedule" JSONB,
ADD COLUMN     "serviceArea" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "subtype" TEXT,
ADD COLUMN     "verifiedById" TEXT,
ADD COLUMN     "whoItServes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "zip" TEXT;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
