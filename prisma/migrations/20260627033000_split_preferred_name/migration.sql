-- split the single displayName into preferredFirstName + preferredLastName.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "preferredFirstName" TEXT;
ALTER TABLE "User" ADD COLUMN "preferredLastName" TEXT;

-- preserve any existing display name as the preferred first name
UPDATE "User" SET "preferredFirstName" = "displayName" WHERE "displayName" IS NOT NULL;

-- drop the old single display-name column
ALTER TABLE "User" DROP COLUMN "displayName";
