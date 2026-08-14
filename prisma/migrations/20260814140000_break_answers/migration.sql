-- WHY A BREAK WAS NOT TAKEN.
--
-- Nothing in the four QSP exports records this: the rest report's Schedule
-- Notes are about late clock-ins, and the timesheet comments block is the same
-- field time-ranged against a shift. Every reason is gathered fresh.
--
-- Keyed on (period, person, finding) rather than on a timesheet, because
-- timesheet rows are remade by every upload and a reason taken off a phone call
-- must not evaporate when a new export lands.

-- CreateTable
CREATE TABLE "TimesheetBreakAnswer" (
    "id" TEXT NOT NULL,
    "periodFrom" TEXT NOT NULL,
    "periodTo" TEXT NOT NULL,
    "personKey" TEXT NOT NULL,
    "findingKey" TEXT NOT NULL,
    "date" TEXT,
    "kind" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "reason" TEXT,
    "via" TEXT,
    "byId" TEXT NOT NULL,
    "byName" TEXT,
    "byImage" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetBreakAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimesheetBreakAnswer_periodFrom_periodTo_personKey_idx" ON "TimesheetBreakAnswer"("periodFrom", "periodTo", "personKey");

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetBreakAnswer_period_person_finding_key" ON "TimesheetBreakAnswer"("periodFrom", "periodTo", "personKey", "findingKey");
