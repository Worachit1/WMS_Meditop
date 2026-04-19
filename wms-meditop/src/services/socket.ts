import { io } from "socket.io-client";

export const socket = io("http:/192.168.1.140:8080", {
  path: "/socket.io",
  transports: ["websocket"],
  withCredentials: true,
  autoConnect: true, // ✅ ให้ต่อทันที
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 500,
});

// socket.on("connect", () => console.log("🟢 socket connected:", socket.id));
// socket.on("connect_error", (err) => console.log("🔴 connect_error:", err.message));
// socket.on("disconnect", (reason) => console.log("🔴 socket disconnected:", reason));





//192.168.1.109
//192.168.1.120
