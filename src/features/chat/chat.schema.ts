import { z } from "zod";

export const conditionIdSchema = z.coerce.number().int().positive();

export const listThreadsQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const listMessagesQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const presignAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ]),
  byteSize: z.number().int().positive().max(10 * 1024 * 1024),
});

export const sendMessageSchema = z
  .object({
    clientMessageId: z.string().uuid(),
    text: z.string().trim().max(4000).optional(),
    attachmentId: z.string().uuid().optional(),
  })
  .refine((value) => Boolean(value.text || value.attachmentId), {
    message: "A message must contain text or an attachment",
  });

export const markReadSchema = z.object({
  messageId: z.number().int().positive(),
});

export type PresignAttachmentInput = z.infer<typeof presignAttachmentSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
