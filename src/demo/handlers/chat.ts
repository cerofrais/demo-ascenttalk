/** Internal team chat: channels, DMs, threads and reactions (apps/api/src/routes/chat.ts). */
import type { ChatChannel, ChatMessage } from '@/lib/api';
import { canSeeConversation, isAdmin, type Viewer } from '../access';
import { DRIVE_TITLES } from '../content';
import { hooks, notifyUsers, recordActivity } from '../core';
import { claimUploads } from '../files';
import { badRequest, forbidden, invalid, isStr, isStrArray, need, notFound, optional, qnum, qstr, route } from '../http';
import { emit, rooms } from '../realtime';
import { channelUnread, serializeChannel, serializeChatMessage } from '../serialize';
import { db, newId, nowIso, touch, type DChannel, type DChannelMember, type DChatMessage } from '../store';
import { driveMetaFor } from '../util';

/** loadChannelFor(): members always; anyone but guests may read (and, by posting, join) a public channel. */
function loadChannelFor(user: Viewer, id: string, opts: { write?: boolean } = {}): { channel: DChannel; member: DChannelMember | undefined } {
  const channel = db().channels.find((c) => c.id === id);
  if (!channel) throw notFound('Channel');
  let member = channel.members.find((m) => m.userId === user.id);
  if (!member) {
    if (channel.kind !== 'PUBLIC' || user.role === 'GUEST') throw notFound('Channel');
    if (opts.write) {
      const now = nowIso();
      member = { userId: user.id, isAdmin: false, lastReadAt: now, muted: false, joinedAt: now };
      channel.members.push(member);
      touch();
      emit(rooms.user(user.id), 'chat.channel.joined', { channelId: id });
    }
  }
  if (opts.write && channel.archived) throw badRequest('This channel is archived');
  return { channel, member };
}

function broadcastChannel(channelId: string): void {
  const ch = db().channels.find((c) => c.id === channelId);
  if (!ch) return;
  for (const m of ch.members) emit(rooms.user(m.userId), 'chat.channel.updated', serializeChannel(ch, m.userId, { membership: m }));
}

function newChatMessage(over: Partial<DChatMessage> & { channelId: string }): DChatMessage {
  return { id: newId('cm'), userId: null, content: '', parentId: null, replyCount: 0, lastReplyAt: null, mentions: [], meta: {}, attachmentIds: [], reactions: [], editedAt: null, deletedAt: null, createdAt: nowIso(), ...over };
}

/** Posts a message as `user` and emits what the API emits. Also used by the teammate simulation. */
export function postChatMessage(user: { id: string; name: string }, channel: DChannel, input: { content: string; parentId?: string | null; mentions?: string[]; attachmentIds?: string[]; meta?: Record<string, any> }): DChatMessage {
  const s = db();
  const now = nowIso();
  const drive = driveMetaFor(input.content, DRIVE_TITLES);
  const msg = newChatMessage({
    channelId: channel.id,
    userId: user.id,
    content: input.content.trim(),
    parentId: input.parentId ?? null,
    mentions: input.mentions ?? [],
    meta: { ...(drive.length ? { driveLinks: drive } : {}), ...(input.meta ?? {}) },
    attachmentIds: input.attachmentIds ?? [],
    createdAt: now,
  });
  for (const id of msg.attachmentIds) {
    const a = s.attachments.find((x) => x.id === id);
    if (a) a.chatMessageId = msg.id;
  }
  s.chatMessages.push(msg);
  const parent = input.parentId ? s.chatMessages.find((m) => m.id === input.parentId) : undefined;
  if (parent) {
    parent.replyCount += 1;
    parent.lastReplyAt = now;
  } else channel.lastMessageAt = now;
  const membership = channel.members.find((m) => m.userId === user.id);
  if (membership) membership.lastReadAt = now;
  touch();

  const payload = serializeChatMessage(msg);
  emit(rooms.channel(channel.id), 'chat.message.created', payload);
  for (const m of channel.members) emit(rooms.user(m.userId), 'chat.activity', { channelId: channel.id, messageId: msg.id, userId: user.id, parentId: msg.parentId });
  if (parent) emit(rooms.channel(channel.id), 'chat.message.updated', serializeChatMessage(parent));

  // Notifications: DMs notify everyone, channels notify mentions.
  const mentions = input.mentions ?? [];
  const isDm = channel.kind === 'DM' || channel.kind === 'GROUP_DM';
  const unmuted = channel.members.filter((m) => !m.muted).map((m) => m.userId);
  const targets = isDm ? unmuted : mentions.includes('channel') ? unmuted : mentions.filter((m) => m !== 'channel');
  if (targets.length) {
    notifyUsers(targets, { type: isDm ? 'dm' : 'chat_mention', title: `${user.name} ${isDm ? 'sent you a message' : `mentioned you in #${channel.name}`}`, body: input.content.slice(0, 200), link: `/chat/${channel.id}${input.parentId ? `?thread=${input.parentId}` : ''}` }, user.id);
  }
  return msg;
}

export function toggleReaction(userId: string, msg: DChatMessage, emoji: string): void {
  const i = msg.reactions.findIndex((r) => r.userId === userId && r.emoji === emoji);
  if (i >= 0) msg.reactions.splice(i, 1);
  else msg.reactions.push({ emoji, userId });
  touch();
  emit(rooms.channel(msg.channelId), 'chat.message.updated', serializeChatMessage(msg));
}

route('GET', '/chat/channels', ({ me }): { channels: ChatChannel[] } => {
  const s = db();
  const channels = s.channels
    .filter((c) => !c.archived)
    .flatMap((c) => {
      const membership = c.members.find((m) => m.userId === me.id);
      return membership ? [serializeChannel(c, me.id, { membership, unread: channelUnread(c, membership, s) })] : [];
    })
    .sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));
  return { channels };
});

route('GET', '/chat/channels/browse', ({ me }): { channels: ChatChannel[] } => {
  if (me.role === 'GUEST') return { channels: [] };
  const channels = db()
    .channels.filter((c) => c.kind === 'PUBLIC' && !c.archived && !c.members.some((m) => m.userId === me.id))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  return { channels: channels.map((c) => serializeChannel(c, me.id, { withMembers: false })) };
});

route('POST', '/chat/channels', ({ me, body }) => {
  const s = db();
  if (me.role === 'GUEST') throw forbidden('Guests cannot create channels');
  const rawName = need(body, 'name');
  if (rawName.length > 60) throw invalid('name');
  const name = rawName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
  const kind = body.kind === undefined ? 'PUBLIC' : body.kind;
  if (kind !== 'PUBLIC' && kind !== 'PRIVATE') throw invalid('kind');
  const topic = optional(body, 'topic');
  const description = optional(body, 'description');
  const clientId = optional(body, 'clientId');
  if (body.memberIds !== undefined && !isStrArray(body.memberIds)) throw invalid('memberIds');
  if (!name) throw badRequest('Channel name is required');
  if (s.channels.some((c) => c.name === name && (c.kind === 'PUBLIC' || c.kind === 'PRIVATE') && !c.archived)) throw badRequest(`#${name} already exists`);
  const memberIds = [...new Set<string>([me.id, ...(body.memberIds ?? [])])].filter((id) => s.users.some((u) => u.id === id));
  const now = nowIso();
  const ch: DChannel = {
    id: newId('ch'),
    name,
    kind,
    topic: topic ?? null,
    description: description ?? null,
    clientId: clientId && s.clients.some((c) => c.id === clientId) ? clientId : null,
    dmKey: null,
    createdById: me.id,
    archived: false,
    lastMessageAt: now,
    createdAt: now,
    members: memberIds.map((userId) => ({ userId, isAdmin: userId === me.id, lastReadAt: now, muted: false, joinedAt: now })),
  };
  s.channels.push(ch);
  s.chatMessages.push(newChatMessage({ channelId: ch.id, content: `${me.name} created #${ch.name}`, meta: { system: true } }));
  touch();
  for (const uid of memberIds) emit(rooms.user(uid), 'chat.channel.joined', { channelId: ch.id });
  broadcastChannel(ch.id);
  recordActivity({ type: 'chat.channel_created', summary: `${me.name} created ${kind === 'PRIVATE' ? 'private ' : ''}channel #${ch.name}`, actorUserId: me.id, clientId: ch.clientId });
  return { channel: { id: ch.id } };
});

route('POST', '/chat/dm', ({ me, body }) => {
  const s = db();
  if (!isStrArray(body.userIds) || !body.userIds.length || body.userIds.length > 8) throw invalid('userIds');
  const ids = [...new Set<string>([me.id, ...body.userIds])].sort();
  if (ids.some((id) => !s.users.some((u) => u.id === id && u.active))) throw badRequest('Unknown user');
  const dmKey = ids.join(':');
  let ch = s.channels.find((c) => c.dmKey === dmKey);
  if (!ch) {
    const now = nowIso();
    ch = { id: newId('ch-dm'), name: null, kind: ids.length <= 2 ? 'DM' : 'GROUP_DM', topic: null, description: null, clientId: null, dmKey, createdById: me.id, archived: false, lastMessageAt: now, createdAt: now, members: ids.map((userId) => ({ userId, isAdmin: false, lastReadAt: now, muted: false, joinedAt: now })) };
    s.channels.push(ch);
    touch();
    for (const uid of ids) emit(rooms.user(uid), 'chat.channel.joined', { channelId: ch.id });
  }
  return { channel: { id: ch.id } };
});

route('GET', '/chat/channels/:id', ({ me, params }): { channel: ChatChannel & { pinnedCount: number } } => {
  const { channel, member } = loadChannelFor(me, params.id);
  return { channel: { ...serializeChannel(channel, me.id, { membership: member }), pinnedCount: 0 } };
});

route('PATCH', '/chat/channels/:id', ({ me, params, body }) => {
  const s = db();
  const { channel, member } = loadChannelFor(me, params.id);
  if (channel.kind === 'DM' || channel.kind === 'GROUP_DM') throw badRequest('DMs cannot be edited');
  if (!member?.isAdmin && !isAdmin(me) && channel.createdById !== me.id && me.role !== 'MANAGER') throw forbidden();
  if (body.name !== undefined) channel.name = need(body, 'name').toLowerCase().replace(/\s+/g, '-');
  const topic = optional(body, 'topic');
  if (topic !== undefined) channel.topic = topic;
  const description = optional(body, 'description');
  if (description !== undefined) channel.description = description;
  if (typeof body.archived === 'boolean') channel.archived = body.archived;
  const clientId = optional(body, 'clientId');
  if (clientId !== undefined) channel.clientId = clientId && s.clients.some((c) => c.id === clientId) ? clientId : null;
  touch();
  broadcastChannel(channel.id);
  return { ok: true };
});

route('POST', '/chat/channels/:id/join', ({ me, params }) => {
  const ch = db().channels.find((c) => c.id === params.id);
  if (!ch || ch.kind !== 'PUBLIC' || me.role === 'GUEST') throw notFound('Channel');
  if (!ch.members.some((m) => m.userId === me.id)) {
    const now = nowIso();
    ch.members.push({ userId: me.id, isAdmin: false, lastReadAt: now, muted: false, joinedAt: now });
    touch();
  }
  emit(rooms.user(me.id), 'chat.channel.joined', { channelId: ch.id });
  broadcastChannel(ch.id);
  return { ok: true };
});

route('POST', '/chat/channels/:id/leave', ({ me, params }) => {
  const ch = db().channels.find((c) => c.id === params.id);
  if (ch) {
    ch.members = ch.members.filter((m) => m.userId !== me.id);
    touch();
  }
  emit(rooms.user(me.id), 'chat.channel.left', { channelId: params.id });
  broadcastChannel(params.id);
  return { ok: true };
});

route('POST', '/chat/channels/:id/members', ({ me, params, body }) => {
  const s = db();
  const { channel } = loadChannelFor(me, params.id);
  if (channel.kind === 'DM') throw badRequest('Start a group DM instead');
  if (!isStrArray(body.userIds) || !body.userIds.length) throw invalid('userIds');
  const added = s.users.filter((u) => body.userIds.includes(u.id));
  const now = nowIso();
  for (const u of added) if (!channel.members.some((m) => m.userId === u.id)) channel.members.push({ userId: u.id, isAdmin: false, lastReadAt: now, muted: false, joinedAt: now });
  const note = newChatMessage({ channelId: channel.id, content: `${me.name} added ${added.map((u) => u.name).join(', ')}`, meta: { system: true } });
  s.chatMessages.push(note);
  touch();
  for (const u of added) emit(rooms.user(u.id), 'chat.channel.joined', { channelId: channel.id });
  broadcastChannel(channel.id);
  return { ok: true };
});

route('DELETE', '/chat/channels/:id/members/:userId', ({ me, params }) => {
  const { channel, member } = loadChannelFor(me, params.id);
  if (params.userId !== me.id && !member?.isAdmin && !isAdmin(me) && channel.createdById !== me.id) throw forbidden();
  channel.members = channel.members.filter((m) => m.userId !== params.userId);
  touch();
  emit(rooms.user(params.userId), 'chat.channel.left', { channelId: channel.id });
  broadcastChannel(channel.id);
  return { ok: true };
});

route('PATCH', '/chat/channels/:id/mute', ({ me, params, body }) => {
  if (typeof body.muted !== 'boolean') throw invalid('muted');
  const member = db().channels.find((c) => c.id === params.id)?.members.find((m) => m.userId === me.id);
  if (!member) throw notFound();
  member.muted = body.muted;
  touch();
  return { ok: true };
});

route('POST', '/chat/channels/:id/read', ({ me, params }) => {
  const member = db().channels.find((c) => c.id === params.id)?.members.find((m) => m.userId === me.id);
  if (member) {
    member.lastReadAt = nowIso();
    touch();
  }
  emit(rooms.user(me.id), 'chat.read', { channelId: params.id });
  return { ok: true };
});

route('GET', '/chat/channels/:id/messages', ({ me, params, query }): { messages: ChatMessage[]; hasMore: boolean } => {
  const { channel } = loadChannelFor(me, params.id);
  const before = qstr(query, 'before');
  const limit = qnum(query, 'limit', 50, 1, 100);
  const cutoff = before ? new Date(before).toISOString() : null;
  const rows = db()
    .chatMessages.filter((m) => m.channelId === channel.id && !m.parentId && (!cutoff || m.createdAt < cutoff))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { messages: rows.slice(0, limit).reverse().map(serializeChatMessage), hasMore: rows.length > limit };
});

route('GET', '/chat/messages/:id/thread', ({ me, params }): { parent: ChatMessage; replies: ChatMessage[] } => {
  const s = db();
  const parent = s.chatMessages.find((m) => m.id === params.id);
  if (!parent) throw notFound('Message');
  loadChannelFor(me, parent.channelId);
  const replies = s.chatMessages.filter((m) => m.parentId === parent.id).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return { parent: serializeChatMessage(parent), replies: replies.map(serializeChatMessage) };
});

route('POST', '/chat/channels/:id/messages', ({ me, params, body }): { message: ChatMessage } => {
  const { channel } = loadChannelFor(me, params.id, { write: true });
  const content = body.content === undefined ? '' : body.content;
  if (!isStr(content) || content.length > 10000) throw invalid('content');
  const parentId = optional(body, 'parentId');
  if (body.attachmentIds !== undefined && (!isStrArray(body.attachmentIds) || body.attachmentIds.length > 10)) throw invalid('attachmentIds');
  if (body.mentions !== undefined && !isStrArray(body.mentions)) throw invalid('mentions');
  const uploads = claimUploads(body.attachmentIds, me.id);
  if (!content.trim() && !uploads.length) throw badRequest('Message is empty');
  const msg = postChatMessage(me, channel, { content, parentId: parentId || null, mentions: body.mentions, attachmentIds: uploads.map((u) => u.id) });
  hooks.chatMessagePosted?.(msg.id, channel.id, me.id);
  return { message: serializeChatMessage(msg) };
});

route('PATCH', '/chat/messages/:id', ({ me, params, body }): { message: ChatMessage } => {
  const content = need(body, 'content');
  if (content.length > 10000) throw invalid('content');
  const m = db().chatMessages.find((x) => x.id === params.id);
  if (!m || m.deletedAt) throw notFound('Message');
  if (m.userId !== me.id) throw forbidden('You can only edit your own messages');
  m.content = content;
  m.editedAt = nowIso();
  touch();
  const payload = serializeChatMessage(m);
  emit(rooms.channel(m.channelId), 'chat.message.updated', payload);
  return { message: payload };
});

route('DELETE', '/chat/messages/:id', ({ me, params }) => {
  const m = db().chatMessages.find((x) => x.id === params.id);
  if (!m) throw notFound('Message');
  if (m.userId !== me.id && !isAdmin(me)) throw forbidden('You can only delete your own messages');
  m.deletedAt = nowIso();
  touch();
  emit(rooms.channel(m.channelId), 'chat.message.updated', serializeChatMessage(m));
  return { ok: true };
});

route('POST', '/chat/messages/:id/reactions', ({ me, params, body }): { message: ChatMessage } => {
  const emoji = need(body, 'emoji');
  if (emoji.length > 16) throw invalid('emoji');
  const m = db().chatMessages.find((x) => x.id === params.id);
  if (!m) throw notFound('Message');
  loadChannelFor(me, m.channelId);
  toggleReaction(me.id, m, emoji);
  return { message: serializeChatMessage(m) };
});

/** Share a client conversation message into an internal channel. */
route('POST', '/chat/channels/:id/share', ({ me, params, body }): { message: ChatMessage } => {
  const s = db();
  const conversationId = need(body, 'conversationId');
  const comment = optional(body, 'comment');
  if (comment && comment.length > 2000) throw invalid('comment');
  const conv = s.conversations.find((c) => c.id === conversationId);
  if (!conv || !canSeeConversation(me, conv, s)) throw notFound('Conversation');
  const contact = conv.contactId ? s.contacts.find((c) => c.id === conv.contactId) : undefined;
  const inbox = s.inboxes.find((i) => i.id === conv.inboxId);
  const quoted = isStr(body.messageId) ? s.messages.find((m) => m.id === body.messageId) : undefined;
  const content = [comment?.trim(), `> 💬 ${conv.groupName ?? contact?.name ?? 'Conversation'} · ${inbox?.name} (#${conv.displayId})`, quoted?.content ? `> ${quoted.content.slice(0, 500).replace(/\n/g, '\n> ')}` : null].filter(Boolean).join('\n');
  const { channel } = loadChannelFor(me, params.id, { write: true });
  const now = nowIso();
  const m = newChatMessage({ channelId: channel.id, userId: me.id, content, meta: { sharedConversation: { id: conv.id, displayId: conv.displayId, messageId: quoted?.id ?? null } }, createdAt: now });
  s.chatMessages.push(m);
  channel.lastMessageAt = now;
  touch();
  const payload = serializeChatMessage(m);
  emit(rooms.channel(channel.id), 'chat.message.created', payload);
  for (const mem of channel.members) emit(rooms.user(mem.userId), 'chat.activity', { channelId: channel.id, messageId: m.id, userId: me.id });
  return { message: payload };
});
