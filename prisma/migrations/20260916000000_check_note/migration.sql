-- additive: one editable note per finding on the data checks screen.
--
-- Keyed on (program, period, person, finding) rather than on a batch, the same
-- way TimesheetCheckFlag and TimesheetContactLog are. TimesheetRowComment is
-- keyed on (batch, row) and one of the four notes ever written on it is already
-- invisible, because a later upload replaced the batch under it. The period is
-- re-uploaded several times a day while corrections go back into QuickSolve.
--
-- Nothing is dropped and nothing else is touched. TimesheetRowComment keeps its
-- rows and its screen.
CREATE TABLE "TimesheetCheckNote" (
    "id" TEXT NOT NULL,
    "program" TEXT NOT NULL DEFAULT 'MLS',
    "periodFrom" TEXT NOT NULL,
    "periodTo" TEXT NOT NULL,
    "personKey" TEXT NOT NULL,
    "findingKey" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "batchId" TEXT,
    "lastEditedById" TEXT NOT NULL,
    "lastEditedByName" TEXT,
    "lastEditedByImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetCheckNote_pkey" PRIMARY KEY ("id")
);

-- one note per finding, enforced here rather than hoped for in the reader
CREATE UNIQUE INDEX "TimesheetCheckNote_program_periodFrom_periodTo_personKey_fin_key" ON "TimesheetCheckNote"("program", "periodFrom", "periodTo", "personKey", "findingKey");

-- the screen loads every note for one period in one query
CREATE INDEX "TimesheetCheckNote_program_periodFrom_periodTo_idx" ON "TimesheetCheckNote"("program", "periodFrom", "periodTo");
