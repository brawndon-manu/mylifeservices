-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "ackUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
