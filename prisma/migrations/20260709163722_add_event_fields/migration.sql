-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "eventAddress" TEXT,
ADD COLUMN     "eventAt" TIMESTAMP(3),
ADD COLUMN     "eventAudience" TEXT,
ADD COLUMN     "eventEndAt" TIMESTAMP(3),
ADD COLUMN     "eventLocationName" TEXT,
ADD COLUMN     "eventTimezone" TEXT;

-- CreateTable
CREATE TABLE "AnnouncementEventRsvp" (
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "going" BOOLEAN NOT NULL DEFAULT true,
    "clientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnouncementEventRsvp_pkey" PRIMARY KEY ("announcementId","userId")
);

-- AddForeignKey
ALTER TABLE "AnnouncementEventRsvp" ADD CONSTRAINT "AnnouncementEventRsvp_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementEventRsvp" ADD CONSTRAINT "AnnouncementEventRsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
