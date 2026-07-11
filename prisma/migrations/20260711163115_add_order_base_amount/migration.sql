/*
  Warnings:

  - Added the required column `base_amount` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: add nullable first so existing rows don't fail the NOT NULL constraint.
ALTER TABLE "orders" ADD COLUMN     "base_amount" INTEGER;

-- Backfill: orders placed before GST was introduced were charged with no GST,
-- so their full amount was already the wallet-credited base amount.
UPDATE "orders" SET "base_amount" = "amount" WHERE "base_amount" IS NULL;

-- AlterTable: now safe to enforce NOT NULL.
ALTER TABLE "orders" ALTER COLUMN "base_amount" SET NOT NULL;
