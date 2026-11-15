/** Inboxes (channel connections), calling and the call log (routes/inboxes.ts and routes/voice.ts). */
import type { CallInfo, ChannelType } from '@/lib/api';
import { ADMIN_ROLES, canSeeClient, isAdmin, isManagerUp } from '../access';
import { audit } from '../core';
import { badRequest, invalid, isStrArray, need, notFound, notInDemo, optional, optionalList, qenum, qnum, qstr, route } from '../http';
import { emit, rooms } from '../realtime';
import { META_VERIFY_TOKEN, origin, serializeCall, serializeInbox } from '../serialize';
import { db, newId, nowIso, touch, type DInbox } from '../store';

const CHANNELS: ChannelType[] = ['WHATSAPP', 'EMAIL', 'VOICE', 'WEBSITE', 'TELEGRAM', 'FACEBOOK', 'INSTAGRAM'];
/** Postgres sorts an enum column in the order the enum was declared. */
const CHANNEL_ORDER: ChannelType[] = ['WHATSAPP', 'EMAIL', 'VOICE', 'WEBSITE', 'TELEGRAM', 'FACEBOOK', 'INSTAGRAM', 'SMS'];

export function sortedInboxes(): DInbox[] {
  return [...db().inboxes].sort((a, b) => CHANNEL_ORDER.indexOf(a.channelType) - CHANNEL_ORDER.indexOf(b.channelType) || a.name.localeCompare(b.name));
}

/** Why a channel cannot be connected from a static demo. */
const NEEDS: Record<Exclude<ChannelType, 'WEBSITE' | 'SMS'>, string> = {
  WHATSAPP: 'linking a WhatsApp number needs the WhatsApp service running on a server',
  EMAIL: 'connecting a mailbox needs a real mail server to sign in to',
  VOICE: 'phone numbers come from a telephony provider account',
  TELEGRAM: 'a Telegram bot needs a server it can deliver messages to',
  FACEBOOK: 'a Facebook Page needs a server Meta can deliver messages to',
  INSTAGRAM: 'an Instagram account needs a server Meta can deliver messages to',
};

route('GET', '/inboxes', ({ me }) => ({ inboxes: sortedInboxes().map((i) => serializeInbox(i, isAdmin(me))) }));

/** What the API reports when no provider keys are set in .env. */
route(
  'GET',
  '/inboxes/providers',
  () => ({
    whatsapp: { enabled: true, configured: false, reachable: false },
    email: {
      enabled: true,
      google: { enabled: true, configured: false, redirectUri: `${origin()}/api/oauth/google/callback` },
      microsoft: { enabled: true, configured: false, redirectUri: `${origin()}/api/oauth/microsoft/callback` },
      imapPassword: { enabled: true },
    },
    voice: { enabled: true, configured: false },
    website: { enabled: true },
    telegram: { enabled: true, publicUrl: origin() },
    facebook: { enabled: true, appSecretConfigured: false, webhook: `${origin()}/webhooks/meta`, verifyToken: META_VERIFY_TOKEN },
    instagram: { enabled: true, appSecretConfigured: false },
    publicUrl: origin(),
  }),
  { roles: ADMIN_ROLES },
);

route(
  'GET',
  '/voice/numbers',
  () => {
    throw notInDemo(NEEDS.VOICE);
  },
  { roles: ADMIN_ROLES },
);

route(
  'POST',
  '/inboxes',
  ({ me, body }) => {
    const s = db();
    const name = need(body, 'name');
    const channelType = body.channelType as ChannelType;
    if (!CHANNELS.includes(channelType)) throw invalid('channelType');
    const teamId = optional(body, 'teamId');
    const memberIds = optionalList(body, 'memberIds');
    const greeting = optional(body, 'greeting');
    if (channelType !== 'WEBSITE') throw notInDemo(NEEDS[channelType as keyof typeof NEEDS]);

    const inbox: DInbox = {
      id: newId('ib'),
      name,
      channelType,
      config: { websiteUrl: optional(body, 'websiteUrl') ?? null, widgetColor: optional(body, 'widgetColor') ?? '#4f46e5', welcomeTitle: 'Hi there 👋', welcomeTagline: 'We usually reply in a few minutes.' },
      externalId: null,
      token: `web-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
      status: 'connected',
      statusDetail: null,
      teamId: teamId && s.teams.some((t) => t.id === teamId) ? teamId : null,
      greeting: greeting ?? null,
      signature: null,
      enabled: true,
      memberIds: (memberIds ?? []).filter((id) => s.users.some((u) => u.id === id)),
      createdAt: nowIso(),
    };
    s.inboxes.push(inbox);
    touch();
    audit(me.id, 'inbox.created', { type: 'inbox', id: inbox.id }, { channelType: inbox.channelType, name: inbox.name });
    emit(rooms.everyone, 'inbox.updated', { id: inbox.id, status: inbox.status });
    return { inbox: serializeInbox(inbox, true) };
  },
  { roles: ADMIN_ROLES },
);

function findInbox(id: string, what = 'Inbox'): DInbox {
  const inbox = db().inboxes.find((i) => i.id === id);
  if (!inbox) throw notFound(what);
  return inbox;
}

function whatsappInbox(id: string): DInbox {
  const inbox = db().inboxes.find((i) => i.id === id && i.channelType === 'WHATSAPP');
  if (!inbox) throw notFound('WhatsApp inbox');
  return inbox;
}

route('GET', '/inboxes/:id', ({ me, params }) => ({ inbox: serializeInbox(findInbox(params.id), isAdmin(me)) }));

route(
  'PATCH',
  '/inboxes/:id',
  ({ me, params, body }) => {
    const s = db();
    const patch: { name?: string; teamId?: string | null; memberIds?: string[]; greeting?: string | null; signature?: string | null; enabled?: boolean; config?: Record<string, any> } = {};
    if (body.name !== undefined) patch.name = need(body, 'name');
    for (const key of ['teamId', 'greeting', 'signature'] as const) {
      const v = optional(body, key);
      if (v !== undefined) patch[key] = v;
    }
    if (body.memberIds !== undefined) {
      if (!isStrArray(body.memberIds)) throw invalid('memberIds');
      patch.memberIds = body.memberIds;
    }
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') throw invalid('enabled');
      patch.enabled = body.enabled;
    }
    if (body.config !== undefined) {
      if (!body.config || typeof body.config !== 'object' || Array.isArray(body.config)) throw invalid('config');
      patch.config = body.config;
    }
    const inbox = findInbox(params.id);
    if (patch.name !== undefined) inbox.name = patch.name;
    if (patch.teamId !== undefined) inbox.teamId = patch.teamId && s.teams.some((t) => t.id === patch.teamId) ? patch.teamId : null;
    if (patch.greeting !== undefined) inbox.greeting = patch.greeting;
    if (patch.signature !== undefined) inbox.signature = patch.signature;
    if (patch.enabled !== undefined) inbox.enabled = patch.enabled;
    if (patch.memberIds) inbox.memberIds = [...new Set(patch.memberIds)].filter((id) => s.users.some((u) => u.id === id));
    if (patch.config) inbox.config = { ...inbox.config, ...patch.config };
    touch();
    audit(me.id, 'inbox.updated', { type: 'inbox', id: inbox.id }, { ...patch, config: undefined });
    emit(rooms.everyone, 'inbox.updated', { id: inbox.id, status: inbox.status });
    return { inbox: serializeInbox(inbox, true) };
  },
  { roles: ADMIN_ROLES },
);

route(
  'DELETE',
  '/inboxes/:id',
  ({ me, params }) => {
    const s = db();
    const inbox = findInbox(params.id);
    // Conversations (and their messages, files and feed entries) go with the inbox; calls only lose the link.
    const gone = new Set(s.conversations.filter((c) => c.inboxId === inbox.id).map((c) => c.id));
    const goneMessages = new Set(s.messages.filter((m) => gone.has(m.conversationId)).map((m) => m.id));
    s.conversations = s.conversations.filter((c) => !gone.has(c.id));
    s.messages = s.messages.filter((m) => !gone.has(m.conversationId));
    s.attachments = s.attachments.filter((a) => !a.messageId || !goneMessages.has(a.messageId));
    s.activity = s.activity.filter((e) => !e.conversationId || !gone.has(e.conversationId));
    for (const key of Object.keys(s.reads)) if (gone.has(key.slice(0, key.lastIndexOf(':')))) delete s.reads[key];
    for (const k of s.calls) {
      if (k.inboxId === inbox.id) k.inboxId = null;
      if (k.conversationId && gone.has(k.conversationId)) k.conversationId = null;
      if (k.messageId && goneMessages.has(k.messageId)) k.messageId = null;
    }
    for (const token of Object.keys(s.widgetSessions)) if (token === inbox.token) delete s.widgetSessions[token];
    s.inboxes = s.inboxes.filter((i) => i.id !== inbox.id);
    touch();
    audit(me.id, 'inbox.deleted', { type: 'inbox', id: inbox.id }, { name: inbox.name, channelType: inbox.channelType });
    emit(rooms.everyone, 'inbox.deleted', { id: inbox.id });
    return { ok: true };
  },
  { roles: ADMIN_ROLES },
);

// WhatsApp connection management

route(
  'POST',
  '/inboxes/:id/whatsapp/connect',
  ({ params, body }) => {
    whatsappInbox(params.id);
    const phone = optional(body, 'phoneNumber');
    const digits = phone?.replace(/\D/g, '') ?? '';
    if (phone && (digits.length < 8 || digits.length > 15)) throw badRequest('Enter the full WhatsApp number with country code, for example 919876543210');
    throw notInDemo(`${NEEDS.WHATSAPP}. "Reset demo data" brings the sample inbox back`);
  },
  { roles: ADMIN_ROLES },
);

route(
  'GET',
  '/inboxes/:id/whatsapp/status',
  ({ params }) => {
    const inbox = whatsappInbox(params.id);
    const open = inbox.status === 'connected';
    return { state: open ? 'open' : 'close', qr: null, pairingCode: null, status: inbox.status };
  },
  { roles: ADMIN_ROLES },
);

route(
  'POST',
  '/inboxes/:id/whatsapp/logout',
  ({ me, params }) => {
    const inbox = whatsappInbox(params.id);
    if (inbox.status !== 'disconnected') {
      inbox.status = 'disconnected';
      inbox.statusDetail = null;
      touch();
      emit(rooms.everyone, 'inbox.updated', { id: inbox.id, status: inbox.status, statusDetail: inbox.statusDetail });
    }
    audit(me.id, 'inbox.whatsapp_logout', { type: 'inbox', id: inbox.id });
    return { ok: true };
  },
  { roles: ADMIN_ROLES },
);

route(
  'POST',
  '/inboxes/:id/reconnect',
  ({ params }) => {
    const inbox = findInbox(params.id);
    if (inbox.channelType === 'WEBSITE') {
      if (inbox.status !== 'connected') {
        inbox.status = 'connected';
        inbox.statusDetail = null;
        touch();
        emit(rooms.everyone, 'inbox.updated', { id: inbox.id, status: inbox.status });
      }
      return { ok: true };
    }
    throw notInDemo(NEEDS[inbox.channelType as keyof typeof NEEDS] ?? 'this channel needs its provider');
  },
  { roles: ADMIN_ROLES },
);

route(
  'GET',
  '/inboxes/:id/webhook-info',
  ({ params }) => {
    const inbox = findInbox(params.id);
    return {
      telegram: inbox.channelType === 'TELEGRAM' ? `${origin()}/webhooks/telegram/${inbox.token}` : undefined,
      meta: inbox.channelType === 'FACEBOOK' || inbox.channelType === 'INSTAGRAM' ? { url: `${origin()}/webhooks/meta`, verifyToken: META_VERIFY_TOKEN } : undefined,
      plivo: inbox.channelType === 'VOICE' ? `${origin()}/webhooks/plivo/answer?t=demo` : undefined,
    };
  },
  { roles: ADMIN_ROLES },
);

// ─── Calling ─────────────────────────────────────────────────────────────────

/**
 * voiceConfigFor(). `configured: false` is what the API says without Plivo credentials: the softphone then
 * shows "Calling isn't connected" and never loads the browser calling SDK.
 */
route('GET', '/voice/config', ({ user }) => ({
  enabled: true,
  configured: false,
  callMode: user.callMode,
  phone: user.phone,
  softphone: true,
  mobileBridge: true,
  endpoint: null,
  lines: db()
    .inboxes.filter((i) => i.channelType === 'VOICE' && i.enabled)
    .map((l) => ({ id: l.id, name: l.name, phoneNumber: (l.config?.phoneNumber as string | undefined) ?? null, status: l.status })),
  error: null,
}));

route('POST', '/voice/calls', ({ body }) => {
  const to = need(body, 'to');
  if (to.length < 5) throw invalid('to');
  throw notInDemo('placing a call needs a telephony provider');
});

route('POST', '/voice/calls/:id/hangup', ({ params }) => {
  const s = db();
  const call = s.calls.find((k) => k.id === params.id);
  if (!call) throw notFound('Call');
  if (!call.endedAt) {
    call.endedAt = nowIso();
    call.hangupCause = 'agent_hangup';
    if (call.status === 'RINGING' || call.status === 'QUEUED') call.status = 'NO_ANSWER';
    else if (call.status === 'IN_PROGRESS') call.status = 'COMPLETED';
    touch();
    emit([rooms.admins, rooms.oversight, call.userId ? rooms.user(call.userId) : null], 'call.updated', serializeCall(call));
  }
  return { ok: true };
});

route('GET', '/calls', ({ me, query }): { calls: CallInfo[]; nextCursor: string | null } => {
  const s = db();
  const userId = qstr(query, 'userId');
  const clientId = qstr(query, 'clientId');
  const status = qstr(query, 'status');
  const direction = qenum(query, 'direction', ['INBOUND', 'OUTBOUND'] as const);
  const mine = qstr(query, 'mine') === 'true';
  const cursor = qstr(query, 'cursor');
  const limit = qnum(query, 'limit', 50, 1, 100);
  const all = isManagerUp(me);
  const rows = s.calls
    .filter((k) => {
      if (!all) {
        const client = k.clientId ? s.clients.find((c) => c.id === k.clientId) : undefined;
        const ringing: unknown = k.meta?.ringing;
        if (k.userId !== me.id && !(client && canSeeClient(me, client, s)) && !(Array.isArray(ringing) && ringing.includes(me.id))) return false;
      }
      if (mine && k.userId !== me.id) return false;
      if (userId && k.userId !== userId) return false;
      if (clientId && k.clientId !== clientId) return false;
      if (status && k.status !== status) return false;
      if (direction && k.direction !== direction) return false;
      return true;
    })
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : a.id < b.id ? 1 : -1));
  const start = cursor ? rows.findIndex((k) => k.id === cursor) + 1 : 0;
  const page = rows.slice(start, start + limit);
  return { calls: page.map((k) => serializeCall(k)), nextCursor: rows.length > start + limit ? page[page.length - 1].id : null };
});
