import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { env } from "../config/env";
import { verifyInitData, TelegramUser } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { createMessage } from "../services/messages";
import { notifyNewMessage } from "../bot/notify";

let io: Server | null = null;

// Tracks which chat (matchId) each connected user is currently viewing, so we
// only send a Telegram notification when they're NOT looking at that chat.
const activeChatByUser = new Map<string, string>();

/** Room name for a given app user id. */
const userRoom = (userId: string) => `user:${userId}`;

interface AuthedSocket extends Socket {
  appUserId?: string;
}

/**
 * Initialise Socket.io on the shared HTTP server. Every socket must present a
 * valid Telegram initData string in the handshake auth — same validation used
 * for REST requests. We never trust a client-sent user id.
 */
export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",") },
    path: "/socket.io",
  });

  io.use(async (socket: AuthedSocket, nextFn) => {
    try {
      const initData: string | undefined =
        socket.handshake.auth?.initData || socket.handshake.headers["x-telegram-init-data"];
      if (!initData) return nextFn(new Error("missing_init_data"));

      const parsed = verifyInitData(initData, env.BOT_TOKEN);
      if (!parsed?.user) return nextFn(new Error("invalid_init_data"));

      const tgUser = JSON.parse(parsed.user) as TelegramUser;
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(tgUser.id) },
      });
      if (!user || user.isBanned) return nextFn(new Error("unauthorized"));

      socket.appUserId = user.id;
      nextFn();
    } catch {
      nextFn(new Error("auth_failed"));
    }
  });

  io.on("connection", (socket: AuthedSocket) => {
    const userId = socket.appUserId!;
    void socket.join(userRoom(userId));

    // Mark online.
    void prisma.user
      .update({ where: { id: userId }, data: { isOnline: true, lastSeenAt: new Date() } })
      .catch(() => undefined);

    // Send a message.
    socket.on(
      "message:send",
      async (
        payload: { matchId: string; body: string },
        ack?: (res: unknown) => void,
      ) => {
        const result = await createMessage(payload.matchId, userId, payload.body);
        if (!result.ok || !result.message) {
          ack?.({ ok: false, error: result.error });
          return;
        }

        // Deliver to recipient (if connected) and echo back to sender.
        io?.to(userRoom(result.recipientId!)).emit("message:new", result.message);
        ack?.({ ok: true, message: result.message });

        // Send a Telegram notification unless the recipient is actively
        // viewing THIS chat right now.
        if (!isUserViewingChat(result.recipientId!, payload.matchId)) {
          void notifyNewMessage(result.recipientId!);
        }
      },
    );

    // Track which chat the user currently has open.
    socket.on("chat:open", (payload: { matchId: string }) => {
      if (payload?.matchId) activeChatByUser.set(userId, payload.matchId);
    });
    socket.on("chat:close", () => {
      activeChatByUser.delete(userId);
    });

    // Typing indicator (best-effort, not persisted).
    socket.on("typing", (payload: { matchId: string; recipientId: string }) => {
      if (payload?.recipientId) {
        io?.to(userRoom(payload.recipientId)).emit("typing", {
          matchId: payload.matchId,
          fromUserId: userId,
        });
      }
    });

    socket.on("disconnect", () => {
      activeChatByUser.delete(userId);
      void prisma.user
        .update({ where: { id: userId }, data: { isOnline: false, lastSeenAt: new Date() } })
        .catch(() => undefined);
    });
  });

  return io;
}

/** Emit an event to a specific app user's room (used by REST fallback). */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}

/** Whether a user currently has a specific chat (match) open. */
export function isUserViewingChat(userId: string, matchId: string): boolean {
  return activeChatByUser.get(userId) === matchId;
}
