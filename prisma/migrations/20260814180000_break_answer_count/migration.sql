-- HOW MANY OF THEM THEY ACTUALLY TOOK.
--
-- A meal is one thing: taken or not. A rest violation is "0 of 2 recorded", and
-- the honest answers span the range - they may have taken neither, or one of the
-- two. Two buttons could not say that, so the answer carries a count and the
-- control offers every possibility the day allows.
--
-- Nullable: a meal answer has nothing to count, and the rows written before this
-- existed had no count to record. Zero rows exist either way.
ALTER TABLE "TimesheetBreakAnswer" ADD COLUMN "takenCount" INTEGER,
ADD COLUMN "missingCount" INTEGER;
