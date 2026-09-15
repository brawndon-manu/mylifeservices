-- what a meeting actually covered, one topic per entry. additive, defaulting
-- to the empty list every existing announcement already behaves as.
ALTER TABLE "Announcement" ADD COLUMN "meetingTopics" TEXT[] DEFAULT ARRAY[]::TEXT[];
