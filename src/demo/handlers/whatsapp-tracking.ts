/**
 * WhatsApp tracking endpoints (routes/whatsapp-sync.ts in the API); the rules themselves are in ../tracking.ts.
 * The demo phone has the agency's client contacts plus a few personal chats and groups, so the screen has
 * something real to choose from.
 */
import type { OutsideConversation, TrackingChatRow, TrackingGroupRow, TrackingSummary } from '@/components/settings/whatsapp-tracking';
import type { Viewer } from '../access';
import { ADMIN_ROLES, isAdmin } from '../access';
import { audit } from '../core';
import { badRequest, forbidden, notFound, notInDemo, route } from '../http';
import { emit, rooms } from '../realtime';
import { db, nowIso, touch, type DInbox, type DemoState } from '../store';
import { PERSONAL_CHATS, PERSONAL_GROUPS, canManage, decide, demoTracks, groupConversations, isChatJid, isGroupJid, jidPhone, normalize, ownerId, phoneJid, trackingFor } from '../tracking';

function outside(s: DemoState, inbox: DInbox): OutsideConversation[] {
  return s.conversations
    .filter((c) => c.inboxId === inbox.id && c.externalThreadId && !demoTracks(inbox, c.externalThreadId, s) && !(c.clientId && decide(trackingFor(inbox, s), normalize(c.externalThreadId) ?? '') === 'clients'))
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
    .map((c) => {
      const contact = c.contactId ? s.contacts.find((x) => x.id === c.contactId) : undefined;
      return {
        id: c.id,
        displayId: c.displayId,
        jid: normalize(c.externalThreadId) ?? c.externalThreadId!,
        name: c.isGroup ? c.groupName || 'WhatsApp group' : contact?.name || jidPhone(c.externalThreadId!) || 'WhatsApp chat',
        isGroup: c.isGroup,
        messages: s.messages.filter((m) => m.conversationId === c.id).length,
        lastMessageAt: c.lastMessageAt,
      };
    });
}

function summary(me: Viewer, inbox: DInbox): TrackingSummary {
  const s = db();
  const t = trackingFor(inbox, s);
  const manage = canManage(me, inbox);
  const owner = s.users.find((u) => u.id === ownerId(inbox));
  return {
    inbox: { id: inbox.id, name: inbox.name, status: inbox.status, statusDetail: inbox.statusDetail, phoneNumber: inbox.config?.phoneNumber ?? null },
    owner: owner ? { id: owner.id, name: owner.name } : null,
    isOwner: ownerId(inbox) === me.id,
    canManage: manage,
    canLink: true,
    groupsFeature: true,
    configured: true,
    rules: { chats: t.chats, groups: t.groups },
    counts: { chats: t.allow.filter(isChatJid).length, groups: t.allow.filter(isGroupJid).length, blocked: t.block.length, outside: outside(s, inbox).length },
    allow: manage ? [...t.allow] : undefined,
    block: manage ? [...t.block] : undefined,
  };
}

function load(me: Viewer, id: string, manage = false): DInbox {
  const inbox = db().inboxes.find((i) => i.id === id && i.channelType === 'WHATSAPP');
  if (!inbox || !(isAdmin(me) || ownerId(inbox) === me.id)) throw notFound('WhatsApp inbox');
  if (manage && !canManage(me, inbox)) {
    const owner = db().users.find((u) => u.id === ownerId(inbox));
    throw forbidden(`This is ${owner?.name ?? 'someone else'}'s number, so only they can choose what it tracks.`);
  }
  return inbox;
}

route('GET', '/whatsapp/mine', ({ me }) => ({ inboxes: db().inboxes.filter((i) => i.channelType === 'WHATSAPP' && ownerId(i) === me.id).map((i) => summary(me, i)) }));

route('GET', '/inboxes/:id/whatsapp/tracking', ({ me, params }) => summary(me, load(me, params.id)));

route('GET', '/inboxes/:id/whatsapp/tracking/chats', ({ me, params }) => {
  const inbox = load(me, params.id, true);
  const s = db();
  const t = trackingFor(inbox, s);
  const rows = new Map<string, TrackingChatRow>();
  const row = (jid: string): TrackingChatRow => {
    let r = rows.get(jid);
    if (!r) rows.set(jid, (r = { id: jid, name: null, phone: jidPhone(jid), client: false, clientName: null, listed: false, inInbox: false, wroteAt: null }));
    return r;
  };
  const own = phoneJid(inbox.config?.phoneNumber);
  // the phone's chats: everyone in Contacts with a number, plus the personal ones
  for (const c of s.contacts) {
    const jid = phoneJid(c.phone);
    if (!jid || jid === own) continue;
    const client = c.clientId ? s.clients.find((x) => x.id === c.clientId) : undefined;
    Object.assign(row(jid), { name: c.name, listed: true, ...(client ? { client: true, clientName: client.name } : {}) });
  }
  for (const p of PERSONAL_CHATS) Object.assign(row(`120255501${p.n - 100}@s.whatsapp.net`), { name: p.name, listed: true });
  for (const c of s.conversations) if (c.inboxId === inbox.id && !c.isGroup && c.externalThreadId && isChatJid(c.externalThreadId)) row(c.externalThreadId).inInbox = true;
  for (const [jid, sk] of Object.entries(t.skipped)) if (isChatJid(jid)) Object.assign(row(jid), { wroteAt: sk.at }, row(jid).name ? {} : { name: sk.name });
  for (const jid of [...t.allow, ...t.block]) if (isChatJid(jid)) row(jid);
  return { connected: inbox.status === 'connected', rows: [...rows.values()], error: null };
});

route('GET', '/inboxes/:id/whatsapp/tracking/groups', async ({ me, params, query }) => {
  const inbox = load(me, params.id, true);
  const s = db();
  const t = trackingFor(inbox, s);
  // the real list comes from WhatsApp and is slow; a short pause keeps the spinner honest
  await new Promise((r) => setTimeout(r, query.get('refresh') ? 1500 : 600));
  const rows = new Map<string, TrackingGroupRow>();
  const row = (jid: string): TrackingGroupRow => {
    let r = rows.get(jid);
    if (!r) rows.set(jid, (r = { id: jid, name: '', size: null, community: false, listed: false, inInbox: false, wroteAt: null }));
    return r;
  };
  for (const c of groupConversations(s, inbox)) Object.assign(row(c.externalThreadId!), { name: c.groupName ?? 'WhatsApp group', size: 4 + (c.displayId % 9), listed: true, inInbox: true });
  for (const g of PERSONAL_GROUPS) Object.assign(row(g.id), { name: g.name, size: g.size, community: Boolean(g.community), listed: true });
  for (const [jid, sk] of Object.entries(t.skipped)) if (isGroupJid(jid)) row(jid).wroteAt = sk.at;
  for (const jid of [...t.allow, ...t.block]) if (isGroupJid(jid)) row(jid);
  for (const r of rows.values()) r.name ||= 'Group no longer listed';
  return { featureEnabled: true, connected: inbox.status === 'connected', rows: [...rows.values()], fetchedAt: nowIso(), error: null };
});

route('PUT', '/inboxes/:id/whatsapp/tracking', ({ me, params, body }) => {
  const inbox = load(me, params.id, true);
  if (!['approved', 'clients', 'all'].includes(body.chats) || !['approved', 'all'].includes(body.groups) || !Array.isArray(body.allow) || !Array.isArray(body.block)) throw badRequest('Invalid input');
  const clean = (list: unknown[]) => {
    const out = list.map(normalize);
    if (out.some((j) => !j)) throw badRequest('Not a WhatsApp chat or group id');
    return [...new Set(out as string[])];
  };
  const t = trackingFor(inbox);
  const before = { chats: t.chats, groups: t.groups, allowed: t.allow.length, blocked: t.block.length };
  t.block = clean(body.block);
  t.allow = clean(body.allow).filter((j) => !t.block.includes(j));
  t.chats = body.chats;
  t.groups = body.groups;
  // a chat that is tracked now is no longer "wrote recently"
  for (const jid of Object.keys(t.skipped)) if (demoTracks(inbox, jid)) delete t.skipped[jid];
  touch();
  audit(me.id, 'inbox.whatsapp_tracking', { type: 'inbox', id: inbox.id }, { chats: t.chats, groups: t.groups, allowed: t.allow.length, blocked: t.block.length, previous: before });
  return summary(me, inbox);
});

route('GET', '/inboxes/:id/whatsapp/tracking/outside', ({ me, params }) => ({ conversations: outside(db(), load(me, params.id, true)) }));

route('POST', '/inboxes/:id/whatsapp/tracking/outside/remove', ({ me, params, body }) => {
  const inbox = load(me, params.id, true);
  const s = db();
  const wanted = new Set<string>(Array.isArray(body.ids) ? body.ids : []);
  const targets = new Set(outside(s, inbox).filter((c) => wanted.has(c.id)).map((c) => c.id));
  if (!targets.size) return { conversations: 0, messages: 0, files: 0, contacts: 0 };
  const removedMessages = s.messages.filter((m) => targets.has(m.conversationId));
  const messageIds = new Set(removedMessages.map((m) => m.id));
  const contactIds = new Set([...s.conversations.filter((c) => targets.has(c.id)).map((c) => c.contactId), ...removedMessages.map((m) => m.senderContactId)].filter((x): x is string => Boolean(x)));
  const files = s.attachments.filter((a) => a.messageId && messageIds.has(a.messageId)).length;
  s.conversations = s.conversations.filter((c) => !targets.has(c.id));
  s.messages = s.messages.filter((m) => !targets.has(m.conversationId));
  s.attachments = s.attachments.filter((a) => !(a.messageId && messageIds.has(a.messageId)));
  s.activity = s.activity.filter((a) => !(a.conversationId && targets.has(a.conversationId)));
  s.notifications = s.notifications.filter((n) => !(n.link && targets.has(n.link.replace('/inbox/', ''))));
  for (const key of Object.keys(s.reads)) if (targets.has(key.split(':')[0])) delete s.reads[key];
  const orphan = (id: string) => {
    const c = s.contacts.find((x) => x.id === id);
    return c && !c.clientId && !c.email && !c.notes && !c.roleAtClient && !s.conversations.some((x) => x.contactId === id) && !s.messages.some((m) => m.senderContactId === id) && !s.calls.some((x) => x.contactId === id);
  };
  const gone = [...contactIds].filter(orphan);
  s.contacts = s.contacts.filter((c) => !gone.includes(c.id));
  touch();
  emit(rooms.everyone, 'conversations.removed', { inboxId: inbox.id, ids: [...targets] });
  const res = { conversations: targets.size, messages: removedMessages.length, files, contacts: gone.length };
  audit(me.id, 'inbox.whatsapp_untracked_removed', { type: 'inbox', id: inbox.id }, res);
  return res;
});

route(
  'PUT',
  '/inboxes/:id/whatsapp/owner',
  ({ me, params, body }) => {
    const inbox = load(me, params.id);
    const userId = typeof body.userId === 'string' && body.userId ? body.userId : null;
    if (userId && !db().users.some((u) => u.id === userId)) throw badRequest('Choose an active team member');
    const previous = ownerId(inbox);
    inbox.config = { ...inbox.config, ownerId: userId };
    if (userId && !inbox.memberIds.includes(userId)) inbox.memberIds = [...inbox.memberIds, userId];
    touch();
    audit(me.id, 'inbox.whatsapp_owner', { type: 'inbox', id: inbox.id }, { ownerId: userId, previousOwnerId: previous });
    emit(rooms.everyone, 'inbox.updated', { id: inbox.id, status: inbox.status });
    return summary(me, inbox);
  },
  { roles: ADMIN_ROLES },
);

route('GET', '/inboxes/:id/whatsapp/link', ({ me, params }) => {
  const inbox = load(me, params.id);
  const open = inbox.status === 'connected';
  return { state: open ? 'open' : 'close', status: inbox.status, statusDetail: inbox.statusDetail, qr: null, pairingCode: null };
});

route('POST', '/inboxes/:id/whatsapp/link', ({ me, params }) => {
  load(me, params.id);
  throw notInDemo('linking a WhatsApp number needs the WhatsApp service running on a server');
});

route('POST', '/inboxes/:id/whatsapp/unlink', ({ me, params }) => {
  load(me, params.id);
  throw notInDemo('the demo number stays linked so there is something to look at');
});
