-- CreateEnum
CREATE TYPE "NewsletterStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NewsletterCategory" AS ENUM ('PAST_WEEK', 'UPCOMING');

-- CreateTable
CREATE TABLE "NewsletterItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "category" "NewsletterCategory" NOT NULL,
    "eventDate" TIMESTAMP(3),
    "status" "NewsletterStatus" NOT NULL DEFAULT 'SUBMITTED',
    "consentConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "reviewNote" TEXT,
    "submittedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsletterItem_status_idx" ON "NewsletterItem"("status");

-- CreateIndex
CREATE INDEX "NewsletterItem_publishedAt_idx" ON "NewsletterItem"("publishedAt");

-- AddForeignKey
ALTER TABLE "NewsletterItem" ADD CONSTRAINT "NewsletterItem_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterItem" ADD CONSTRAINT "NewsletterItem_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterItem" ADD CONSTRAINT "NewsletterItem_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
