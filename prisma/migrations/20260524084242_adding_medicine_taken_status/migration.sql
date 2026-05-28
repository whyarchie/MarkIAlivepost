/*
  Warnings:

  - The `questions` column on the `PatientProgress` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `answer` column on the `PatientProgress` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "PatientProgress" DROP COLUMN "questions",
ADD COLUMN     "questions" JSONB,
DROP COLUMN "answer",
ADD COLUMN     "answer" JSONB;

-- CreateTable
CREATE TABLE "MedicineStatus" (
    "id" SERIAL NOT NULL,
    "medicineTaken" BOOLEAN NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MedicineAllottedToMedicineStatus" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_MedicineAllottedToMedicineStatus_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_MedicineAllottedToMedicineStatus_B_index" ON "_MedicineAllottedToMedicineStatus"("B");

-- AddForeignKey
ALTER TABLE "_MedicineAllottedToMedicineStatus" ADD CONSTRAINT "_MedicineAllottedToMedicineStatus_A_fkey" FOREIGN KEY ("A") REFERENCES "MedicineAllotted"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MedicineAllottedToMedicineStatus" ADD CONSTRAINT "_MedicineAllottedToMedicineStatus_B_fkey" FOREIGN KEY ("B") REFERENCES "MedicineStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
