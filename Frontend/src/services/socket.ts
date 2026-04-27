import { io } from "socket.io-client";

export const socket = io("http:<ip>:<port>}", {
  path: "/socket.io",
  transports: ["websocket"],
  withCredentials: true,
  autoConnect: true, 
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 500,
});
