-- additive: the clock window a corrected billable figure was typed as
ALTER TABLE "ShiftReview" ADD COLUMN "billableFromMin" INTEGER;
ALTER TABLE "ShiftReview" ADD COLUMN "billableToMin" INTEGER;
