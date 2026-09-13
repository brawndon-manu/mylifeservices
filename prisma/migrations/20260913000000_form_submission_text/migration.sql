-- additive: what the person wrote, for submissions that are words rather than a
-- filled form. Nullable, so every existing row is untouched and still valid.
ALTER TABLE "FormSubmission" ADD COLUMN "submittedText" TEXT;
