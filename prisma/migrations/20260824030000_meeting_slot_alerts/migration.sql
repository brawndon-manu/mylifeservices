-- EMAIL THE AUTHOR AS MEETING SLOTS ARE PICKED.
--
-- An option toggled on an announcement - the in-person signing weeks are the
-- case: people choose appointment slots over days, and the author finds out by
-- checking the roster. With this on, each new pick emails the author and
-- whoever posted on their behalf, through the same off-production guard every
-- announcement email runs.
--
-- Additive: one boolean, default off, nothing existing changes.

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN "meetingSlotAlerts" BOOLEAN NOT NULL DEFAULT false;
