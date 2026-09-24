-- who a form about a person served was emailed to (the email carries a link, and
-- the link opens for these people), and the note that stays with it instead of
-- going in the email. additive: empty on every submission that exists today.
ALTER TABLE "FormSubmission" ADD COLUMN "sentTo" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "FormSubmission" ADD COLUMN "note" TEXT;
