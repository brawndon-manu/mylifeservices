-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "meetingAt" TIMESTAMP(3),
ADD COLUMN     "meetingDurationFromMin" INTEGER,
ADD COLUMN     "meetingDurationToMin" INTEGER,
ADD COLUMN     "meetingTimezone" TEXT;
