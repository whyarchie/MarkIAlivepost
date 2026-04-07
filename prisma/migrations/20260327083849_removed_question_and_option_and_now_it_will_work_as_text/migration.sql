/*
  Warnings:

  - You are about to drop the `Option` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProgressQuestion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProgressQuestionResponse` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SelectedOption` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Option" DROP CONSTRAINT "Option_questionId_fkey";

-- DropForeignKey
ALTER TABLE "ProgressQuestion" DROP CONSTRAINT "ProgressQuestion_patientProgressId_fkey";

-- DropForeignKey
ALTER TABLE "ProgressQuestionResponse" DROP CONSTRAINT "ProgressQuestionResponse_questionId_fkey";

-- DropForeignKey
ALTER TABLE "SelectedOption" DROP CONSTRAINT "SelectedOption_optionId_fkey";

-- DropForeignKey
ALTER TABLE "SelectedOption" DROP CONSTRAINT "SelectedOption_responseId_fkey";

-- AlterTable
ALTER TABLE "PatientProgress" ADD COLUMN     "Questions" TEXT;

-- DropTable
DROP TABLE "Option";

-- DropTable
DROP TABLE "ProgressQuestion";

-- DropTable
DROP TABLE "ProgressQuestionResponse";

-- DropTable
DROP TABLE "SelectedOption";

-- DropEnum
DROP TYPE "QuestionType";
