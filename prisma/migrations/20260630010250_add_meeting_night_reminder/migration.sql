/*
  Warnings:

  - The primary key for the `AnnouncementMeetingReminder` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "meetingNightBefore" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "AnnouncementMeetingReminder" DROP CONSTRAINT "AnnouncementMeetingReminder_pkey",
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'soon',
ADD CONSTRAINT "AnnouncementMeetingReminder_pkey" PRIMARY KEY ("announcementId", "optionId", "kind");
