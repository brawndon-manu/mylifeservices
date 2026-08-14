-- A MARK HAS TO OUTLIVE THE UPLOAD IT WAS MADE ON.
--
-- Every upload creates a new batch row and new timesheet rows, and a mark is
-- keyed on both - batchId directly, and a timesheet id inside rowKey. So a mark
-- is orphaned twice over the next morning. 70 of them already were, when the
-- 08/01-08/12 export landed on top of the 08/01-08/09 one and every one of the
-- 60 people carried over while not one mark did.
--
-- PURELY ADDITIVE. Nothing is dropped, nothing is renamed, no constraint moves
-- and no existing value is touched. batchId and rowKey stay exactly as they are,
-- because production runs whatever is on `main` and a column the deployed code
-- has never heard of must not be the only place an answer lives.
--
-- The new columns land NULL on all 83 flag rows and 89 log rows. They are filled
-- by a separate, reviewable script, so the write can be read before it happens.

-- AlterTable
ALTER TABLE "TimesheetCheckFlag" ADD COLUMN     "periodFrom" TEXT,
ADD COLUMN     "periodTo" TEXT,
ADD COLUMN     "personKey" TEXT,
ADD COLUMN     "findingKey" TEXT,
ADD COLUMN     "coveredThrough" TEXT;

-- AlterTable
ALTER TABLE "TimesheetContactLog" ADD COLUMN     "periodFrom" TEXT,
ADD COLUMN     "periodTo" TEXT,
ADD COLUMN     "personKey" TEXT,
ADD COLUMN     "findingKey" TEXT;

-- CreateIndex
CREATE INDEX "TimesheetCheckFlag_periodFrom_periodTo_personKey_idx" ON "TimesheetCheckFlag"("periodFrom", "periodTo", "personKey");

-- CreateIndex
CREATE INDEX "TimesheetContactLog_periodFrom_periodTo_personKey_idx" ON "TimesheetContactLog"("periodFrom", "periodTo", "personKey");
