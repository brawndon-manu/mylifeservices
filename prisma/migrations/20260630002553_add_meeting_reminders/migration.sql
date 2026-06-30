-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "meetingAuthorNudgeSentAt" TIMESTAMP(3),
ADD COLUMN     "meetingReminderLeadMin" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "meetingResponseNoticeSentAt" TIMESTAMP(3),
ADD COLUMN     "zoomLinkTbd" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AnnouncementMeetingReminder" (
    "announcementId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementMeetingReminder_pkey" PRIMARY KEY ("announcementId","optionId")
);

-- AddForeignKey
ALTER TABLE "AnnouncementMeetingReminder" ADD CONSTRAINT "AnnouncementMeetingReminder_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
