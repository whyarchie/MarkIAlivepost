/*
  Warnings:

  - A unique constraint covering the columns `[fcmToken]` on the table `PatientDevice` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PatientDevice_fcmToken_key" ON "PatientDevice"("fcmToken");
