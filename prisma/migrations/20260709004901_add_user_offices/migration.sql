-- AlterTable
ALTER TABLE "User" ADD COLUMN     "offices" TEXT[] DEFAULT ARRAY[]::TEXT[];
