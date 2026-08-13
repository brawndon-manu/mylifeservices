/*
  Warnings:

  - Added the required column `updatedAt` to the `TimesheetCheckFlag` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TimesheetCheckFlag" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'contacted',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
