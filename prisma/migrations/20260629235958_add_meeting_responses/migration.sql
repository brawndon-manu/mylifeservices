-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "meetingResponseDueAt" TIMESTAMP(3),
ADD COLUMN     "meetingResponseDueTz" TEXT;

-- CreateTable
CREATE TABLE "AnnouncementMeetingResponse" (
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cantMakeIt" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnouncementMeetingResponse_pkey" PRIMARY KEY ("announcementId","userId")
);

-- AddForeignKey
ALTER TABLE "AnnouncementMeetingResponse" ADD CONSTRAINT "AnnouncementMeetingResponse_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementMeetingResponse" ADD CONSTRAINT "AnnouncementMeetingResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
