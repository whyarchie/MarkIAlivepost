/*
  Warnings:

  - Added the required column `fcmToken` to the `PatientDevice` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PatientDevice" ADD COLUMN     "fcmToken" TEXT NOT NULL;
