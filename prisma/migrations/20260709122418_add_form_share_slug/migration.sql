-- AlterTable
ALTER TABLE "Form" ADD COLUMN "shareSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Form_shareSlug_key" ON "Form"("shareSlug");
