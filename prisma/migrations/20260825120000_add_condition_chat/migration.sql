-- CreateEnum
CREATE TYPE "ChatSenderRole" AS ENUM ('PATIENT', 'HOSPITAL');

-- CreateEnum
CREATE TYPE "ChatAttachmentStatus" AS ENUM ('PENDING', 'ATTACHED');

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" SERIAL NOT NULL,
    "patientConditionId" INTEGER NOT NULL,
    "patientLastReadAt" TIMESTAMP(3),
    "hospitalLastReadAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ChatThread" ("patientConditionId", "lastActivityAt", "createdAt", "updatedAt")
SELECT "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "PatientCondition";

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "threadId" INTEGER NOT NULL,
    "senderRole" "ChatSenderRole" NOT NULL,
    "senderId" INTEGER NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAttachment" (
    "id" TEXT NOT NULL,
    "threadId" INTEGER NOT NULL,
    "messageId" INTEGER,
    "uploadedByRole" "ChatSenderRole" NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "status" "ChatAttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatThread_patientConditionId_key" ON "ChatThread"("patientConditionId");
CREATE INDEX "ChatThread_lastActivityAt_id_idx" ON "ChatThread"("lastActivityAt", "id");
CREATE UNIQUE INDEX "ChatMessage_threadId_senderRole_senderId_clientMessageId_key" ON "ChatMessage"("threadId", "senderRole", "senderId", "clientMessageId");
CREATE INDEX "ChatMessage_threadId_id_idx" ON "ChatMessage"("threadId", "id");
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");
CREATE UNIQUE INDEX "ChatAttachment_messageId_key" ON "ChatAttachment"("messageId");
CREATE UNIQUE INDEX "ChatAttachment_storageKey_key" ON "ChatAttachment"("storageKey");
CREATE INDEX "ChatAttachment_threadId_status_idx" ON "ChatAttachment"("threadId", "status");
CREATE INDEX "ChatAttachment_status_expiresAt_idx" ON "ChatAttachment"("status", "expiresAt");

ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_patientConditionId_fkey" FOREIGN KEY ("patientConditionId") REFERENCES "PatientCondition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
