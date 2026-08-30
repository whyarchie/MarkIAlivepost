import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { verifyAuthToken } from "../../middleware/Auth";
import { authorizeCondition } from "./chat.service";
import { conditionIdSchema } from "./chat.schema";

let chatIo: Server | undefined;

function cookieToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === "token") return decodeURIComponent(valueParts.join("="));
  }
  return undefined;
}

function bearerToken(value: string | undefined): string | undefined {
  return value?.match(/^Bearer\s+(.+)$/i)?.[1];
}

function room(conditionId: number) {
  return `chat:condition:${conditionId}`;
}

function userRoom(role: "Patient" | "Hospital", id: number) {
  return `chat:user:${role}:${id}`;
}

export function initializeChatSocket(
  server: HttpServer,
  allowedOrigins: string[],
) {
  const io = new Server(server, {
    path: "/socket.io",
    cors: { origin: allowedOrigins, credentials: true },
  });

  io.use((socket, next) => {
    try {
      const authToken =
        (typeof socket.handshake.auth?.token === "string"
          ? socket.handshake.auth.token
          : undefined) ||
        bearerToken(socket.handshake.headers.authorization) ||
        cookieToken(socket.handshake.headers.cookie);
      if (!authToken) return next(new Error("Authentication required"));
      socket.data.user = verifyAuthToken(authToken);
      next();
    } catch {
      next(new Error("Invalid or expired authentication token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as AuthUserType;
    if (user.role === "Patient" || user.role === "Hospital") {
      void socket.join(userRoom(user.role, user.id));
    }
    socket.on(
      "chat:join",
      async (
        payload: { conditionId?: number },
        acknowledge?: (response: { success: boolean; message?: string }) => void,
      ) => {
        try {
          const conditionId = conditionIdSchema.parse(payload?.conditionId);
          await authorizeCondition(conditionId, socket.data.user as AuthUserType);
          await socket.join(room(conditionId));
          acknowledge?.({ success: true });
        } catch (error: any) {
          acknowledge?.({ success: false, message: error?.message || "Unable to join chat" });
        }
      },
    );
    socket.on("chat:leave", (payload: { conditionId?: number }) => {
      const parsed = conditionIdSchema.safeParse(payload?.conditionId);
      if (parsed.success) void socket.leave(room(parsed.data));
    });
  });

  chatIo = io;
  return io;
}

export function emitChatEvent(
  conditionId: number,
  event: "message:new" | "thread:updated" | "thread:read",
  payload: unknown,
  participants?: { patientId: number; hospitalId: number },
) {
  if (!chatIo) return;
  let recipients = chatIo.to(room(conditionId));
  if (participants) {
    recipients = recipients
      .to(userRoom("Patient", participants.patientId))
      .to(userRoom("Hospital", participants.hospitalId));
  }
  recipients.emit(event, payload);
}
