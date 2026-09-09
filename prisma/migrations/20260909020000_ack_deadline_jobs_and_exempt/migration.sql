-- ADDITIVE ONLY (shared dev + prod database).
-- Per-announcement ack exemption + one-shot stamps for the deadline cron jobs,
-- and the missed-deadline notification type.
ALTER TABLE "Announcement" ADD COLUMN "ackExemptUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Announcement" ADD COLUMN "ackReminderSentAt" TIMESTAMP(3);
ALTER TABLE "Announcement" ADD COLUMN "deadlineNoticedAt" TIMESTAMP(3);
ALTER TYPE "NotificationType" ADD VALUE 'ACK_DEADLINE_MISSED';
