/*
  Warnings:

  - You are about to drop the column `Questions` on the `PatientProgress` table. All the data in the column will be lost.
  - Added the required column `scheduledDate` to the `PatientProgress` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "FollowUpStatus" ADD VALUE 'SUSPEND';

-- AlterTable
ALTER TABLE "PatientProgress" DROP COLUMN "Questions",
ADD COLUMN     "questions" TEXT,
ADD COLUMN     "scheduledDate" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "followUpStatus" SET DEFAULT 'SCHEDULED';
