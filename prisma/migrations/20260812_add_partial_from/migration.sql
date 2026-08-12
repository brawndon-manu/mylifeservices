-- The first day a partial upload actually kept.
--
-- Its sibling partialThrough landed a moment earlier, before it was clear the
-- window needed a start as well: QSP returns the whole pay period whatever range
-- it is asked for, so the operator types the range and both ends of it have to
-- be recorded. A separate migration rather than an edit to the last one, because
-- that one has already been applied and rewriting an applied migration puts the
-- schema into drift.
ALTER TABLE "TimesheetBatch" ADD COLUMN "partialFrom" TEXT;
