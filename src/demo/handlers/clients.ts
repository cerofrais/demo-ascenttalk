/** Clients, the client 360 timeline, Drive links and contacts (apps/api/src/routes/clients.ts). */
import type { Attachment, ChannelType, Conversation } from '@/lib/api';
import { ADMIN_ROLES, MANAGER_ROLES, canSeeClient, canSeeConversation, isManagerUp, visibleClients, visibleConversations, type Viewer } from '../access';
import { DRIVE_TITLES } from '../content';
import { audit, recordActivity } from '../core';
import { filesFrom, imageUrlFor, serializeAttachment } from '../files';
import { badRequest, forbidden, invalid, isStrArray, need, notFound, optional, qenum, qnum, qstr, route } from '../http';
import { serializeCall, serializeClient, serializeConversation, type ClientRecord } from '../serialize';
import { db, newId, nowIso, touch, type ClientStatus, type DClient, type DContact, type DemoState } from '../store';
import { identityKey, includesText, normalizeEmail, normalizePhone, parseDriveUrl } from '../util';

const CLIENT_STATUS = ['LEAD', 'ACTIVE', 'PAUSED', 'CHURNED'] as const;

function clientFields(body: Record<string, any>, partial: boolean): Partial<DClient> {
  const out: Partial<DClient> = {};
  if (body.name !== undefined || !partial) out.name = need(body, 'name');
  for (const key of ['industry', 'website', 'accountManagerId', 'teamId', 'notes'] as const) {
    const v = optional(body, key);
    if (v !== undefined) out[key] = v;
  }
  if (body.status !== undefined) {
    if (!CLIENT_STATUS.includes(body.status)) throw invalid('status');
    out.status = body.status as ClientStatus;
  }
  if (body.tags !== undefined) {
    if (!isStrArray(body.tags)) throw invalid('tags');
    out.tags = body.tags;
  }
  const folder = optional(body, 'driveFolderUrl');
  if (folder !== undefined) {
    if (folder && !/^https?:\/\/\S+$/i.test(folder)) throw invalid('driveFolderUrl');
    out.driveFolderUrl = folder || null;
  }
  if (body.customAttributes && typeof body.customAttributes === 'object') out.customAttributes = body.customAttributes;
  return out;
}

/** assertClient(): a client outside the caller's scope looks like it does not exist. */
function accessibleClient(u: Viewer, id: string): DClient {
  const c = db().clients.find((x) => x.id === id);
  if (!c || !canSeeClient(u, c)) throw notFound('Client');
  return c;
}

route('GET', '/clients', ({ me, query }): { clients: ClientRecord[] } => {
  const s = db();
  const q = qstr(query, 'q');
  const status = qenum(query, 'status', CLIENT_STATUS);
  const mine = qstr(query, 'mine') === 'true';
  const clients = visibleClients(me, s)
    .filter((c) => (!status || c.status === status) && (!mine || c.accountManagerId === me.id) && (!q || includesText(c.name, q) || c.tags.includes(q) || includesText(c.industry, q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    clients: clients.map((c) => {
      const convs = s.conversations.filter((x) => x.clientId === c.id);
      const last = convs.reduce<string | null>((max, x) => (!max || x.lastMessageAt > max ? x.lastMessageAt : max), null);
      return serializeClient(c, { openConversations: convs.filter((x) => x.status === 'OPEN').length, lastActivityAt: last });
    }),
  };
});

route(
  'POST',
  '/clients',
  ({ me, body }): { client: ClientRecord } => {
    const s = db();
    const f = clientFields(body, false);
    const now = nowIso();
    const client: DClient = {
      id: newId('cl'),
      name: f.name!,
      logoUrl: null,
      industry: f.industry ?? null,
      website: f.website ?? null,
      status: f.status ?? 'ACTIVE',
      accountManagerId: f.accountManagerId ?? (me.role === 'ACCOUNT_MANAGER' ? me.id : null),
      teamId: f.teamId ?? null,
      tags: f.tags ?? [],
      driveFolderUrl: f.driveFolderUrl ?? null,
      notes: f.notes ?? null,
      customAttributes: f.customAttributes ?? {},
      createdAt: now,
      updatedAt: now,
    };
    s.clients.push(client);
    touch();
    recordActivity({ type: 'client.created', summary: `${me.name} added client ${client.name}`, actorUserId: me.id, clientId: client.id });
    audit(me.id, 'client.created', { type: 'client', id: client.id }, { name: client.name });
    return { client: serializeClient(client) };
  },
  { roles: ['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNT_MANAGER'] },
);

route('GET', '/clients/:id', ({ me, params }) => {
  const s = db();
  const client = accessibleClient(me, params.id);
  const convs = s.conversations.filter((c) => c.clientId === client.id);
  const count = (status: string) => convs.filter((c) => c.status === status).length;
  const last = convs.reduce<string | null>((max, x) => (!max || x.lastMessageAt > max ? x.lastMessageAt : max), null);
  return {
    client: {
      ...serializeClient(client),
      contacts: s.contacts.filter((c) => c.clientId === client.id).sort((a, b) => a.name.localeCompare(b.name)).map(contactRow),
      driveLinks: s.driveLinks
        .filter((l) => l.clientId === client.id)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((l) => {
          const by = l.createdById ? s.users.find((u) => u.id === l.createdById) : undefined;
          return { ...l, createdBy: by ? { id: by.id, name: by.name } : null };
        }),
      channels: s.channels.filter((c) => c.clientId === client.id && !c.archived).map((c) => ({ id: c.id, name: c.name, kind: c.kind, topic: c.topic })),
      stats: { open: count('OPEN'), pending: count('PENDING'), resolved: count('RESOLVED'), calls: s.calls.filter((k) => k.clientId === client.id).length, lastActivityAt: last },
    },
  };
});

route('PATCH', '/clients/:id', ({ me, params, body }): { client: ClientRecord } => {
  const s = db();
  const client = accessibleClient(me, params.id);
  if (!isManagerUp(me) && client.accountManagerId !== me.id) throw forbidden('Only managers or the account manager can edit this client');
  const f = clientFields(body, true);
  Object.assign(client, f, { updatedAt: nowIso() });
  touch();
  if (f.accountManagerId !== undefined || f.status) {
    const am = client.accountManagerId ? s.users.find((u) => u.id === client.accountManagerId) : undefined;
    recordActivity({ type: 'client.updated', summary: `${me.name} updated client ${client.name}${f.accountManagerId !== undefined ? ` (account manager: ${am?.name ?? 'none'})` : ''}`, actorUserId: me.id, clientId: client.id });
  }
  audit(me.id, 'client.updated', { type: 'client', id: client.id }, f as Record<string, any>);
  return { client: serializeClient(client) };
});

route(
  'DELETE',
  '/clients/:id',
  ({ me, params }) => {
    const s = db();
    const i = s.clients.findIndex((c) => c.id === params.id);
    if (i < 0) throw notFound();
    s.clients.splice(i, 1);
    // the database nulls the foreign keys (onDelete: SetNull) and drops the pinned links (Cascade)
    for (const c of s.contacts) if (c.clientId === params.id) c.clientId = null;
    for (const c of s.conversations) if (c.clientId === params.id) c.clientId = null;
    for (const c of s.channels) if (c.clientId === params.id) c.clientId = null;
    for (const k of s.calls) if (k.clientId === params.id) k.clientId = null;
    s.driveLinks = s.driveLinks.filter((l) => l.clientId !== params.id);
    audit(me.id, 'client.deleted', { type: 'client', id: params.id });
    touch();
    return { ok: true };
  },
  { roles: ADMIN_ROLES },
);

route('POST', '/clients/:id/logo', async ({ me, params, form }) => {
  const client = accessibleClient(me, params.id);
  const file = filesFrom(form)[0];
  if (!file || !file.type.startsWith('image/')) throw badRequest('Logo must be an image');
  client.logoUrl = await imageUrlFor(file);
  client.updatedAt = nowIso();
  touch();
  return { logoUrl: client.logoUrl };
});

/** Client 360: everything that happened with this client, newest first. */
route('GET', '/clients/:id/timeline', ({ me, params, query }) => {
  const s = db();
  const client = accessibleClient(me, params.id);
  const limit = qnum(query, 'limit', 40, 1, 100);
  const beforeRaw = qstr(query, 'before');
  const before = beforeRaw ? new Date(beforeRaw).toISOString() : new Date(Date.now() + 1000).toISOString();
  const convs = visibleConversations(me, s).filter((c) => c.clientId === client.id);
  const convById = new Map(convs.map((c) => [c.id, c]));
  const newestFirst = <T extends { at: string }>(rows: T[]) => rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);

  const messages = newestFirst(
    s.messages
      .filter((m) => convById.has(m.conversationId) && (m.kind === 'MESSAGE' || m.kind === 'NOTE') && m.createdAt < before && !m.deletedAt)
      .map((m) => {
        const conv = convById.get(m.conversationId)!;
        const inbox = s.inboxes.find((i) => i.id === conv.inboxId)!;
        const contact = conv.contactId ? s.contacts.find((c) => c.id === conv.contactId) : undefined;
        const sender = m.senderUserId ? s.users.find((u) => u.id === m.senderUserId) : undefined;
        return {
          type: m.kind === 'NOTE' ? ('note' as const) : ('message' as const),
          at: m.createdAt,
          id: m.id,
          direction: m.direction,
          content: m.content,
          senderName: m.senderName ?? sender?.name ?? null,
          channelType: inbox.channelType,
          inbox: { id: inbox.id, name: inbox.name, channelType: inbox.channelType },
          conversation: { id: conv.id, displayId: conv.displayId, title: conv.groupName ?? conv.subject ?? contact?.name ?? null },
          attachments: m.attachmentIds.map((id) => s.attachments.find((a) => a.id === id)).filter((a) => a !== undefined).map(serializeAttachment),
        };
      }),
  );
  const calls = newestFirst(s.calls.filter((k) => k.clientId === client.id && k.startedAt < before).map((k) => ({ type: 'call' as const, at: k.startedAt, id: k.id, call: serializeCall(k), channelType: 'VOICE' as const })));
  const events = newestFirst(
    s.activity
      .filter((e) => e.clientId === client.id && e.createdAt < before && !e.type.startsWith('call.') && !e.type.startsWith('message.'))
      .map((e) => {
        const actor = e.actorUserId ? s.users.find((u) => u.id === e.actorUserId) : undefined;
        return { type: 'event' as const, at: e.createdAt, id: e.id, summary: e.summary, eventType: e.type, actor: actor ? { id: actor.id, name: actor.name } : null };
      }),
  );
  const items = [...messages, ...calls, ...events].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
  const conversations: Conversation[] = convs.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1)).slice(0, 50).map((c) => serializeConversation(c));
  return { items, conversations, nextBefore: items.length === limit ? items[items.length - 1].at : null };
});

route('GET', '/clients/:id/files', ({ me, params }) => {
  const s = db();
  const client = accessibleClient(me, params.id);
  type FileRow = Attachment & { source: string; direction: string | null; senderName: string | null; conversationId: string | null; channelId: string | null; channelType: ChannelType | null };
  const files: FileRow[] = [];
  for (const a of s.attachments) {
    if (a.messageId) {
      const m = s.messages.find((x) => x.id === a.messageId);
      const conv = m && s.conversations.find((c) => c.id === m.conversationId);
      if (!m || !conv || conv.clientId !== client.id || !canSeeConversation(me, conv, s)) continue;
      files.push({ ...serializeAttachment(a), source: 'conversation', direction: m.direction, senderName: m.senderName, conversationId: conv.id, channelId: null, channelType: s.inboxes.find((i) => i.id === conv.inboxId)?.channelType ?? null });
    } else if (a.chatMessageId) {
      const m = s.chatMessages.find((x) => x.id === a.chatMessageId);
      const ch = m && s.channels.find((c) => c.id === m.channelId);
      if (!m || !ch || ch.clientId !== client.id || !ch.members.some((mem) => mem.userId === me.id)) continue;
      files.push({ ...serializeAttachment(a), source: 'internal', direction: null, senderName: s.users.find((u) => u.id === m.userId)?.name ?? null, conversationId: null, channelId: ch.id, channelType: null });
    }
  }
  files.sort((a, b) => ((a.createdAt ?? '') < (b.createdAt ?? '') ? 1 : -1));
  return { files: files.slice(0, 300) };
});

// Google Drive links pinned to a client
route('POST', '/clients/:id/drive-links', ({ me, params, body }) => {
  const client = accessibleClient(me, params.id);
  const url = need(body, 'url');
  const title = optional(body, 'title');
  if (!/^https?:\/\/\S+$/i.test(url)) throw invalid('url');
  if (!/^https:\/\/(drive|docs)\.google\.com\//.test(url)) throw badRequest('Only Google Drive / Docs links are supported');
  const info = parseDriveUrl(url);
  const link = { id: newId('dl'), clientId: client.id, url, title: title || DRIVE_TITLES[url] || null, fileType: info.fileType, pinned: true, createdById: me.id, createdAt: nowIso() };
  db().driveLinks.push(link);
  touch();
  recordActivity({ type: 'client.drive_link', summary: `${me.name} pinned a Drive link: ${link.title ?? link.url}`, actorUserId: me.id, clientId: client.id });
  return { link };
});

route('DELETE', '/drive-links/:id', ({ me, params }) => {
  const s = db();
  const link = s.driveLinks.find((l) => l.id === params.id);
  if (!link) throw notFound('Link');
  if (link.clientId) accessibleClient(me, link.clientId);
  s.driveLinks = s.driveLinks.filter((l) => l.id !== link.id);
  touch();
  return { ok: true };
});

route('GET', '/drive/preview', ({ query }) => {
  const url = qstr(query, 'url');
  if (!url || !/^https?:\/\/\S+$/i.test(url)) throw invalid('url');
  return { ...parseDriveUrl(url), title: DRIVE_TITLES[url] ?? null };
});

// ─── Contacts ────────────────────────────────────────────────────────────────

/** A Contact row as Prisma returns it (no relations). */
function contactRow(c: DContact) {
  return { id: c.id, name: c.name, email: c.email, phone: c.phone, avatarUrl: c.avatarUrl, clientId: c.clientId, roleAtClient: c.roleAtClient, notes: c.notes, customAttributes: c.customAttributes, createdAt: c.createdAt, updatedAt: c.updatedAt };
}

const clientRef = (clientId: string | null, s: DemoState) => {
  const c = clientId ? s.clients.find((x) => x.id === clientId) : undefined;
  return c ? { id: c.id, name: c.name } : null;
};

function contactFields(body: Record<string, any>, partial: boolean) {
  const out: { name?: string; email?: string | null; phone?: string | null; clientId?: string | null; roleAtClient?: string | null; notes?: string | null; customAttributes?: Record<string, unknown> } = {};
  if (body.name !== undefined || !partial) out.name = need(body, 'name');
  const email = optional(body, 'email');
  if (email !== undefined) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid('email');
    out.email = normalizeEmail(email || null);
  }
  const phone = optional(body, 'phone');
  if (phone !== undefined) out.phone = normalizePhone(phone);
  for (const key of ['clientId', 'roleAtClient', 'notes'] as const) {
    const v = optional(body, key);
    if (v !== undefined) out[key] = v;
  }
  if (body.customAttributes && typeof body.customAttributes === 'object') out.customAttributes = body.customAttributes;
  return out;
}

/** Phone numbers and emails are handles on every channel that uses them (unique per key, like the database). */
function addGlobalIdentities(contact: DContact, phone: string | null | undefined, email: string | null | undefined): void {
  const now = nowIso();
  const add = (channelType: ChannelType, identifier: string) => {
    const key = identityKey(channelType, 'global', identifier);
    if (db().contacts.some((c) => c.identities.some((i) => i.key === key))) return;
    contact.identities.push({ id: newId('ci'), channelType, identifier, key, createdAt: now });
  };
  if (phone) {
    add('WHATSAPP', phone);
    add('VOICE', phone);
  }
  if (email) add('EMAIL', email);
}

route('GET', '/contacts', ({ me, query }) => {
  const s = db();
  const q = qstr(query, 'q');
  const clientId = qstr(query, 'clientId');
  const unlinked = qstr(query, 'unlinked') === 'true';
  const takeRaw = qstr(query, 'take');
  const take = takeRaw === undefined ? 200 : Number(takeRaw);
  if (!Number.isFinite(take) || take > 500) throw invalid('take');
  const seen = isManagerUp(me) ? null : visibleConversations(me, s);
  const digits = q ? q.replace(/[^\d+]/g, '') || q : '';
  const contacts = s.contacts
    .filter((c) => {
      if (seen) {
        const client = c.clientId ? s.clients.find((x) => x.id === c.clientId) : undefined;
        if (!(client && canSeeClient(me, client, s)) && !seen.some((conv) => conv.contactId === c.id)) return false;
      }
      if (clientId && c.clientId !== clientId) return false;
      if (unlinked && c.clientId) return false;
      if (q && !(includesText(c.name, q) || includesText(c.email, q) || (c.phone ?? '').includes(digits))) return false;
      return true;
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.name.localeCompare(b.name)))
    .slice(0, Math.max(0, take))
    .map((c) => ({
      ...contactRow(c),
      client: clientRef(c.clientId, s),
      identities: c.identities.map((i) => ({ channelType: i.channelType, identifier: i.identifier })),
      _count: { conversations: s.conversations.filter((conv) => conv.contactId === c.id).length },
    }));
  return { contacts };
});

route('POST', '/contacts', ({ body }) => {
  const s = db();
  const f = contactFields(body, false);
  const now = nowIso();
  const contact: DContact = { id: newId('ct'), name: f.name!, email: f.email ?? null, phone: f.phone ?? null, avatarUrl: null, clientId: f.clientId ?? null, roleAtClient: f.roleAtClient ?? null, notes: f.notes ?? null, customAttributes: f.customAttributes ?? {}, identities: [], createdAt: now, updatedAt: now };
  addGlobalIdentities(contact, contact.phone, contact.email);
  s.contacts.push(contact);
  touch();
  return { contact: { ...contactRow(contact), client: clientRef(contact.clientId, s) } };
});

route('GET', '/contacts/:id', ({ me, params }) => {
  const s = db();
  const contact = s.contacts.find((c) => c.id === params.id);
  if (!contact) throw notFound('Contact');
  const client = contact.clientId ? s.clients.find((c) => c.id === contact.clientId) : undefined;
  const conversations = visibleConversations(me, s)
    .filter((c) => c.contactId === contact.id)
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1))
    .slice(0, 30);
  if (!isManagerUp(me) && !conversations.length && client?.accountManagerId !== me.id && !(client && canSeeClient(me, client, s))) throw notFound('Contact');
  const calls = s.calls
    .filter((k) => k.contactId === contact.id)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, 20);
  return {
    contact: {
      ...contactRow(contact),
      client: client ? { id: client.id, name: client.name, accountManagerId: client.accountManagerId } : null,
      identities: contact.identities.map((i) => ({ id: i.id, contactId: contact.id, channelType: i.channelType, identifier: i.identifier, key: i.key, createdAt: i.createdAt })),
    },
    conversations: conversations.map((c) => serializeConversation(c)),
    calls: calls.map((k) => serializeCall(k, 'full')),
  };
});

route('PATCH', '/contacts/:id', ({ me, params, body }) => {
  const s = db();
  const contact = s.contacts.find((c) => c.id === params.id);
  if (!contact) throw notFound('Contact');
  const f = contactFields(body, true);
  const previousClient = contact.clientId;
  Object.assign(contact, f, { updatedAt: nowIso() });
  addGlobalIdentities(contact, f.phone, f.email);
  // Linking a contact to a client also links its unlinked conversations.
  if (f.clientId && f.clientId !== previousClient) {
    for (const c of s.conversations) if (c.contactId === contact.id && !c.clientId) c.clientId = f.clientId;
    recordActivity({ type: 'contact.linked', summary: `${me.name} linked ${contact.name} to ${clientRef(f.clientId, s)?.name}`, actorUserId: me.id, clientId: f.clientId });
  }
  touch();
  return { contact: { ...contactRow(contact), client: clientRef(contact.clientId, s) } };
});

route(
  'DELETE',
  '/contacts/:id',
  ({ me, params }) => {
    const s = db();
    const i = s.contacts.findIndex((c) => c.id === params.id);
    if (i < 0) throw notFound();
    s.contacts.splice(i, 1);
    for (const c of s.conversations) if (c.contactId === params.id) c.contactId = null;
    for (const m of s.messages) if (m.senderContactId === params.id) m.senderContactId = null;
    for (const k of s.calls) if (k.contactId === params.id) k.contactId = null;
    audit(me.id, 'contact.deleted', { type: 'contact', id: params.id });
    touch();
    return { ok: true };
  },
  { roles: ADMIN_ROLES },
);

route(
  'POST',
  '/contacts/:id/merge',
  ({ me, params, body }) => {
    const s = db();
    const intoId = need(body, 'intoId');
    if (params.id === intoId) throw badRequest('Cannot merge a contact into itself');
    const from = s.contacts.find((c) => c.id === params.id);
    const into = s.contacts.find((c) => c.id === intoId);
    if (!from || !into) throw notFound();
    into.identities.push(...from.identities);
    for (const c of s.conversations) if (c.contactId === from.id) c.contactId = into.id;
    for (const m of s.messages) if (m.senderContactId === from.id) m.senderContactId = into.id;
    for (const k of s.calls) if (k.contactId === from.id) k.contactId = into.id;
    s.contacts = s.contacts.filter((c) => c.id !== from.id);
    audit(me.id, 'contact.merged', { type: 'contact', id: into.id }, { from: from.id });
    touch();
    return { ok: true };
  },
  { roles: MANAGER_ROLES },
);
