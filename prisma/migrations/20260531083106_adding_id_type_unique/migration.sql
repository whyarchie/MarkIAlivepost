/*
  Warnings:

  - A unique constraint covering the columns `[idType,idNumber]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Patient_idNumber_key";

-- CreateIndex
CREATE UNIQUE INDEX "Patient_idType_idNumber_key" ON "Patient"("idType", "idNumber");
