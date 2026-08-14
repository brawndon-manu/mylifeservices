-- SOMEBODY HAS SAID THIS UPLOAD IS FINAL AND THE SCHEDULE IS LOCKED.
--
-- The schedule locks around 8pm on the last day of the period, and nothing in
-- any of the four exports records that it happened. The portal can detect the
-- precondition - the data reaching the last day of the period - but not the
-- fact, so the fact is attested by a person and stored here.
--
-- Additive and nullable. Every existing batch reads as not attested, which is
-- the truthful answer for all four of them.

-- AlterTable
ALTER TABLE "TimesheetBatch" ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedById" TEXT,
ADD COLUMN     "lockedByName" TEXT;
