-- THE SURVEY DESK'S MARKS, 2026-09-02: star a client so reviewers know who to
-- prioritize, flag one with a note - the timesheet review's flag shape, on the
-- satisfaction list. Keyed by clientKey so a roster re-import cannot orphan it.
--
-- Additive: one new table.

CREATE TABLE "ClientMark" (
    "id" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "byId" TEXT,
    "byName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientMark_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientMark_clientKey_key" ON "ClientMark"("clientKey");
