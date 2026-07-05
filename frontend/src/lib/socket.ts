import { io, Socket } from "socket.io-client";
import { getInitData } from "./telegram";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

let socket: Socket | null = null;

/**
 * Lazily create the Socket.io connection, authenticating with the raw
 * Telegram initData in the handshake (validated server-side).
 */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(BASE_URL, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    auth: { initData: getInitData() },
    autoConnect: true,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
