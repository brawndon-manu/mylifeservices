-- Additive only: the office hold on signing a timesheet.
ALTER TABLE "Timesheet" ADD COLUMN "heldAt" TIMESTAMP(3);
ALTER TABLE "Timesheet" ADD COLUMN "heldById" TEXT;
ALTER TABLE "Timesheet" ADD COLUMN "heldByName" TEXT;
ALTER TABLE "Timesheet" ADD COLUMN "heldReason" TEXT;
