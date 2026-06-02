-- device access is now role-based (view = oversight tier, edit = admin+),
-- so the per-user deviceManager flag is no longer needed.
ALTER TABLE "User" DROP COLUMN "deviceManager";
