-- additive: a flag can say what it is about. Chosen kinds only ("note",
-- "schedule", "shift"); a changed billing time is derived from billableMin,
-- so the flags that already changed one need no backfill.
ALTER TABLE "ShiftReview" ADD COLUMN "kinds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
