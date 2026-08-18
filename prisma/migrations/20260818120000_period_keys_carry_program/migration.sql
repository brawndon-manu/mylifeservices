-- DropIndex
DROP INDEX "TimesheetBreakAnswer_period_person_finding_key";

-- AlterTable
ALTER TABLE "TimesheetBreakAnswer" ADD COLUMN     "program" TEXT NOT NULL DEFAULT 'MLS';

-- AlterTable
ALTER TABLE "TimesheetCheckFlag" ADD COLUMN     "program" TEXT NOT NULL DEFAULT 'MLS';

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetBreakAnswer_program_periodFrom_periodTo_personKey__key" ON "TimesheetBreakAnswer"("program", "periodFrom", "periodTo", "personKey", "findingKey");
