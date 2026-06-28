-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "meetingAddress" TEXT,
ADD COLUMN     "meetingFormat" TEXT,
ADD COLUMN     "meetingKind" TEXT,
ADD COLUMN     "meetingMandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meetingMultiPick" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meetingOptions" JSONB,
ADD COLUMN     "zoomCode" TEXT,
ADD COLUMN     "zoomLink" TEXT;

-- CreateTable
CREATE TABLE "AnnouncementMeetingChoice" (
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementMeetingChoice_pkey" PRIMARY KEY ("announcementId","userId","optionId")
);

-- AddForeignKey
ALTER TABLE "AnnouncementMeetingChoice" ADD CONSTRAINT "AnnouncementMeetingChoice_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementMeetingChoice" ADD CONSTRAINT "AnnouncementMeetingChoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
