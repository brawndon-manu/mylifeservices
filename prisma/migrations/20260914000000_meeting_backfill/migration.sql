-- meetings that ran before the portal held them. additive only: both columns
-- default to what every existing announcement already is, so nothing changes
-- for any row that is already there.
ALTER TABLE "Announcement" ADD COLUMN "meetingBackfilled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Announcement" ADD COLUMN "meetingRecordSource" TEXT;
