-- what the record was, in words, at the moment it was opened (the kind of
-- record, whose it is, the period), so a line still says what it was after the
-- record is gone. additive: empty on the rows that exist today.
ALTER TABLE "AccessLog" ADD COLUMN "label" TEXT;
