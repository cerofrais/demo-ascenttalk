/**
 * Keeps several tabs (and the website widget's iframe) in step. They all share one saved state; when another
 * one saves, store.ts adopts it and this module tells the open screens what changed, using the same realtime
 * events the API would have sent, so two tabs playing two different roles see each other's work.
 */
import { demoBus, getDemoPersonaId } from '@/lib/demo';
import { broadcastMessage, serializeActivity } from './core';
import { conversationRooms, currentViewer, emit, presenceOf, rooms } from './realtime';
import { channelUnread, serializeCall, serializeChannel, serializeChatMessage, serializeConversation, serializeUser } from './serialize';
import { startStorageSync, type DemoState } from './store';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const index = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

/**
 * Events whose only effect in the UI is "fetch this again". Their payloads name no record, so the handlers
 * that patch a single open record ignore them. `notification` and `activity` are not in this list on purpose:
 * the UI shows their payload (a toast, a feed row), so those are only ever sent for real new rows.
 */
export function emitRefresh(): void {
  // (checked without touching the state: right after a reset there is none, and asking would regenerate it)
  if (!getDemoPersonaId()) return;
  demoBus.toClient.emit('conversation.updated', { id: '' });
  demoBus.toClient.emit('chat.activity', { channelId: '' });
  demoBus.toClient.emit('chat.channel.updated', { id: '' });
}

function emitDifferences(prev: DemoState, next: DemoState): void {
  const viewer = currentViewer();

  // Client conversations: new and changed messages, then the conversations themselves
  const oldMessages = index(prev.messages);
  for (const m of next.messages) {
    const old = oldMessages.get(m.id);
    if (!old) broadcastMessage(m.conversationId, m.id);
    else if (old.status !== m.status || old.error !== m.error || old.content !== m.content || old.deletedAt !== m.deletedAt) broadcastMessage(m.conversationId, m.id, 'message.updated');
  }
  const oldConversations = index(prev.conversations);
  for (const c of next.conversations) {
    const old = oldConversations.get(c.id);
    if (old && same(old, c)) continue;
    emit([...conversationRooms(c), ...(old ? conversationRooms(old) : [])], 'conversation.updated', serializeConversation(c));
  }

  // Team chat
  const oldChat = index(prev.chatMessages);
  for (const m of next.chatMessages) {
    const old = oldChat.get(m.id);
    if (old && same(old, m)) continue;
    emit(rooms.channel(m.channelId), old ? 'chat.message.updated' : 'chat.message.created', serializeChatMessage(m));
    if (!old) {
      const ch = next.channels.find((c) => c.id === m.channelId);
      emit((ch?.members ?? []).map((mem) => rooms.user(mem.userId)), 'chat.activity', { channelId: m.channelId, messageId: m.id, userId: m.userId, parentId: m.parentId });
    }
  }
  if (viewer) {
    const oldChannels = index(prev.channels);
    for (const ch of next.channels) {
      const old = oldChannels.get(ch.id);
      if (old && same(old, ch)) continue;
      const member = ch.members.find((m) => m.userId === viewer.id);
      const was = old?.members.some((m) => m.userId === viewer.id) ?? false;
      if (member && !was) emit(rooms.user(viewer.id), 'chat.channel.joined', { channelId: ch.id });
      if (!member && was) emit(rooms.user(viewer.id), 'chat.channel.left', { channelId: ch.id });
      if (member) emit(rooms.user(viewer.id), 'chat.channel.updated', serializeChannel(ch, viewer.id, { membership: member, unread: channelUnread(ch, member, next) }));
    }
  }

  // Bell and oversight feed: only rows that did not exist before
  const oldNotifications = new Set(prev.notifications.map((n) => n.id));
  for (const n of next.notifications) if (!oldNotifications.has(n.id)) emit(rooms.user(n.userId), 'notification', n);
  const oldActivity = new Set(prev.activity.map((e) => e.id));
  for (const e of next.activity) if (!oldActivity.has(e.id)) emit(rooms.oversight, 'activity', serializeActivity(e));

  // People, presence, inboxes, calls
  const oldUsers = index(prev.users);
  for (const u of next.users) if (!same(oldUsers.get(u.id), u)) emit(rooms.everyone, 'user.updated', serializeUser(u, false));
  for (const id of new Set([...Object.keys(prev.manualPresence), ...Object.keys(next.manualPresence)])) {
    if (prev.manualPresence[id] !== next.manualPresence[id]) emit(rooms.everyone, 'presence', { userId: id, status: presenceOf(id) });
  }
  const oldInboxes = index(prev.inboxes);
  let directoryChanged = !same(prev.labels, next.labels) || !same(prev.teams, next.teams) || !same(prev.workspace, next.workspace);
  for (const i of next.inboxes) {
    if (same(oldInboxes.get(i.id), i)) continue;
    emit(rooms.everyone, 'inbox.updated', { id: i.id, status: i.status, statusDetail: i.statusDetail });
    directoryChanged = false;
  }
  for (const i of prev.inboxes) if (!next.inboxes.some((x) => x.id === i.id)) emit(rooms.everyone, 'inbox.deleted', { id: i.id });
  // labels, teams and the workspace name travel with the bootstrap data, which the UI reloads on this event
  if (directoryChanged) emit(rooms.everyone, 'inbox.updated', { id: '', status: '' });
  const oldCalls = index(prev.calls);
  for (const k of next.calls) {
    if (!same(oldCalls.get(k.id), k)) emit([rooms.admins, rooms.oversight, k.userId ? rooms.user(k.userId) : null], 'call.updated', serializeCall(k));
  }
}

let started = false;

export function startSync(): void {
  if (started) return;
  started = true;
  startStorageSync((prev, next) => {
    try {
      // Same data set on both sides: say exactly what changed. Otherwise (reset, first load) just refetch.
      if (prev && next && prev.baseTime === next.baseTime) emitDifferences(prev, next);
    } catch (err) {
      console.warn('[demo] could not work out what another tab changed', err);
    }
    emitRefresh();
  });
}
