/*
  Warnings:

  - The `questions` column on the `PatientProgress` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `answer` column on the `PatientProgress` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[idNumber]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `idNumber` to the `Patient` table without a default value. This is not possible if the table is not empty.
  - Added the required column `idType` to the `Patient` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "IdType" AS ENUM ('AADHAR', 'DRIVING_LICENSE', 'PASSPORT');

-- AlterTable: add with defaults for existing rows
ALTER TABLE "Patient" ADD COLUMN "idType" "IdType" NOT NULL DEFAULT 'AADHAR';
ALTER TABLE "Patient" ADD COLUMN "idNumber" TEXT NOT NULL DEFAULT 'UNKNOWN';

-- Make existing rows unique
UPDATE "Patient" SET "idNumber" = 'UNKNOWN-' || id::text;

-- CreateIndex
CREATE UNIQUE INDEX "Patient_idNumber_key" ON "Patient"("idNumber");

-- AlterTable PatientProgress
ALTER TABLE "PatientProgress" DROP COLUMN "questions";
ALTER TABLE "PatientProgress" ADD COLUMN "questions" JSONB;
ALTER TABLE "PatientProgress" DROP COLUMN "answer";
ALTER TABLE "PatientProgress" ADD COLUMN "answer" JSONB;