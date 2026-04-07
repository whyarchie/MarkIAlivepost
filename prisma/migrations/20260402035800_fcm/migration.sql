-- AlterTable
ALTER TABLE "PatientProgress" ADD COLUMN     "answer" TEXT;

-- CreateTable
CREATE TABLE "PatientDevice" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,

    CONSTRAINT "PatientDevice_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PatientDevice" ADD CONSTRAINT "PatientDevice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
