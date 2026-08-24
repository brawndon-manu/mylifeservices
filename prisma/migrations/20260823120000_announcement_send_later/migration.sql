-- SEND LATER FOR ANNOUNCEMENTS.
--
-- Mánu 2026-08-23: "a new setting for send later that automtically sends at
-- the time we need it to be sent." Kristy's ask is the shape of it: written on
-- the weekend, sent first thing Monday morning without anybody being awake.
--
-- `publishAt` on a draft means scheduled. The meeting-jobs cron - already
-- hitting every five minutes - publishes it once the clock passes, through the
-- same code the Publish button runs, so a scheduled post cannot behave
-- differently from a hand-published one. Precision is the cron's: "8:00 AM"
-- lands between 8:00 and 8:05.
--
-- `publishEmail` holds the author's email choice from the schedule dialog
-- ({ doEmail, everyone, titles, userIds }) until the send. Both nullable and
-- additive: every existing row keeps null and nothing already posted changes.
ALTER TABLE "Announcement"
  ADD COLUMN "publishAt" TIMESTAMP(3),
  ADD COLUMN "publishEmail" JSONB;
