/**
 * Realtime events. The API publishes to Socket.IO rooms (lib/realtime.ts) and a browser only receives what the
 * rooms it joined carry (socket.ts). Here there is exactly one "connected" browser, the current persona, so an
 * event is put on the in-page bus only when that persona would have been in one of the target rooms.
 */
import { demoBus, getDemoPersonaId } from '@/lib/demo';
import type { Presence } from '@/lib/api';
import { isAdmin, isManagerUp, viewerFor, type Viewer } from './access';
import { db, touch, type DConversation } from './store';

export const rooms = {
  user: (id: string) => `user:${id}`,
  team: (id: string) => `team:${id}`,
  inbox: (id: string) => `inbox:${id}`,
  conversation: (id: string) => `conversation:${id}`,
  channel: (id: string) => `channel:${id}`,
  visitor: (contactId: string) => `visitor:${contactId}`,
  admins: 'admins',
  oversight: 'oversight',
  everyone: 'everyone',
};

// What the persona's "socket" has subscribed to on this page.
let socketOwner: string | null = null;
let viewingConversation = '';
const joinedChannels = new Set<string>();

/** The persona of this tab, read fresh every time (it can change without a reload). */
export function currentViewer(): Viewer | null {
  const id = getDemoPersonaId();
  if (id !== socketOwner) {
    // a different person "connected": their socket starts with no extra rooms
    socketOwner = id;
    viewingConversation = '';
    joinedChannels.clear();
  }
  if (!id) return null;
  const user = db().users.find((u) => u.id === id && u.active);
  return user ? viewerFor(user) : null;
}

function inRoom(v: Viewer | null, room: string): boolean {
  const s = db();
  const [kind, id] = room.split(/:(.*)/);
  if (kind === 'visitor') return Object.values(s.widgetSessions).includes(id);
  if (!v) return false;
  switch (kind) {
    case 'everyone':
      return true;
    case 'admins':
      return isAdmin(v);
    case 'oversight':
      return isManagerUp(v);
    case 'user':
      return v.id === id;
    case 'team':
      return v.role !== 'GUEST' && v.teamIds.includes(id);
    case 'inbox':
      return Boolean(s.inboxes.find((i) => i.id === id)?.memberIds.includes(v.id));
    case 'conversation':
      return viewingConversation === id;
    case 'channel': {
      const ch = s.channels.find((c) => c.id === id);
      if (!ch) return false;
      if (ch.members.some((m) => m.userId === v.id)) return true;
      // someone reading a public channel they have not joined gets its messages while it is open
      return joinedChannels.has(id) && ch.kind === 'PUBLIC' && v.role !== 'GUEST';
    }
    default:
      return false;
  }
}

/** Same signature as the API's emit(): delivered once if the persona is in any of the rooms. */
export function emit(roomList: string | (string | null | undefined)[], event: string, payload: unknown): void {
  const list = (Array.isArray(roomList) ? roomList : [roomList]).filter((r): r is string => Boolean(r));
  if (!list.length) return;
  const viewer = currentViewer();
  if (list.some((r) => inRoom(viewer, r))) demoBus.toClient.emit(event, clone(payload));
}

/** Events are handed over as plain copies, as if they had crossed the wire. */
function clone<T>(payload: T): T {
  return payload === undefined ? payload : (JSON.parse(JSON.stringify(payload)) as T);
}

/** Every room whose members are allowed to see this conversation (conversationRooms in the API). */
export function conversationRooms(c: DConversation): string[] {
  const s = db();
  const inbox = s.inboxes.find((i) => i.id === c.inboxId);
  const client = c.clientId ? s.clients.find((x) => x.id === c.clientId) : undefined;
  const set = new Set<string>([rooms.admins, rooms.inbox(c.inboxId)]);
  if (c.assigneeId) set.add(rooms.user(c.assigneeId));
  if (c.teamId) set.add(rooms.team(c.teamId));
  if (inbox?.teamId) set.add(rooms.team(inbox.teamId));
  if (client?.teamId) set.add(rooms.team(client.teamId));
  if (client?.accountManagerId) set.add(rooms.user(client.accountManagerId));
  for (const p of c.participantIds) set.add(rooms.user(p));
  return [...set];
}

// ─── Presence ────────────────────────────────────────────────────────────────

/**
 * The persona is online (or whatever they picked). Everyone else keeps the status from the data set, unless
 * they picked one themselves while someone played them (in this tab earlier, or in another tab right now).
 */
export function presenceOf(userId: string): Presence {
  const s = db();
  if (userId === getDemoPersonaId()) return s.manualPresence[userId] ?? 'ONLINE';
  const user = s.users.find((u) => u.id === userId);
  if (!user || !user.active || user.presence === 'OFFLINE') return 'OFFLINE';
  return s.manualPresence[userId] ?? user.presence;
}

export function setManualPresence(userId: string, status: Presence | null): void {
  const s = db();
  if (!status || status === 'ONLINE') delete s.manualPresence[userId];
  else s.manualPresence[userId] = status;
  touch();
  emit(rooms.everyone, 'presence', { userId, status: presenceOf(userId) });
}

// ─── What the browser sends over the socket ──────────────────────────────────

let listening = false;

export function startRealtime(): void {
  if (listening) return;
  listening = true;
  demoBus.toServer.on('conversation.view', (id: unknown) => {
    currentViewer();
    viewingConversation = typeof id === 'string' ? id : '';
  });
  demoBus.toServer.on('channel.join', (id: unknown) => {
    currentViewer();
    if (typeof id === 'string' && id) joinedChannels.add(id);
  });
  demoBus.toServer.on('presence.set', (status: unknown) => {
    const v = currentViewer();
    if (v && (status === 'ONLINE' || status === 'AWAY' || status === 'BUSY')) setManualPresence(v.id, status);
  });
  demoBus.toServer.on('typing', (p: { scope?: string; id?: string; isPrivate?: boolean } | undefined) => {
    // Nobody else is connected to see the persona typing, except a website visitor in the widget.
    const v = currentViewer();
    if (!v || !p?.id || p.scope !== 'conversation' || p.isPrivate) return;
    const s = db();
    const conv = s.conversations.find((c) => c.id === p.id);
    const inbox = conv && s.inboxes.find((i) => i.id === conv.inboxId);
    if (conv?.contactId && inbox?.channelType === 'WEBSITE') emit(rooms.visitor(conv.contactId), 'widget.typing', { name: v.name });
  });
  demoBus.toServer.on('widget.typing', () => {
    // A visitor typing in the widget shows up in the open conversation, as on the real socket.
    const s = db();
    for (const contactId of Object.values(s.widgetSessions)) {
      const conv = s.conversations.filter((c) => c.contactId === contactId && s.inboxes.find((i) => i.id === c.inboxId)?.channelType === 'WEBSITE').sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1))[0];
      if (conv) emit(rooms.conversation(conv.id), 'typing', { scope: 'conversation', id: conv.id, contact: true });
    }
  });
}
