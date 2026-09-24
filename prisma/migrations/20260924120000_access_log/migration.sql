-- who opened which record. the file gate writes a row every time it serves one;
-- append-only, nothing in the app updates or deletes a row. additive: no
-- existing table changes.
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "userEmail" TEXT,
    "role" TEXT,
    "via" TEXT NOT NULL DEFAULT 'session',
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccessLog_at_idx" ON "AccessLog"("at");
CREATE INDEX "AccessLog_userId_at_idx" ON "AccessLog"("userId", "at");
CREATE INDEX "AccessLog_target_idx" ON "AccessLog"("target");
