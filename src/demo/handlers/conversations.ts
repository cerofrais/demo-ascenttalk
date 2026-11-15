/** Client conversations, labels and canned responses (apps/api/src/routes/conversations.ts). */
import type { ChannelType, Conversation, ConversationStatus, Label, Message, Priority } from '@/lib/api';
import { ADMIN_ROLES, MANAGER_ROLES, canSeeConversation, isManagerUp, visibleConversations, type Viewer } from '../access';
import { audit, broadcastMessage, markRead, sendAgentMessage, setLabels, startConversation, updateConversation, hooks } from '../core';
import { badRequest, conflict, forbidden, invalid, isStr, isStrArray, need, notFound, optional, qenum, qnum, qstr, route } from '../http';
import { serializeConversation, serializeMessage, unreadFor } from '../serialize';
import { db, newId, nowIso, touch, type DConversation, type DemoState } from '../store';
import { includesText } from '../util';

const STATUS = ['OPEN', 'PENDING', 'SNOOZED', 'RESOLVED'] as const;
const PRIORITY = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const CHANNELS = ['WHATSAPP', 'EMAIL', 'VOICE', 'WEBSITE', 'TELEGRAM', 'FACEBOOK', 'INSTAGRAM', 'SMS'] as const;
const TABS = ['mine', 'unassigned', 'all', 'mentions', 'team'] as const;

function inTab(tab: string, u: Viewer, c: DConversation, s: DemoState): boolean {
  switch (tab) {
    case 'mine':
      return c.assigneeId === u.id;
    case 'unassigned':
      return c.assigneeId === null;
    case 'mentions':
      return c.participantIds.includes(u.id);
    case 'team': {
      if (!u.teamIds.length) return false;
      const inbox = s.inboxes.find((i) => i.id === c.inboxId);
      return Boolean((c.teamId && u.teamIds.includes(c.teamId)) || (inbox?.teamId && u.teamIds.includes(inbox.teamId)));
    }
    default:
      return true;
  }
}

/** assertConversationAccess(): a conversation outside the caller's scope looks like it does not exist. */
function accessible(u: Viewer, id: string): DConversation {
  const c = db().conversations.find((x) => x.id === id);
  if (!c || !canSeeConversation(u, c)) throw notFound('Conversation');
  return c;
}

const byDesc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

route('GET', '/conversations', ({ me, query }): { conversations: Conversation[]; nextCursor: string | null } => {
  const s = db();
  const tab = qenum(query, 'tab', TABS, 'all');
  const status = qenum(query, 'status', [...STATUS, 'ALL'] as const, 'OPEN');
  const channelType = qenum<ChannelType>(query, 'channelType', CHANNELS);
  const priority = qenum<Priority>(query, 'priority', PRIORITY);
  const sort = qenum(query, 'sort', ['latest', 'oldest', 'waiting', 'priority'] as const, 'latest');
  const limit = qnum(query, 'limit', 30, 1, 100);
  const inboxId = qstr(query, 'inboxId');
  const clientId = qstr(query, 'clientId');
  const contactId = qstr(query, 'contactId');
  const labelId = qstr(query, 'labelId');
  const assigneeId = qstr(query, 'assigneeId');
  const teamId = qstr(query, 'teamId');
  const waiting = qstr(query, 'waiting') === 'true';
  const q = qstr(query, 'q');
  const cursor = qstr(query, 'cursor');

  const rows = visibleConversations(me, s).filter((c) => {
    if (!inTab(tab, me, c, s)) return false;
    if (status !== 'ALL' && c.status !== status) return false;
    if (inboxId && c.inboxId !== inboxId) return false;
    if (channelType && s.inboxes.find((i) => i.id === c.inboxId)?.channelType !== channelType) return false;
    if (clientId && c.clientId !== clientId) return false;
    if (contactId && c.contactId !== contactId) return false;
    if (labelId && !c.labelIds.includes(labelId)) return false;
    if (assigneeId && c.assigneeId !== assigneeId) return false;
    if (teamId && c.teamId !== teamId) return false;
    if (priority && c.priority !== priority) return false;
    if (waiting && !c.waitingSince) return false;
    if (q) {
      const contact = c.contactId ? s.contacts.find((x) => x.id === c.contactId) : undefined;
      const client = c.clientId ? s.clients.find((x) => x.id === c.clientId) : undefined;
      const hit =
        includesText(contact?.name, q) ||
        includesText(contact?.email, q) ||
        (contact?.phone ?? '').includes(q) ||
        includesText(c.groupName, q) ||
        includesText(c.subject, q) ||
        includesText(client?.name, q) ||
        includesText(c.lastMessagePreview, q) ||
        (/^\d+$/.test(q) && c.displayId === Number(q));
      if (!hit) return false;
    }
    return true;
  });

  const rank = (p: Priority) => PRIORITY.indexOf(p);
  rows.sort((a, b) => {
    if (sort === 'oldest') return byDesc(b.lastMessageAt, a.lastMessageAt) || (a.id < b.id ? -1 : 1);
    if (sort === 'waiting') {
      if (a.waitingSince && b.waitingSince) return byDesc(b.waitingSince, a.waitingSince) || (a.id < b.id ? -1 : 1);
      if (a.waitingSince || b.waitingSince) return a.waitingSince ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    }
    if (sort === 'priority') return rank(b.priority) - rank(a.priority) || byDesc(a.lastMessageAt, b.lastMessageAt) || byDesc(a.id, b.id);
    return byDesc(a.lastMessageAt, b.lastMessageAt) || byDesc(a.id, b.id);
  });

  const start = cursor ? rows.findIndex((c) => c.id === cursor) + 1 : 0;
  const page = rows.slice(start, start + limit);
  return {
    conversations: page.map((c) => serializeConversation(c, { unread: unreadFor(me.id, c, s) })),
    nextCursor: rows.length > start + limit ? page[page.length - 1].id : null,
  };
});

route('GET', '/conversations/counts', ({ me, query }) => {
  const s = db();
  const status = qenum(query, 'status', [...STATUS, 'ALL'] as const, 'OPEN');
  const inboxId = qstr(query, 'inboxId');
  const base = visibleConversations(me, s).filter((c) => (status === 'ALL' || c.status === status) && (!inboxId || c.inboxId === inboxId));
  const count = (tab: string) => base.filter((c) => inTab(tab, me, c, s)).length;
  const byInbox: Record<string, number> = {};
  for (const c of base) byInbox[c.inboxId] = (byInbox[c.inboxId] ?? 0) + 1;
  return { mine: count('mine'), unassigned: count('unassigned'), all: base.length, mentions: count('mentions'), team: count('team'), byInbox };
});

route('POST', '/conversations', ({ me, body }): { conversation: Conversation } => {
  const inboxId = need(body, 'inboxId');
  const contactId = need(body, 'contactId');
  const content = need(body, 'content');
  if (me.role === 'GUEST') throw forbidden();
  const conv = startConversation(me, { inboxId, contactId, content, subject: optional(body, 'subject'), attachmentIds: isStrArray(body.attachmentIds) ? body.attachmentIds : undefined });
  return { conversation: serializeConversation(conv) };
});

route('GET', '/conversations/:id', ({ me, params }) => {
  const s = db();
  const c = accessible(me, params.id);
  const contact = c.contactId ? s.contacts.find((x) => x.id === c.contactId) : undefined;
  const client = contact?.clientId ? s.clients.find((x) => x.id === contact.clientId) : undefined;
  const previous = c.contactId
    ? visibleConversations(me, s)
        .filter((p) => p.contactId === c.contactId && p.id !== c.id)
        .sort((a, b) => byDesc(a.lastMessageAt, b.lastMessageAt))
        .slice(0, 10)
    : [];
  const participants = s.users.filter((u) => c.participantIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name, avatarKey: null, email: u.email, role: u.role }));
  const base = serializeConversation(c);
  return {
    conversation: {
      ...base,
      // this route loads the whole contact row, with its client and channel handles
      contact: contact
        ? {
            id: contact.id,
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
            avatarUrl: contact.avatarUrl,
            clientId: contact.clientId,
            roleAtClient: contact.roleAtClient,
            notes: contact.notes,
            customAttributes: contact.customAttributes,
            createdAt: contact.createdAt,
            updatedAt: contact.updatedAt,
            client: client ? { id: client.id, name: client.name } : null,
            identities: contact.identities.map((i) => ({ channelType: i.channelType, identifier: i.identifier })),
          }
        : null,
      participants,
    },
    previous: previous.map((p) => serializeConversation(p)),
  };
});

route('PATCH', '/conversations/:id', ({ me, params, body }): { conversation: Conversation | null } => {
  const c = accessible(me, params.id);
  const status = body.status as ConversationStatus | undefined;
  const priority = body.priority as Priority | undefined;
  if (status !== undefined && !STATUS.includes(status)) throw invalid('status');
  if (priority !== undefined && !PRIORITY.includes(priority)) throw invalid('priority');
  const patch = { status, priority, snoozedUntil: optional(body, 'snoozedUntil'), assigneeId: optional(body, 'assigneeId'), teamId: optional(body, 'teamId'), clientId: optional(body, 'clientId') };
  if (me.role === 'GUEST' && (patch.assigneeId !== undefined || patch.teamId !== undefined || patch.clientId !== undefined)) throw forbidden();
  if (patch.assigneeId && patch.assigneeId !== me.id && me.role === 'MEMBER' && c.assigneeId !== me.id) {
    // members may self-assign or hand back; managers, admins and account managers may assign anyone
    throw forbidden('Members can only assign conversations to themselves');
  }
  return { conversation: serializeConversation(updateConversation(me, c.id, patch)) };
});

route('POST', '/conversations/bulk', ({ me, body }) => {
  if (!isStrArray(body.ids) || !body.ids.length || body.ids.length > 200) throw invalid('ids');
  const s = db();
  const allowed = s.conversations.filter((c) => body.ids.includes(c.id) && canSeeConversation(me, c, s));
  for (const c of allowed) {
    const patch = { status: body.status as ConversationStatus | undefined, assigneeId: optional(body, 'assigneeId'), teamId: optional(body, 'teamId') };
    if (patch.status !== undefined || patch.assigneeId !== undefined || patch.teamId !== undefined) updateConversation(me, c.id, patch);
    if (isStr(body.labelId) && !c.labelIds.includes(body.labelId) && s.labels.some((l) => l.id === body.labelId)) c.labelIds.push(body.labelId);
  }
  touch();
  return { updated: allowed.length };
});

route('PUT', '/conversations/:id/labels', ({ me, params, body }): { conversation: Conversation | null } => {
  const c = accessible(me, params.id);
  if (!isStrArray(body.labelIds)) throw invalid('labelIds');
  return { conversation: serializeConversation(setLabels(c.id, body.labelIds)) };
});

route('POST', '/conversations/:id/read', ({ me, params }) => {
  const c = accessible(me, params.id);
  markRead(me.id, c.id);
  return { ok: true };
});

route('POST', '/conversations/:id/participants', ({ me, params, body }) => {
  const c = accessible(me, params.id);
  if (!isStrArray(body.userIds)) throw invalid('userIds');
  c.participantIds = [...new Set([...c.participantIds, ...body.userIds])];
  touch();
  return { ok: true };
});

route('GET', '/conversations/:id/messages', ({ me, params, query }): { messages: Message[]; hasMore: boolean } => {
  const c = accessible(me, params.id);
  const before = qstr(query, 'before');
  const limit = qnum(query, 'limit', 50, 1, 100);
  const cutoff = before ? new Date(before).toISOString() : null;
  const rows = db()
    .messages.filter((m) => m.conversationId === c.id && (!cutoff || m.createdAt < cutoff))
    .sort((a, b) => byDesc(a.createdAt, b.createdAt));
  return { messages: rows.slice(0, limit).reverse().map(serializeMessage), hasMore: rows.length > limit };
});

route('POST', '/conversations/:id/messages', ({ me, params, body }): { message: Message } => {
  const c = accessible(me, params.id);
  const content = optional(body, 'content');
  if (content && content.length > 20000) throw invalid('content');
  const kind = body.kind === undefined ? 'MESSAGE' : body.kind;
  if (kind !== 'MESSAGE' && kind !== 'NOTE') throw invalid('kind');
  if (body.attachmentIds !== undefined && (!isStrArray(body.attachmentIds) || body.attachmentIds.length > 10)) throw invalid('attachmentIds');
  if (body.mentions !== undefined && !isStrArray(body.mentions)) throw invalid('mentions');
  const message = sendAgentMessage(me, c.id, { content, kind, attachmentIds: body.attachmentIds, replyToId: optional(body, 'replyToId'), mentions: body.mentions, email: body.email && typeof body.email === 'object' ? body.email : undefined });
  return { message: serializeMessage(message) };
});

route('POST', '/conversations/:id/messages/:mid/retry', ({ me, params }) => {
  const c = accessible(me, params.id);
  const m = db().messages.find((x) => x.id === params.mid && x.conversationId === c.id);
  if (!m) throw notFound('Message');
  if (m.status !== 'FAILED') throw badRequest('Only failed messages can be retried');
  m.status = 'PENDING';
  m.error = null;
  touch();
  broadcastMessage(c.id, m.id, 'message.updated');
  // the outbound queue picks it up again; in the demo that is the delivery simulation
  hooks.agentMessageSent?.(m, c);
  return { ok: true };
});

route('DELETE', '/conversations/:id/messages/:mid', ({ me, params }) => {
  const c = accessible(me, params.id);
  const m = db().messages.find((x) => x.id === params.mid && x.conversationId === c.id);
  if (!m) throw notFound('Message');
  if (m.kind !== 'NOTE' || (m.senderUserId !== me.id && !isManagerUp(me))) throw forbidden('Only your own private notes can be deleted');
  m.deletedAt = nowIso();
  touch();
  broadcastMessage(c.id, m.id, 'message.updated');
  return { ok: true };
});

// ─── Labels ──────────────────────────────────────────────────────────────────

const sortedLabels = () => [...db().labels].sort((a, b) => a.name.localeCompare(b.name));

function labelFields(body: Record<string, any>, partial: boolean) {
  const out: { name?: string; color?: string; description?: string | null } = {};
  if (body.name !== undefined || !partial) {
    const name = need(body, 'name');
    if (name.length > 40) throw invalid('name');
    out.name = name;
  }
  if (body.color !== undefined) {
    if (!isStr(body.color)) throw invalid('color');
    out.color = body.color;
  }
  const description = optional(body, 'description');
  if (description !== undefined) out.description = description;
  return out;
}

route('GET', '/labels', (): { labels: Label[] } => ({ labels: sortedLabels() }));

route(
  'POST',
  '/labels',
  ({ body }) => {
    const s = db();
    const f = labelFields(body, false);
    if (s.labels.some((l) => l.name === f.name)) throw conflict();
    const label = { id: newId('lb'), name: f.name!, color: f.color ?? '#64748b', description: f.description ?? null, createdAt: nowIso() };
    s.labels.push(label);
    touch();
    return { label };
  },
  { roles: MANAGER_ROLES },
);

route(
  'PATCH',
  '/labels/:id',
  ({ params, body }) => {
    const label = db().labels.find((l) => l.id === params.id);
    if (!label) throw notFound();
    Object.assign(label, labelFields(body, true));
    touch();
    return { label };
  },
  { roles: MANAGER_ROLES },
);

route(
  'DELETE',
  '/labels/:id',
  ({ me, params }) => {
    const s = db();
    const i = s.labels.findIndex((l) => l.id === params.id);
    if (i < 0) throw notFound();
    s.labels.splice(i, 1);
    for (const c of s.conversations) c.labelIds = c.labelIds.filter((l) => l !== params.id);
    audit(me.id, 'label.deleted', { type: 'label', id: params.id });
    touch();
    return { ok: true };
  },
  { roles: ADMIN_ROLES },
);

// ─── Canned responses ────────────────────────────────────────────────────────

function cannedFields(body: Record<string, any>, partial: boolean) {
  const out: { shortCode?: string; title?: string | null; content?: string } = {};
  if (body.shortCode !== undefined || !partial) {
    const code = need(body, 'shortCode');
    if (code.length > 40 || !/^[a-z0-9_-]+$/i.test(code)) throw invalid('shortCode');
    out.shortCode = code;
  }
  const title = optional(body, 'title');
  if (title !== undefined) out.title = title;
  if (body.content !== undefined || !partial) out.content = need(body, 'content');
  return out;
}

route('GET', '/canned-responses', ({ query }) => {
  const q = qstr(query, 'q');
  return {
    cannedResponses: db()
      .canned.filter((c) => !q || includesText(c.shortCode, q) || includesText(c.content, q))
      .sort((a, b) => a.shortCode.localeCompare(b.shortCode)),
  };
});

route('POST', '/canned-responses', ({ me, body }) => {
  const s = db();
  const f = cannedFields(body, false);
  if (s.canned.some((c) => c.shortCode === f.shortCode)) throw conflict();
  const now = nowIso();
  const cannedResponse = { id: newId('cr'), shortCode: f.shortCode!, title: f.title ?? null, content: f.content!, createdById: me.id, createdAt: now, updatedAt: now };
  s.canned.push(cannedResponse);
  touch();
  return { cannedResponse };
});

route('PATCH', '/canned-responses/:id', ({ params, body }) => {
  const s = db();
  const cannedResponse = s.canned.find((c) => c.id === params.id);
  if (!cannedResponse) throw notFound();
  const f = cannedFields(body, true);
  if (f.shortCode && s.canned.some((c) => c.shortCode === f.shortCode && c.id !== params.id)) throw conflict();
  Object.assign(cannedResponse, f, { updatedAt: nowIso() });
  touch();
  return { cannedResponse };
});

route('DELETE', '/canned-responses/:id', ({ me, params }) => {
  const s = db();
  const i = s.canned.findIndex((c) => c.id === params.id);
  if (i < 0) throw notFound();
  if (s.canned[i].createdById !== me.id && !isManagerUp(me)) throw forbidden();
  s.canned.splice(i, 1);
  touch();
  return { ok: true };
});
