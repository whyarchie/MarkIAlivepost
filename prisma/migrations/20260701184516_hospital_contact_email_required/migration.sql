/*
  Warnings:

  - Made the column `email` on table `Hospital` required. This step will fail if there are existing NULL values in that column.
  - Made the column `contactNumber` on table `Hospital` required. This step will fail if there are existing NULL values in that column.

*/
-- Backfill existing rows so the NOT NULL constraints below can be applied.
-- Existing hospitals predate these columns: reuse the helpline as the contact
-- number and derive a placeholder email from the userId. These can be updated
-- later from the admin panel.
UPDATE "Hospital" SET "contactNumber" = "helplineNumber" WHERE "contactNumber" IS NULL;
UPDATE "Hospital" SET "email" = lower("userId") || '@alivepost.local' WHERE "email" IS NULL;

-- AlterTable
ALTER TABLE "Hospital" ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "contactNumber" SET NOT NULL;
