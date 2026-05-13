import { io } from "socket.io-client";

export const socket = io("http://172.20.10.2:8080", {
  path: "/socket.io",
  transports: ["websocket"],
  withCredentials: true,
  autoConnect: true, // ✅ ให้ต่อทันที
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 500,
});
