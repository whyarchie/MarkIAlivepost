import prisma from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import type {
  PresignAttachmentInput,
  SendMessageInput,
} from "./chat.schema";
import {
  createAttachmentIdentity,
  createDownloadUrl,
  createUploadUrl,
  deleteStoredObject,
  verifyUploadedObject,
} from "./chat.storage";

type ChatRole = "PATIENT" | "HOSPITAL";

const THREAD_CONDITION_SELECT = {
  id: true,
  HospitalPatientId: true,
  startDate: true,
  endDate: true,
  status: true,
  patientId: true,
  hospitalId: true,
  patient: { select: { id: true, name: true, mobileNumber: true } },
  hospital: { select: { id: true, name: true } },
  disease: { select: { id: true, name: true } },
} as const;

function senderRole(user: AuthUserType): ChatRole {
  if (user.role === "Patient") return "PATIENT";
  if (user.role === "Hospital") return "HOSPITAL";
  throw new AppError("Only patients and hospitals can use chat", 403);
}

function utcDateNumber(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function isConditionChatWritable(
  startDate: Date,
  endDate: Date | null,
  now = new Date(),
): boolean {
  const today = utcDateNumber(now);
  return (
    today >= utcDateNumber(startDate) &&
    (!endDate || today <= utcDateNumber(endDate))
  );
}

function canAccessCondition(
  condition: { patientId: number; hospitalId: number },
  user: AuthUserType,
) {
  return (
    (user.role === "Patient" && condition.patientId === user.id) ||
    (user.role === "Hospital" && condition.hospitalId === user.id)
  );
}

export async function authorizeCondition(conditionId: number, user: AuthUserType) {
  senderRole(user);
  const condition = await prisma.patientCondition.findUnique({
    where: { id: conditionId },
    select: THREAD_CONDITION_SELECT,
  });
  if (!condition) throw new AppError("Chat condition not found", 404);
  if (!canAccessCondition(condition, user)) {
    throw new AppError("You do not have access to this chat", 403);
  }
  const thread = await prisma.chatThread.upsert({
    where: { patientConditionId: condition.id },
    update: {},
    create: { patientConditionId: condition.id },
  });
  return { condition, thread };
}

function attachmentDto(
  attachment: null | {
    id: string;
    originalName: string;
    mimeType: string;
    byteSize: number;
  },
) {
  if (!attachment) return null;
  return {
    id: attachment.id,
    fileName: attachment.originalName,
    mimeType: attachment.mimeType,
    byteSize: attachment.byteSize,
    downloadUrlEndpoint: `/api/v1/chat/attachments/${attachment.id}/download-url`,
  };
}

function messageDto(
  message: {
    id: number;
    senderRole: ChatRole;
    senderId: number;
    clientMessageId: string;
    body: string | null;
    createdAt: Date;
    attachment: null | {
      id: string;
      originalName: string;
      mimeType: string;
      byteSize: number;
    };
  },
  thread: { patientLastReadAt: Date | null; hospitalLastReadAt: Date | null },
) {
  const recipientReadAt =
    message.senderRole === "PATIENT"
      ? thread.hospitalLastReadAt
      : thread.patientLastReadAt;
  return {
    id: message.id,
    senderRole: message.senderRole,
    senderId: message.senderId,
    clientMessageId: message.clientMessageId,
    text: message.body,
    attachment: attachmentDto(message.attachment),
    createdAt: message.createdAt,
    readAt:
      recipientReadAt && recipientReadAt >= message.createdAt
        ? recipientReadAt
        : null,
  };
}

export async function listThreads(
  user: AuthUserType,
  input: { cursor?: number; limit: number },
) {
  const role = senderRole(user);
  const accessWhere =
    role === "PATIENT"
      ? { patientCondition: { patientId: user.id } }
      : { patientCondition: { hospitalId: user.id } };

  let cursorWhere = {};
  if (input.cursor) {
    const cursorThread = await prisma.chatThread.findFirst({
      where: { id: input.cursor, ...accessWhere },
      select: { id: true, lastActivityAt: true },
    });
    if (!cursorThread) throw new AppError("Invalid chat cursor", 400);
    cursorWhere = {
      OR: [
        { lastActivityAt: { lt: cursorThread.lastActivityAt } },
        {
          lastActivityAt: cursorThread.lastActivityAt,
          id: { lt: cursorThread.id },
        },
      ],
    };
  }

  const threads = await prisma.chatThread.findMany({
    where: { ...accessWhere, ...cursorWhere },
    orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    include: {
      patientCondition: { select: THREAD_CONDITION_SELECT },
      messages: {
        take: 1,
        orderBy: { id: "desc" },
        include: { attachment: true },
      },
    },
  });

  const hasMore = threads.length > input.limit;
  const page = threads.slice(0, input.limit);
  const data = await Promise.all(
    page.map(async (thread) => {
      const readAt =
        role === "PATIENT"
          ? thread.patientLastReadAt
          : thread.hospitalLastReadAt;
      const unreadCount = await prisma.chatMessage.count({
        where: {
          threadId: thread.id,
          senderRole: role === "PATIENT" ? "HOSPITAL" : "PATIENT",
          ...(readAt ? { createdAt: { gt: readAt } } : {}),
        },
      });
      const lastMessage = thread.messages[0];
      return {
        id: thread.id,
        conditionId: thread.patientConditionId,
        condition: thread.patientCondition,
        writable: isConditionChatWritable(
          thread.patientCondition.startDate,
          thread.patientCondition.endDate,
        ),
        unreadCount,
        lastActivityAt: thread.lastActivityAt,
        lastMessage: lastMessage ? messageDto(lastMessage, thread) : null,
      };
    }),
  );

  return {
    threads: data,
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
  };
}

export async function listMessages(
  conditionId: number,
  user: AuthUserType,
  input: { before?: number; limit: number },
) {
  const { thread } = await authorizeCondition(conditionId, user);
  const messages = await prisma.chatMessage.findMany({
    where: {
      threadId: thread.id,
      ...(input.before ? { id: { lt: input.before } } : {}),
    },
    orderBy: { id: "desc" },
    take: input.limit + 1,
    include: { attachment: true },
  });
  const hasMore = messages.length > input.limit;
  const page = messages.slice(0, input.limit);
  const nextCursor = hasMore ? page.at(-1)?.id ?? null : null;
  return {
    messages: page.reverse().map((message) => messageDto(message, thread)),
    nextCursor,
  };
}

export async function presignAttachment(
  conditionId: number,
  user: AuthUserType,
  input: PresignAttachmentInput,
) {
  const role = senderRole(user);
  const { condition, thread } = await authorizeCondition(conditionId, user);
  if (!isConditionChatWritable(condition.startDate, condition.endDate)) {
    throw new AppError("This care period has ended; its chat is read-only", 409);
  }

  const identity = createAttachmentIdentity(conditionId, input.mimeType);
  const signed = await createUploadUrl({
    storageKey: identity.storageKey,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
  });
  const expiresAt = new Date(Date.now() + signed.expiresInSeconds * 1000);
  const attachment = await prisma.chatAttachment.create({
    data: {
      id: identity.id,
      threadId: thread.id,
      uploadedByRole: role,
      uploadedById: user.id,
      storageKey: identity.storageKey,
      originalName: input.fileName,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      expiresAt,
    },
  });
  return { attachmentId: attachment.id, expiresAt, ...signed };
}

async function findMessageByClientId(
  threadId: number,
  role: ChatRole,
  userId: number,
  clientMessageId: string,
) {
  return prisma.chatMessage.findUnique({
    where: {
      threadId_senderRole_senderId_clientMessageId: {
        threadId,
        senderRole: role,
        senderId: userId,
        clientMessageId,
      },
    },
    include: { attachment: true, thread: true },
  });
}

export async function sendMessage(
  conditionId: number,
  user: AuthUserType,
  input: SendMessageInput,
) {
  const role = senderRole(user);
  const { condition, thread } = await authorizeCondition(conditionId, user);
  const existing = await findMessageByClientId(
    thread.id,
    role,
    user.id,
    input.clientMessageId,
  );
  if (existing) return {
    message: messageDto(existing, existing.thread),
    created: false,
    participants: { patientId: condition.patientId, hospitalId: condition.hospitalId },
  };

  if (!isConditionChatWritable(condition.startDate, condition.endDate)) {
    throw new AppError("This care period has ended; its chat is read-only", 409);
  }

  let attachment:
    | {
        id: string;
        storageKey: string;
        mimeType: string;
        byteSize: number;
      }
    | undefined;
  if (input.attachmentId) {
    const pending = await prisma.chatAttachment.findUnique({
      where: { id: input.attachmentId },
    });
    if (
      !pending ||
      pending.threadId !== thread.id ||
      pending.uploadedByRole !== role ||
      pending.uploadedById !== user.id ||
      pending.status !== "PENDING" ||
      pending.expiresAt < new Date()
    ) {
      throw new AppError("Attachment is invalid or has expired", 400);
    }
    attachment = pending;
    await verifyUploadedObject({
      storageKey: pending.storageKey,
      expectedMimeType: pending.mimeType,
      expectedByteSize: pending.byteSize,
    });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const message = await tx.chatMessage.create({
        data: {
          threadId: thread.id,
          senderRole: role,
          senderId: user.id,
          clientMessageId: input.clientMessageId,
          body: input.text || null,
        },
      });
      if (attachment) {
        await tx.chatAttachment.update({
          where: { id: attachment.id },
          data: { status: "ATTACHED", messageId: message.id },
        });
      }
      const updatedThread = await tx.chatThread.update({
        where: { id: thread.id },
        data: { lastActivityAt: message.createdAt },
      });
      return { message, updatedThread };
    });
    const complete = await prisma.chatMessage.findUniqueOrThrow({
      where: { id: created.message.id },
      include: { attachment: true },
    });
    return {
      message: messageDto(complete, created.updatedThread),
      created: true,
      participants: { patientId: condition.patientId, hospitalId: condition.hospitalId },
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      const duplicate = await findMessageByClientId(
        thread.id,
        role,
        user.id,
        input.clientMessageId,
      );
      if (duplicate) return {
        message: messageDto(duplicate, duplicate.thread),
        created: false,
        participants: { patientId: condition.patientId, hospitalId: condition.hospitalId },
      };
    }
    throw error;
  }
}

export async function markThreadRead(
  conditionId: number,
  user: AuthUserType,
  messageId: number,
) {
  const role = senderRole(user);
  const { condition, thread } = await authorizeCondition(conditionId, user);
  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, threadId: thread.id },
    select: { id: true, createdAt: true },
  });
  if (!message) throw new AppError("Message not found in this chat", 404);

  const current =
    role === "PATIENT" ? thread.patientLastReadAt : thread.hospitalLastReadAt;
  const readAt =
    current && current >= message.createdAt ? current : message.createdAt;
  await prisma.chatThread.update({
    where: { id: thread.id },
    data:
      role === "PATIENT"
        ? { patientLastReadAt: readAt }
        : { hospitalLastReadAt: readAt },
  });
  return {
    data: { conditionId, messageId, readerRole: role, readAt },
    participants: {
      patientId: condition.patientId,
      hospitalId: condition.hospitalId,
    },
  };
}

export async function getAttachmentDownload(
  attachmentId: string,
  user: AuthUserType,
) {
  const attachment = await prisma.chatAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      thread: { include: { patientCondition: true } },
    },
  });
  if (!attachment || attachment.status !== "ATTACHED") {
    throw new AppError("Attachment not found", 404);
  }
  if (!canAccessCondition(attachment.thread.patientCondition, user)) {
    throw new AppError("You do not have access to this attachment", 403);
  }
  return createDownloadUrl(
    attachment.storageKey,
    attachment.originalName,
    attachment.mimeType,
  );
}

export async function getPatientNotificationTargets(conditionId: number) {
  const condition = await prisma.patientCondition.findUnique({
    where: { id: conditionId },
    select: {
      patient: {
        select: { patientDevices: { select: { id: true, fcmToken: true } } },
      },
      hospital: { select: { name: true } },
    },
  });
  return condition
    ? { devices: condition.patient.patientDevices, hospitalName: condition.hospital.name }
    : null;
}

export async function cleanupExpiredChatAttachments() {
  const expired = await prisma.chatAttachment.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    select: { id: true, storageKey: true },
    take: 100,
  });
  for (const attachment of expired) {
    try {
      await deleteStoredObject(attachment.storageKey);
      await prisma.chatAttachment.delete({ where: { id: attachment.id } });
    } catch (error) {
      console.error("[chat-cleanup] Failed to remove attachment", attachment.id, error);
    }
  }
  return expired.length;
}

export async function deleteStoredChatObjectsForConditions(conditionIds: number[]) {
  if (!conditionIds.length) return;
  const attachments = await prisma.chatAttachment.findMany({
    where: { thread: { patientConditionId: { in: conditionIds } } },
    select: { storageKey: true },
  });
  for (const attachment of attachments) {
    await deleteStoredObject(attachment.storageKey);
  }
}
