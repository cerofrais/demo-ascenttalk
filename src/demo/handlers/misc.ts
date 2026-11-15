/** Bootstrap, search, notifications, uploads and the small settings endpoints (routes/misc.ts, routes/files.ts). */
import type { Attachment, Bootstrap, Features } from '@/lib/api';
import { ADMIN_ROLES, canSeeClient, isAdmin, visibleConversations } from '../access';
import { audit } from '../core';
import { DEMO_FEATURES, resolvedFlags } from '../features';
import { filesFrom, serializeAttachment, storeUpload } from '../files';
import { badRequest, invalid, need, qstr, route } from '../http';
import { inboxBrief, origin, serializeConversation, serializeMe, userBrief } from '../serialize';
import { db, touch } from '../store';
import { includesText } from '../util';
import { sortedInboxes } from './inboxes';

const APP_NAME = 'AscenTalk';

route('GET', '/public/config', () => {
  const ws = db().workspace;
  return { appName: APP_NAME, agency: ws.name, logoUrl: ws.logoUrl };
}, { open: true });

route('GET', '/bootstrap', ({ me, user }): Bootstrap => {
  const s = db();
  return {
    me: serializeMe(user),
    workspace: { name: s.workspace.name, timezone: s.workspace.timezone, logoUrl: s.workspace.logoUrl },
    appName: APP_NAME,
    features: resolvedFlags(),
    inboxes: sortedInboxes().map(inboxBrief),
    labels: [...s.labels].sort((a, b) => a.name.localeCompare(b.name)).map((l) => ({ ...l })),
    teams: [...s.teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ id: t.id, name: t.name, color: t.color })),
    users: s.users
      .filter((u) => u.active)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => userBrief(u, 'full')!),
    // No provider keys exist in a static demo, which is exactly what a fresh install reports to its admins.
    integrations: isAdmin(me) ? { plivo: false, google: false, microsoft: false, evolution: false, meta: false, smtp: false, googleApiKey: false, publicUrl: origin() } : undefined,
  };
});

route('GET', '/features', (): Features => resolvedFlags());

/** The Workspace row. */
route('GET', '/workspace', () => {
  const ws = db().workspace;
  return { id: 1, name: ws.name, timezone: ws.timezone, logoKey: null };
});

route(
  'PATCH',
  '/workspace',
  ({ me, body }) => {
    const ws = db().workspace;
    const patch: { name?: string; timezone?: string } = {};
    if (body.name !== undefined) patch.name = need(body, 'name');
    if (body.timezone !== undefined) patch.timezone = need(body, 'timezone');
    Object.assign(ws, patch);
    touch();
    audit(me.id, 'workspace.updated', { type: 'workspace', id: '1' }, patch);
    return { workspace: { id: 1, name: ws.name, timezone: ws.timezone, logoKey: null } };
  },
  { roles: ADMIN_ROLES },
);

// ─── Global search (Ctrl+K) ──────────────────────────────────────────────────

route('GET', '/search', ({ me, query }) => {
  const s = db();
  const q = qstr(query, 'q');
  if (!q || q.length < 2 || q.length > 100) throw invalid('q');
  const like = (text: string | null | undefined) => includesText(text, q);
  const digits = q.replace(/[^\d]/g, '') || q;
  const scope = visibleConversations(me, s);
  const scopeIds = new Map(scope.map((c) => [c.id, c]));
  const admin = isAdmin(me);
  const talkedTo = admin ? null : new Set(scope.map((c) => c.contactId).filter((id): id is string => Boolean(id)));

  const clients = s.clients
    .filter((c) => canSeeClient(me, c, s) && (like(c.name) || c.tags.includes(q)))
    .slice(0, 6)
    .map((c) => ({ id: c.id, name: c.name, status: c.status, logoUrl: c.logoUrl }));
  const contacts = s.contacts
    .filter((c) => (like(c.name) || like(c.email) || (c.phone ?? '').includes(digits)) && (!talkedTo || talkedTo.has(c.id)))
    .slice(0, 6)
    .map((c) => {
      const client = c.clientId ? s.clients.find((x) => x.id === c.clientId) : undefined;
      return { id: c.id, name: c.name, email: c.email, phone: c.phone, client: client ? { id: client.id, name: client.name } : null };
    });
  const number = /^\d+$/.test(q) ? Number(q) : null;
  const conversations = scope.filter((c) => like(c.subject) || like(c.groupName) || (number !== null && c.displayId === number)).slice(0, 5);
  const messages = s.messages
    .filter((m) => (m.kind === 'MESSAGE' || m.kind === 'NOTE') && !m.deletedAt && like(m.content) && scopeIds.has(m.conversationId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 10);
  const myChannels = new Map(s.channels.filter((c) => c.members.some((m) => m.userId === me.id)).map((c) => [c.id, c]));
  const chat = s.chatMessages
    .filter((m) => !m.deletedAt && like(m.content) && myChannels.has(m.channelId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 8);
  const people = s.users.filter((u) => u.active && (like(u.name) || like(u.email) || like(u.title))).slice(0, 5);

  return {
    clients,
    contacts,
    conversations: conversations.map((c) => serializeConversation(c)),
    messages: messages.map((m) => ({ id: m.id, content: m.content, kind: m.kind, createdAt: m.createdAt, senderName: m.senderName, conversation: serializeConversation(scopeIds.get(m.conversationId)!) })),
    chat: chat.map((m) => {
      const author = m.userId ? s.users.find((u) => u.id === m.userId) : undefined;
      const ch = myChannels.get(m.channelId)!;
      return { id: m.id, content: m.content, createdAt: m.createdAt, user: author ? { id: author.id, name: author.name } : null, channel: { id: ch.id, name: ch.name, kind: ch.kind }, parentId: m.parentId };
    }),
    people: people.map((p) => ({ id: p.id, name: p.name, email: p.email, title: p.title, avatarUrl: p.avatarUrl })),
  };
});

// ─── Notifications ───────────────────────────────────────────────────────────

route('GET', '/notifications', ({ me, query }) => {
  const s = db();
  const beforeRaw = qstr(query, 'before');
  const before = beforeRaw && Number.isFinite(Date.parse(beforeRaw)) ? new Date(beforeRaw).toISOString() : undefined;
  const unreadOnly = qstr(query, 'unread') === 'true';
  const mine = s.notifications.filter((n) => n.userId === me.id);
  return {
    notifications: mine
      .filter((n) => (!unreadOnly || !n.readAt) && (!before || n.createdAt < before))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .slice(0, 50),
    unread: mine.filter((n) => !n.readAt).length,
  };
});

route('POST', '/notifications/read', ({ me, body }) => {
  const s = db();
  if (body.ids !== undefined && !(Array.isArray(body.ids) && body.ids.every((x: unknown) => typeof x === 'string'))) throw invalid('ids');
  if (body.link !== undefined && typeof body.link !== 'string') throw invalid('link');
  const ids: string[] = body.ids ?? [];
  const now = new Date().toISOString();
  let changed = false;
  for (const n of s.notifications) {
    if (n.userId !== me.id || n.readAt) continue;
    if (body.all === true || (body.link ? n.link === body.link : ids.includes(n.id))) {
      n.readAt = now;
      changed = true;
    }
  }
  if (changed) touch();
  return { ok: true };
});

/** Read-only view of features.json in Settings. */
route('GET', '/settings/features', () => ({ file: 'config/features.json', features: DEMO_FEATURES }), { roles: ADMIN_ROLES });

// ─── Uploads ─────────────────────────────────────────────────────────────────

/** One unattached Attachment row per file; the composer sends their ids with the message. */
route('POST', '/uploads', async ({ me, form }): Promise<{ attachments: Attachment[] }> => {
  const files = filesFrom(form);
  if (!files.length) throw badRequest('No files uploaded');
  const attachments: Attachment[] = [];
  for (const file of files) attachments.push(serializeAttachment(await storeUpload(file, me.id)));
  return { attachments };
});
