-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "ackEveryone" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ackTitles" TEXT[] DEFAULT ARRAY[]::TEXT[];
