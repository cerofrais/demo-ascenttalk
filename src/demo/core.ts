/**
 * The operations behind the conversation endpoints, ported from apps/api/src/services/conversations.ts and the
 * lib/ helpers it uses (notify, activity, audit). They change the state and emit the same realtime events.
 */
import type { ChannelType, ConversationStatus, Priority } from '@/lib/api';
import type { Viewer } from './access';
import { claimUploads, serializeAttachment } from './files';
import { badRequest, notFound } from './http';
import { conversationRooms, emit, rooms } from './realtime';
import { serializeConversation, serializeMessage } from './serialize';
import { db, newId, nowIso, touch, type DActivity, type DAttachment, type DContact, type DConversation, type DInbox, type DMessage, type DNotification } from './store';
import { DRIVE_TITLES } from './content';
import { driveMetaFor, preview } from './util';

/** Set by simulate.ts, so the "life" of the demo can react without this file knowing about it. */
export const hooks: {
  agentMessageSent?: (message: DMessage, conversation: DConversation) => void;
  chatMessagePosted?: (messageId: string, channelId: string, userId: string) => void;
  /** A real person wrote in the website widget. */
  visitorMessage?: (conversationId: string, messageId: string) => void;
} = {};

// ─── Activity feed, audit log, notifications ────────────────────────────────

export function serializeActivity(e: DActivity) {
  const s = db();
  const actor = e.actorUserId ? s.users.find((u) => u.id === e.actorUserId) : undefined;
  const client = e.clientId ? s.clients.find((c) => c.id === e.clientId) : undefined;
  return { ...e, actor: actor ? { id: actor.id, name: actor.name, avatarKey: null } : null, client: client ? { id: client.id, name: client.name } : null };
}

export function recordActivity(input: { type: string; summary: string; actorUserId?: string | null; conversationId?: string | null; clientId?: string | null; inboxId?: string | null; channelType?: ChannelType | null; data?: Record<string, any> }): void {
  const s = db();
  const row: DActivity = {
    id: newId('ev'),
    type: input.type,
    summary: input.summary.slice(0, 500),
    actorUserId: input.actorUserId ?? null,
    conversationId: input.conversationId ?? null,
    clientId: input.clientId ?? null,
    inboxId: input.inboxId ?? null,
    channelType: input.channelType ?? null,
    data: input.data ?? {},
    createdAt: nowIso(),
  };
  s.activity.push(row);
  if (s.activity.length > 800) s.activity.splice(0, s.activity.length - 800);
  touch();
  emit(rooms.oversight, 'activity', serializeActivity(row));
}

/** Requests in the demo come from the visitor's own browser; this documentation-range address stands in for it. */
const DEMO_IP = '198.51.100.24';

export function audit(actorId: string | null, action: string, target?: { type?: string; id?: string | null }, data: Record<string, any> = {}): void {
  const s = db();
  s.audit.push({ id: newId('al'), actorId, action, targetType: target?.type ?? null, targetId: target?.id ?? null, ip: DEMO_IP, data, createdAt: nowIso() });
  if (s.audit.length > 500) s.audit.splice(0, s.audit.length - 500);
  touch();
}

export interface NotifyInput {
  type: 'assigned' | 'mention' | 'new_message' | 'missed_call' | 'chat_mention' | 'dm' | 'voicemail' | 'system';
  title: string;
  body?: string | null;
  link?: string | null;
}

export function notifyUsers(userIds: (string | null | undefined)[], input: NotifyInput, exceptUserId?: string): void {
  const s = db();
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x) && x !== exceptUserId))];
  for (const userId of ids) {
    if (!s.users.some((u) => u.id === userId)) continue;
    const n: DNotification = { id: newId('n'), userId, type: input.type, title: input.title.slice(0, 200), body: input.body?.slice(0, 500) ?? null, link: input.link ?? null, data: {}, readAt: null, createdAt: nowIso() };
    s.notifications.push(n);
    emit(rooms.user(userId), 'notification', n);
  }
  if (s.notifications.length > 600) s.notifications.splice(0, s.notifications.length - 600);
  touch();
}

// ─── Broadcasting ────────────────────────────────────────────────────────────

export function findConversation(id: string): DConversation | undefined {
  return db().conversations.find((c) => c.id === id);
}

/** Pushes the latest state of a conversation to everyone allowed to see it. */
export function broadcastConversation(id: string): DConversation | null {
  const c = findConversation(id);
  if (!c) return null;
  emit(conversationRooms(c), 'conversation.updated', serializeConversation(c));
  return c;
}

export function publicWidgetMessage(m: DMessage) {
  const sm = serializeMessage(m);
  return {
    id: sm.id,
    direction: sm.direction,
    content: sm.content,
    senderName: sm.direction === 'OUTGOING' ? (sm.senderUser?.name ?? 'Agent') : null,
    senderAvatar: sm.direction === 'OUTGOING' ? (sm.senderUser?.avatarUrl ?? null) : null,
    attachments: sm.attachments,
    createdAt: sm.createdAt,
  };
}

export function broadcastMessage(conversationId: string, messageId: string, event = 'message.created'): void {
  const s = db();
  const c = findConversation(conversationId);
  const m = s.messages.find((x) => x.id === messageId);
  if (!c || !m) return;
  emit(conversationRooms(c), event, { conversationId, message: serializeMessage(m) });
  const inbox = s.inboxes.find((i) => i.id === c.inboxId);
  if (inbox?.channelType === 'WEBSITE' && m.kind !== 'NOTE' && m.kind !== 'ACTIVITY' && c.contactId) {
    emit(rooms.visitor(c.contactId), 'widget.message', publicWidgetMessage(m));
  }
}

function blankMessage(conversationId: string, over: Partial<DMessage>): DMessage {
  return {
    id: newId('m'),
    conversationId,
    direction: 'OUTGOING',
    kind: 'MESSAGE',
    senderUserId: null,
    senderContactId: null,
    senderName: null,
    content: null,
    contentHtml: null,
    externalId: null,
    replyToId: null,
    status: 'SENT',
    error: null,
    mentions: [],
    meta: {},
    attachmentIds: [],
    callId: null,
    createdAt: nowIso(),
    editedAt: null,
    deletedAt: null,
    ...over,
  };
}

/** The grey "Arjun assigned to Rahul" lines inside a conversation. */
function systemNote(conversationId: string, content: string, actorId?: string | null): void {
  const m = blankMessage(conversationId, { kind: 'ACTIVITY', content, senderUserId: actorId ?? null });
  db().messages.push(m);
  broadcastMessage(conversationId, m.id);
}

// ─── Incoming messages (the simulator and the website widget) ───────────────

export interface IngestInput {
  inbox: DInbox;
  externalThreadId: string;
  conversationId?: string | null;
  threadContact?: DContact | null;
  sender?: DContact | null;
  senderName?: string | null;
  content?: string | null;
  contentHtml?: string | null;
  subject?: string | null;
  meta?: Record<string, any>;
  attachments?: DAttachment[];
}

export function ingestIncoming(input: IngestInput): { message: DMessage; conversation: DConversation; isNew: boolean } {
  const s = db();
  const { inbox } = input;
  const threadContact = input.threadContact ?? null;
  const sender = input.sender ?? threadContact;
  let conversation = input.conversationId ? s.conversations.find((c) => c.id === input.conversationId) : s.conversations.find((c) => c.inboxId === inbox.id && c.externalThreadId === input.externalThreadId);
  let isNew = false;
  const now = nowIso();
  if (!conversation) {
    const clientId = threadContact?.clientId ?? sender?.clientId ?? null;
    const client = clientId ? s.clients.find((c) => c.id === clientId) : undefined;
    const displayId = s.nextDisplayId++;
    conversation = {
      id: `c-${displayId}`,
      displayId,
      inboxId: inbox.id,
      contactId: threadContact?.id ?? null,
      clientId,
      externalThreadId: input.externalThreadId,
      isGroup: false,
      groupName: null,
      subject: input.subject ?? null,
      status: 'OPEN',
      snoozedUntil: null,
      priority: 'NONE',
      assigneeId: null,
      teamId: inbox.teamId ?? client?.teamId ?? null,
      lastMessageAt: now,
      lastMessagePreview: null,
      lastIncomingAt: null,
      lastOutgoingAt: null,
      waitingSince: null,
      firstResponseAt: null,
      resolvedAt: null,
      participantIds: [],
      meta: {},
      labelIds: [],
      createdAt: now,
      updatedAt: now,
    };
    s.conversations.push(conversation);
    isNew = true;
  }
  if (!conversation.clientId && sender?.clientId) conversation.clientId = sender.clientId;

  const files = input.attachments ?? [];
  const drive = driveMetaFor(input.content, DRIVE_TITLES);
  const message = blankMessage(conversation.id, {
    direction: 'INCOMING',
    senderContactId: sender?.id ?? null,
    senderName: input.senderName ?? sender?.name ?? null,
    content: input.content ?? null,
    contentHtml: input.contentHtml ?? null,
    externalId: `sim:${newId('x')}`,
    status: 'RECEIVED',
    meta: { ...(input.meta ?? {}), ...(drive.length ? { driveLinks: drive } : {}) },
    attachmentIds: files.map((f) => f.id),
    createdAt: now,
  });
  for (const f of files) f.messageId = message.id;
  s.messages.push(message);

  conversation.lastMessageAt = now;
  conversation.lastMessagePreview = preview(input.content, files);
  conversation.lastIncomingAt = now;
  conversation.waitingSince ??= now;
  conversation.updatedAt = now;
  // automation.auto_reopen: a reply from the client reopens a pending, snoozed or resolved conversation
  if (conversation.status !== 'OPEN') {
    conversation.status = 'OPEN';
    conversation.snoozedUntil = null;
  }
  touch();

  broadcastMessage(conversation.id, message.id);
  emit(conversationRooms(conversation), 'conversation.updated', serializeConversation(conversation));

  const who = conversation.groupName ?? threadContact?.name ?? 'Contact';
  const from = input.senderName ?? sender?.name ?? who;
  if (conversation.assigneeId && !isNew) {
    notifyUsers([conversation.assigneeId], { type: 'new_message', title: `${input.senderName ?? sender?.name ?? 'Client'} (${inbox.name})`, body: preview(input.content, files), link: `/inbox/${conversation.id}` });
  }
  recordActivity({
    type: 'message.incoming',
    summary: `${from}${conversation.isGroup ? ` in ${who}` : ''}: ${preview(input.content, files)}`,
    conversationId: conversation.id,
    clientId: conversation.clientId,
    inboxId: inbox.id,
    channelType: inbox.channelType,
    data: { messageId: message.id, isNew },
  });
  return { message, conversation, isNew };
}

// ─── Agent actions ───────────────────────────────────────────────────────────

const MESSAGING_CHANNELS: ChannelType[] = ['WHATSAPP', 'EMAIL', 'WEBSITE', 'TELEGRAM', 'FACEBOOK', 'INSTAGRAM', 'SMS'];

export interface SendInput {
  content?: string | null;
  kind?: 'MESSAGE' | 'NOTE';
  attachmentIds?: string[];
  replyToId?: string | null;
  mentions?: string[];
  email?: { cc?: string[]; bcc?: string[]; subject?: string | null; to?: string[] };
}

export function sendAgentMessage(user: Viewer, conversationId: string, input: SendInput): DMessage {
  const s = db();
  const conv = findConversation(conversationId);
  if (!conv) throw notFound('Conversation');
  const inbox = s.inboxes.find((i) => i.id === conv.inboxId)!;
  const contact = conv.contactId ? s.contacts.find((c) => c.id === conv.contactId) : undefined;
  const kind = input.kind ?? 'MESSAGE';
  const content = input.content?.trim() || null;
  const uploads = claimUploads(input.attachmentIds, user.id);
  if (!content && !uploads.length) throw badRequest('Message is empty');
  if (kind === 'MESSAGE' && !MESSAGING_CHANNELS.includes(inbox.channelType)) {
    throw badRequest('This inbox does not support text replies. Use a private note, or reply on another channel.');
  }
  if (kind === 'MESSAGE' && !inbox.enabled) throw badRequest('This inbox is disabled');

  const mentions = [...new Set(input.mentions ?? [])];
  const isWidget = inbox.channelType === 'WEBSITE';
  const drive = driveMetaFor(content, DRIVE_TITLES);
  const now = nowIso();
  const message = blankMessage(conversationId, {
    kind,
    senderUserId: user.id,
    senderName: user.name,
    content,
    replyToId: input.replyToId && s.messages.some((m) => m.id === input.replyToId && m.conversationId === conversationId) ? input.replyToId : null,
    status: kind === 'NOTE' || isWidget ? 'SENT' : 'PENDING',
    mentions,
    meta: { ...(input.email ? { email: input.email } : {}), ...(drive.length ? { driveLinks: drive } : {}) },
    attachmentIds: uploads.map((u) => u.id),
    createdAt: now,
  });
  for (const u of uploads) u.messageId = message.id;
  s.messages.push(message);

  if (kind === 'MESSAGE') {
    conv.lastMessageAt = now;
    conv.lastMessagePreview = preview(content, uploads);
    conv.lastOutgoingAt = now;
    conv.waitingSince = null;
    if (!conv.firstResponseAt && conv.lastIncomingAt) conv.firstResponseAt = now;
    if (!conv.assigneeId && user.role !== 'GUEST') conv.assigneeId = user.id;
    if (conv.status === 'RESOLVED' || conv.status === 'SNOOZED') {
      conv.status = 'OPEN';
      conv.snoozedUntil = null;
    }
  }
  if (mentions.length) conv.participantIds = [...new Set([...conv.participantIds, ...mentions])];
  conv.updatedAt = now;
  touch();

  broadcastMessage(conversationId, message.id);
  broadcastConversation(conversationId);

  if (mentions.length) {
    notifyUsers(mentions, { type: 'mention', title: `${user.name} mentioned you in a ${kind === 'NOTE' ? 'private note' : 'reply'}`, body: content?.slice(0, 200), link: `/inbox/${conversationId}` }, user.id);
  }
  if (kind === 'MESSAGE') {
    recordActivity({
      type: 'message.outgoing',
      summary: `${user.name} replied to ${conv.groupName ?? contact?.name ?? 'contact'} via ${inbox.name}: ${preview(content, uploads)}`,
      actorUserId: user.id,
      conversationId,
      clientId: conv.clientId,
      inboxId: conv.inboxId,
      channelType: inbox.channelType,
    });
    hooks.agentMessageSent?.(message, conv);
  }
  return message;
}

export interface ConversationPatch {
  status?: ConversationStatus;
  snoozedUntil?: string | null;
  priority?: Priority;
  assigneeId?: string | null;
  teamId?: string | null;
  clientId?: string | null;
}

export function updateConversation(user: Viewer | null, id: string, patch: ConversationPatch): DConversation {
  const s = db();
  const conv = findConversation(id);
  if (!conv) throw notFound('Conversation');
  const inbox = s.inboxes.find((i) => i.id === conv.inboxId)!;
  const contact = conv.contactId ? s.contacts.find((c) => c.id === conv.contactId) : undefined;
  const notes: string[] = [];
  const actor = user?.name ?? 'System';
  const changes: Partial<DConversation> = {};

  if (patch.status && patch.status !== conv.status) {
    changes.status = patch.status;
    if (patch.status === 'RESOLVED') {
      changes.resolvedAt = nowIso();
      changes.waitingSince = null;
    }
    if (patch.status === 'SNOOZED') {
      const until = patch.snoozedUntil ? Date.parse(patch.snoozedUntil) : NaN;
      changes.snoozedUntil = new Date(Number.isFinite(until) ? until : Date.now() + 24 * 3600 * 1000).toISOString();
    } else changes.snoozedUntil = null;
    notes.push(patch.status === 'SNOOZED' ? `${actor} snoozed the conversation` : `${actor} marked the conversation as ${patch.status.toLowerCase()}`);
  }
  if (patch.priority && patch.priority !== conv.priority) {
    changes.priority = patch.priority;
    notes.push(`${actor} set priority to ${patch.priority.toLowerCase()}`);
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== conv.assigneeId) {
    const assignee = patch.assigneeId ? s.users.find((u) => u.id === patch.assigneeId) : null;
    if (patch.assigneeId && !assignee?.active) throw badRequest('Assignee not found');
    changes.assigneeId = assignee?.id ?? null;
    notes.push(assignee ? `${actor} assigned to ${assignee.name}` : `${actor} removed the assignee`);
  }
  if (patch.teamId !== undefined && patch.teamId !== conv.teamId) {
    const team = patch.teamId ? s.teams.find((t) => t.id === patch.teamId) : null;
    changes.teamId = team?.id ?? null;
    notes.push(team ? `${actor} moved to team ${team.name}` : `${actor} removed the team`);
  }
  if (patch.clientId !== undefined && patch.clientId !== conv.clientId) {
    const client = patch.clientId ? s.clients.find((c) => c.id === patch.clientId) : null;
    changes.clientId = client?.id ?? null;
    notes.push(client ? `${actor} linked this conversation to client ${client.name}` : `${actor} unlinked the client`);
    // Link the contact too, when it is not linked to any client yet.
    if (client && contact && !contact.clientId) {
      contact.clientId = client.id;
      contact.updatedAt = nowIso();
    }
  }
  if (!Object.keys(changes).length) return conv;

  // The audience before the change must also hear about it (for example a reassignment away from them).
  const before = conversationRooms(conv);
  const hadClient = conv.clientId;
  Object.assign(conv, changes, { updatedAt: nowIso() });
  touch();
  for (const n of notes) systemNote(id, n, user?.id);
  const payload = serializeConversation(conv);
  emit([...new Set([...before, ...conversationRooms(conv)])], 'conversation.updated', payload);

  if (changes.assigneeId && changes.assigneeId !== user?.id) {
    notifyUsers([changes.assigneeId], { type: 'assigned', title: `${actor} assigned you a conversation`, body: conv.groupName ?? contact?.name ?? conv.subject ?? 'Conversation', link: `/inbox/${id}` });
  }
  for (const n of notes) {
    recordActivity({
      type: 'conversation.updated',
      summary: `${n} (${conv.groupName ?? contact?.name ?? 'conversation'} #${conv.displayId})`,
      actorUserId: user?.id,
      conversationId: id,
      clientId: changes.clientId ?? hadClient,
      inboxId: conv.inboxId,
      channelType: inbox.channelType,
    });
  }
  return conv;
}

export function setLabels(id: string, labelIds: string[]): DConversation {
  const s = db();
  const conv = findConversation(id);
  if (!conv) throw notFound('Conversation');
  conv.labelIds = [...new Set(labelIds)].filter((l) => s.labels.some((x) => x.id === l));
  conv.updatedAt = nowIso();
  touch();
  broadcastConversation(id);
  return conv;
}

export function markRead(userId: string, conversationId: string): void {
  db().reads[`${conversationId}:${userId}`] = nowIso();
  touch();
}

/** Start a new outbound conversation with a contact on a chosen inbox. */
export function startConversation(user: Viewer, input: { inboxId: string; contactId: string; content: string; subject?: string | null; attachmentIds?: string[] }): DConversation {
  const s = db();
  const inbox = s.inboxes.find((i) => i.id === input.inboxId);
  if (!inbox) throw notFound('Inbox');
  const contact = s.contacts.find((c) => c.id === input.contactId);
  if (!contact) throw notFound('Contact');

  let threadId: string;
  switch (inbox.channelType) {
    case 'WHATSAPP':
      if (!contact.phone) throw badRequest('Contact has no phone number for WhatsApp');
      threadId = `${contact.phone.replace(/\D/g, '')}@s.whatsapp.net`;
      break;
    case 'EMAIL':
      if (!contact.email) throw badRequest('Contact has no email address');
      threadId = `new:${Date.now()}:${contact.email}`;
      break;
    case 'TELEGRAM':
    case 'FACEBOOK':
    case 'INSTAGRAM': {
      const ident = contact.identities.find((i) => i.channelType === inbox.channelType && i.key.includes(`:${inbox.id}:`));
      if (!ident) throw badRequest(`This contact has not messaged ${inbox.name} yet, so it can't be contacted there first.`);
      threadId = ident.identifier;
      break;
    }
    default:
      throw badRequest('Start a conversation on WhatsApp, Email, Telegram or Meta inboxes');
  }

  let conv = s.conversations.find((c) => c.inboxId === inbox.id && c.externalThreadId === threadId);
  if (!conv) {
    const now = nowIso();
    const displayId = s.nextDisplayId++;
    conv = {
      id: `c-${displayId}`,
      displayId,
      inboxId: inbox.id,
      contactId: contact.id,
      clientId: contact.clientId,
      externalThreadId: threadId,
      isGroup: false,
      groupName: null,
      subject: input.subject ?? null,
      status: 'OPEN',
      snoozedUntil: null,
      priority: 'NONE',
      assigneeId: user.id,
      teamId: inbox.teamId,
      lastMessageAt: now,
      lastMessagePreview: null,
      lastIncomingAt: null,
      lastOutgoingAt: null,
      waitingSince: null,
      firstResponseAt: null,
      resolvedAt: null,
      participantIds: [],
      meta: {},
      labelIds: [],
      createdAt: now,
      updatedAt: now,
    };
    s.conversations.push(conv);
  }
  sendAgentMessage(user, conv.id, {
    content: input.content,
    attachmentIds: input.attachmentIds,
    email: inbox.channelType === 'EMAIL' ? { subject: input.subject ?? null, to: [contact.email!] } : undefined,
  });
  return conv;
}

export { serializeAttachment };
