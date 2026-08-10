-- Documents attached to an announcement: [{ name, url, formId?, bytes? }].
--
-- Additive and nullable, so every existing post keeps working untouched and
-- nothing is backfilled. An entry carrying a formId points at the forms library
-- (stored once, still browsable there); one without was uploaded onto the post.
ALTER TABLE "Announcement" ADD COLUMN "attachments" JSONB;
