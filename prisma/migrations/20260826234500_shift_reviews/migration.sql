-- A REVIEWER'S DECISION ABOUT ONE BILLED SHIFT, 2026-08-26.
--
-- Keyed to the shift rather than to the upload it was read from. Pay periods
-- are re-uploaded constantly and every re-upload writes new Timesheet rows, so
-- a decision hanging off one of those rows is discarded exactly when the
-- reviewing has already been done.
--
-- Additive: one new table, nothing existing changes.

CREATE TABLE "ShiftReview" (
    "id" TEXT NOT NULL,
    "shiftKey" TEXT NOT NULL,
    "employeeKey" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startMin" INTEGER,
    "client" TEXT,
    "service" TEXT,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "billedMin" INTEGER,
    "clockedMin" INTEGER,
    "documentedMin" INTEGER,
    "decidedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShiftReview_shiftKey_key" ON "ShiftReview"("shiftKey");
CREATE INDEX "ShiftReview_decision_idx" ON "ShiftReview"("decision");
CREATE INDEX "ShiftReview_employeeKey_idx" ON "ShiftReview"("employeeKey");
CREATE INDEX "ShiftReview_date_idx" ON "ShiftReview"("date");

ALTER TABLE "ShiftReview" ADD CONSTRAINT "ShiftReview_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
