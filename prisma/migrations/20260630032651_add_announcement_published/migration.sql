-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- backfill: everything that already exists is considered published (keep it in
-- the feed). only posts created from here on via "Preview" start as drafts.
UPDATE "Announcement" SET "publishedAt" = "createdAt" WHERE "publishedAt" IS NULL;
