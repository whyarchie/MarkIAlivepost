import { describe, expect, test } from "bun:test";
import {
  listMessagesQuerySchema,
  presignAttachmentSchema,
  sendMessageSchema,
} from "./chat.schema";
import { isConditionChatWritable } from "./chat.service";
import {
  createAttachmentIdentity,
  matchesAttachmentSignature,
  resolveAttachmentStorageLocation,
  resolveChatStorageProvider,
} from "./chat.storage";

describe("condition chat lifecycle", () => {
  const start = new Date("2026-08-01T00:00:00.000Z");
  const end = new Date("2026-08-25T00:00:00.000Z");

  test("allows both boundary days regardless of time of day", () => {
    expect(
      isConditionChatWritable(start, end, new Date("2026-08-01T23:59:59.999Z")),
    ).toBe(true);
    expect(
      isConditionChatWritable(start, end, new Date("2026-08-25T23:59:59.999Z")),
    ).toBe(true);
  });

  test("makes history read-only before and after the care period", () => {
    expect(
      isConditionChatWritable(start, end, new Date("2026-07-31T23:59:59.999Z")),
    ).toBe(false);
    expect(
      isConditionChatWritable(start, end, new Date("2026-08-26T00:00:00.000Z")),
    ).toBe(false);
  });
});

describe("chat API validation", () => {
  test("requires text or an attachment and accepts a retry UUID", () => {
    expect(
      sendMessageSchema.safeParse({
        clientMessageId: "5b57ebd8-4750-4e90-91d7-42044d915b45",
      }).success,
    ).toBe(false);
    expect(
      sendMessageSchema.safeParse({
        clientMessageId: "5b57ebd8-4750-4e90-91d7-42044d915b45",
        text: "How are you feeling?",
      }).success,
    ).toBe(true);
  });

  test("accepts only supported files no larger than 10 MB", () => {
    expect(
      presignAttachmentSchema.safeParse({
        fileName: "scan.pdf",
        mimeType: "application/pdf",
        byteSize: 10 * 1024 * 1024,
      }).success,
    ).toBe(true);
    expect(
      presignAttachmentSchema.safeParse({
        fileName: "malware.exe",
        mimeType: "application/octet-stream",
        byteSize: 100,
      }).success,
    ).toBe(false);
    expect(
      presignAttachmentSchema.safeParse({
        fileName: "large.png",
        mimeType: "image/png",
        byteSize: 10 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
  });

  test("caps history pages to 100 messages", () => {
    expect(listMessagesQuerySchema.safeParse({ limit: 100 }).success).toBe(true);
    expect(listMessagesQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  test("rejects files whose bytes are disguised by MIME metadata", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 sample");
    expect(matchesAttachmentSignature("application/pdf", pdf)).toBe(true);
    expect(matchesAttachmentSignature("image/jpeg", pdf)).toBe(false);
    expect(
      matchesAttachmentSignature(
        "image/png",
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe(true);
  });
});

describe("chat attachment storage selection", () => {
  test("keeps S3 as the backward-compatible default", () => {
    expect(resolveChatStorageProvider(undefined)).toBe("s3");
    expect(resolveChatStorageProvider("S3")).toBe("s3");

    const attachment = createAttachmentIdentity(42, "application/pdf", "s3");
    expect(attachment.storageKey).toMatch(/^chat\/42\/.+\.pdf$/);
    expect(resolveAttachmentStorageLocation(attachment.storageKey)).toEqual({
      provider: "s3",
      objectKey: attachment.storageKey,
    });
  });

  test("selects Azure Blob using the documented env spellings", () => {
    expect(resolveChatStorageProvider("azure-blob")).toBe("azure-blob");
    expect(resolveChatStorageProvider("azure_blob")).toBe("azure-blob");
    expect(resolveChatStorageProvider("blob")).toBe("azure-blob");

    const attachment = createAttachmentIdentity(
      42,
      "image/png",
      "azure-blob",
    );
    expect(attachment.storageKey).toMatch(
      /^azure-blob:chat\/42\/.+\.png$/,
    );
    expect(resolveAttachmentStorageLocation(attachment.storageKey)).toEqual({
      provider: "azure-blob",
      objectKey: attachment.storageKey.replace("azure-blob:", ""),
    });
  });

  test("fails closed for an unknown provider", () => {
    expect(() => resolveChatStorageProvider("local")).toThrow(
      "CHAT_STORAGE_PROVIDER must be either s3 or azure-blob",
    );
  });
});
