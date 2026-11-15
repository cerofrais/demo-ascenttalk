'use client';
import { io, type Socket } from 'socket.io-client';
import { DEMO_MODE, createDemoSocket } from './demo';

let socket: Socket | null = null;

/** Same-origin in docker (Caddy). In `next dev`, set NEXT_PUBLIC_SOCKET_URL=http://localhost:4000. */
export function getSocket(): Socket {
  if (socket) return socket;
  // Demo builds have no server: events come from the in-browser mock backend instead.
  if (DEMO_MODE) return (socket = createDemoSocket() as unknown as Socket);
  const url = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  socket = io(url, { path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'], autoConnect: true });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
