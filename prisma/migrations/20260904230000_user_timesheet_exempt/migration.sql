-- additive: a user account that must never hold a timesheet (a second login
-- of the same person). default false keeps every existing account as it was.
ALTER TABLE "User" ADD COLUMN "timesheetExempt" BOOLEAN NOT NULL DEFAULT false;
