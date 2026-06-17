-- CreateTable
CREATE TABLE "SitePhoto" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "caption" TEXT,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "consentConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitePhoto_section_sortOrder_idx" ON "SitePhoto"("section", "sortOrder");

-- AddForeignKey
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
