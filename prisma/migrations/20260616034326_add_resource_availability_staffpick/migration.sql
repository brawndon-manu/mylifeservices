-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "availability" TEXT,
ADD COLUMN     "staffPick" BOOLEAN NOT NULL DEFAULT false;
