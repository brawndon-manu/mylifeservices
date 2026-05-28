-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('LAPTOP', 'DESKTOP', 'TABLET', 'PHONE', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('IN_USE', 'STORAGE', 'REPAIR', 'RETIRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deviceManager" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL DEFAULT 'LAPTOP',
    "serialNumber" TEXT,
    "priceCents" INTEGER,
    "purchaseDate" TIMESTAMP(3),
    "assignedTo" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'IN_USE',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Device_status_idx" ON "Device"("status");
