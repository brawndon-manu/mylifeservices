-- CreateTable
CREATE TABLE "PtoEntry" (
    "id" TEXT NOT NULL,
    "program" TEXT NOT NULL DEFAULT 'MLS',
    "periodFrom" TEXT NOT NULL,
    "periodTo" TEXT NOT NULL,
    "personKey" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "byId" TEXT,
    "byName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PtoEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PtoEntry_program_periodFrom_periodTo_idx" ON "PtoEntry"("program", "periodFrom", "periodTo");

-- CreateIndex
CREATE UNIQUE INDEX "PtoEntry_program_periodFrom_periodTo_personKey_date_key" ON "PtoEntry"("program", "periodFrom", "periodTo", "personKey", "date");
