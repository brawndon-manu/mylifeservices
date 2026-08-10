-- The times an employee gives for breaks nothing recorded at the time.
--
-- Additive and nullable: every existing row keeps working untouched, nothing is
-- backfilled and nothing is rewritten. Held on the answer rather than only in
-- the day-row override because answerTimesheetQuestion rebuilds every override
-- from every stored answer on each reply, so a time kept only in the override
-- blob is lost as soon as the person answers a different question.
ALTER TABLE "TimesheetCorrection" ADD COLUMN "statedBreaks" JSONB;
