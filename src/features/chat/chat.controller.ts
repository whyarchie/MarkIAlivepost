import express from "express";
import { z } from "zod";
import { AuthUser } from "../../middleware/Auth";
import { PushNotification } from "../../utils/fcm";
import {
  conditionIdSchema,
  listMessagesQuerySchema,
  listThreadsQuerySchema,
  markReadSchema,
  presignAttachmentSchema,
  sendMessageSchema,
} from "./chat.schema";
import {
  getAttachmentDownload,
  getPatientNotificationTargets,
  listMessages,
  listThreads,
  markThreadRead,
  presignAttachment,
  sendMessage,
} from "./chat.service";
import { emitChatEvent } from "./chat.socket";
import jwtTokenSigner from "../../utils/jwttokensigner";

const chatRouter = express.Router();

/**
 * @swagger
 * /api/v1/chat/socket-token:
 *   get:
 *     summary: Mint a five-minute Socket.IO token for the cookie-authenticated web dashboard
 *     tags: [Chat]
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     responses:
 *       200: { description: Short-lived JWT and expiry in seconds }
 */
chatRouter.get("/socket-token", AuthUser, (req, res) => {
  const user = req.user!;
  if (user.role !== "Patient" && user.role !== "Hospital") {
    res.status(403).json({ success: false, message: "Chat access is not allowed" });
    return;
  }
  res.json({
    success: true,
    data: { token: jwtTokenSigner(user, "5m"), expiresInSeconds: 300 },
  });
});

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: Secure condition-based patient and hospital messaging. Socket.IO clients authenticate at /socket.io and subscribe with chat:join { conditionId }.
 * components:
 *   schemas:
 *     ChatAttachment:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         fileName: { type: string }
 *         mimeType: { type: string, enum: [image/jpeg, image/png, image/webp, application/pdf] }
 *         byteSize: { type: integer, maximum: 10485760 }
 *         downloadUrlEndpoint: { type: string }
 *     ChatMessage:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         senderRole: { type: string, enum: [PATIENT, HOSPITAL] }
 *         senderId: { type: integer }
 *         clientMessageId: { type: string, format: uuid }
 *         text: { type: string, nullable: true }
 *         attachment: { oneOf: [{ $ref: '#/components/schemas/ChatAttachment' }, { type: 'null' }] }
 *         createdAt: { type: string, format: date-time }
 *         readAt: { type: string, format: date-time, nullable: true }
 */

/**
 * @swagger
 * /api/v1/chat/threads:
 *   get:
 *     summary: List the authenticated user's condition chats
 *     tags: [Chat]
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: cursor, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 50 } }
 *     responses:
 *       200: { description: Threads ordered by latest activity with unread counts }
 */
chatRouter.get("/threads", AuthUser, async (req, res, next) => {
  try {
    const query = listThreadsQuerySchema.parse(req.query);
    const data = await listThreads(req.user!, query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/chat/threads/{conditionId}/messages:
 *   get:
 *     summary: Load cursor-paginated chat history
 *     tags: [Chat]
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: conditionId, required: true, schema: { type: integer } }
 *       - { in: query, name: before, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer, default: 50, maximum: 100 } }
 *     responses:
 *       200: { description: Messages in chronological order }
 *   post:
 *     summary: Send a text and/or one previously uploaded attachment
 *     tags: [Chat]
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: conditionId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientMessageId]
 *             properties:
 *               clientMessageId: { type: string, format: uuid, description: Stable client-generated retry key }
 *               text: { type: string, maxLength: 4000 }
 *               attachmentId: { type: string, format: uuid }
 *     responses:
 *       201: { description: Message stored, using ChatMessage schema }
 *       409: { description: Care period ended or upload is incomplete }
 */
chatRouter.get("/threads/:conditionId/messages", AuthUser, async (req, res, next) => {
  try {
    const conditionId = conditionIdSchema.parse(req.params.conditionId);
    const query = listMessagesQuerySchema.parse(req.query);
    const data = await listMessages(conditionId, req.user!, query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

chatRouter.post("/threads/:conditionId/messages", AuthUser, async (req, res, next) => {
  try {
    const conditionId = conditionIdSchema.parse(req.params.conditionId);
    const input = sendMessageSchema.parse(req.body);
    const result = await sendMessage(conditionId, req.user!, input);
    const message = result.message;
    if (result.created) {
      emitChatEvent(conditionId, "message:new", { conditionId, message }, result.participants);
      emitChatEvent(conditionId, "thread:updated", { conditionId, message }, result.participants);
    }

    if (result.created && req.user!.role === "Hospital") {
      void getPatientNotificationTargets(conditionId).then(async (targets) => {
        if (!targets) return;
        await Promise.allSettled(
          targets.devices.map((device) =>
            PushNotification(
              {
                fcmToken: device.fcmToken,
                title: targets.hospitalName,
                body: "You have a new secure message",
              },
              { type: "chat_message", id: conditionId },
            ),
          ),
        );
      }).catch((error) => console.error("[chat-fcm] Notification lookup failed", error));
    }

    res.status(result.created ? 201 : 200).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/chat/threads/{conditionId}/attachments/presign:
 *   post:
 *     summary: Create a private direct-upload URL for one image or PDF up to 10 MB
 *     tags: [Chat]
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: conditionId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fileName, mimeType, byteSize]
 *             properties:
 *               fileName: { type: string }
 *               mimeType: { type: string, enum: [image/jpeg, image/png, image/webp, application/pdf] }
 *               byteSize: { type: integer, maximum: 10485760 }
 *     responses:
 *       201: { description: Signed PUT URL, attachment ID, expiry, and required headers }
 */
chatRouter.post(
  "/threads/:conditionId/attachments/presign",
  AuthUser,
  async (req, res, next) => {
    try {
      const conditionId = conditionIdSchema.parse(req.params.conditionId);
      const input = presignAttachmentSchema.parse(req.body);
      const data = await presignAttachment(conditionId, req.user!, input);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/v1/chat/threads/{conditionId}/read:
 *   post:
 *     summary: Mark all messages through a message ID as read
 *     tags: [Chat]
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: conditionId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messageId]
 *             properties: { messageId: { type: integer } }
 *     responses:
 *       200: { description: Read marker and reader role }
 */
chatRouter.post("/threads/:conditionId/read", AuthUser, async (req, res, next) => {
  try {
    const conditionId = conditionIdSchema.parse(req.params.conditionId);
    const { messageId } = markReadSchema.parse(req.body);
    const result = await markThreadRead(conditionId, req.user!, messageId);
    emitChatEvent(conditionId, "thread:read", result.data, result.participants);
    res.json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/chat/attachments/{attachmentId}/download-url:
 *   get:
 *     summary: Get an authorized short-lived attachment URL
 *     tags: [Chat]
 *     security: [{ cookieAuth: [] }, { bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: attachmentId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Signed download URL and expiry in seconds }
 */
chatRouter.get("/attachments/:attachmentId/download-url", AuthUser, async (req, res, next) => {
  try {
    const attachmentId = z.string().uuid().parse(req.params.attachmentId);
    const data = await getAttachmentDownload(attachmentId, req.user!);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default chatRouter;
