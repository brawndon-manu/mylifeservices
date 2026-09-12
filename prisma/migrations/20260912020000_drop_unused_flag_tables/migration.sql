-- NOT ADDITIVE, AND APPROVED: Mánu 2026-09-12, "drop the dead tables".
--
-- Two shapes the flag was tried in before it landed on ShiftReview.kinds.
-- Both were created the same day, neither was ever read by deployed code, and
-- both held ZERO rows when this was written - checked against the shared
-- database immediately before, along with the fact that nothing carries a
-- foreign key to either. Nothing is lost by removing them.
--
-- IF EXISTS so a database that never saw the two create migrations applies
-- this cleanly.
DROP TABLE IF EXISTS "AuditNoteFlag";

DROP TABLE IF EXISTS "AuditSecondLook";
