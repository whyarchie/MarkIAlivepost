/*
  Warnings:

  - Made the column `doctorId` on table `PatientCondition` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "PatientCondition" DROP CONSTRAINT "PatientCondition_doctorId_fkey";

-- AlterTable
ALTER TABLE "PatientCondition" ALTER COLUMN "doctorId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "PatientCondition" ADD CONSTRAINT "PatientCondition_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
