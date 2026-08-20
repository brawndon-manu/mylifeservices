-- Post-meeting attestation. All columns nullable and additive: code that does
-- not know about them keeps working, so this can go out before the app does.
--
-- Deliberately does NOT touch PtoEntry."from"/"to". Those came from
-- 20260819010000_pto_span, which is applied in production but still lives on the
-- unmerged offline-signoff branch, so a schema diff taken from main wants to
-- drop them. They are not ours to drop.

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "meetingAttestationBody" TEXT,
ADD COLUMN     "meetingAttestationFormId" TEXT,
ADD COLUMN     "meetingAttestationSentAt" TIMESTAMP(3),
ADD COLUMN     "meetingAttestationSubject" TEXT,
ADD COLUMN     "meetingConcludedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_meetingAttestationFormId_fkey" FOREIGN KEY ("meetingAttestationFormId") REFERENCES "Form"("id") ON DELETE SET NULL ON UPDATE CASCADE;
