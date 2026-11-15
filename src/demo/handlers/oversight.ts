/** Oversight for managers and admins, internal chat visibility and the audit log (routes/oversight.ts). */
import type { CallInfo, ChatMessage, Conversation, Presence, UserBrief } from '@/lib/api';
import { ADMIN_ROLES, MANAGER_ROLES, isAdmin, visibleConversations } from '../access';
import { audit, serializeActivity } from '../core';
import { ATTENTION_HOURS, INTERNAL_VISIBILITY } from '../features';
import { history } from '../history';
import { forbidden, invalid, notFound, qnum, qstr, route } from '../http';
import { presenceOf } from '../realtime';
import { serializeCall, serializeChatMessage, serializeConversation, userBrief } from '../serialize';
import { db } from '../store';
import { startOfDay } from '../util';

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** A `before` / date filter the way `new Date(x)` reads it in the API. */
function dateParam(raw: string | undefined, key: string): string | undefined {
  if (raw === undefined) return undefined;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) throw invalid(key);
  return new Date(t).toISOString();
}

/** Live activity feed across the agency (managers: scoped to the conversations they can see). */
route(
  'GET',
  '/oversight/activity',
  ({ me, query }) => {
    const s = db();
    const before = dateParam(qstr(query, 'before'), 'before');
    const clientId = qstr(query, 'clientId');
    const userId = qstr(query, 'userId');
    const channelType = qstr(query, 'channelType');
    const type = qstr(query, 'type');
    const limit = qnum(query, 'limit', 60, 1, 200);
    const admin = isAdmin(me);
    const seen = admin ? null : new Set(visibleConversations(me, s).map((c) => c.id));
    const events = s.activity
      .filter((e) => {
        if (seen && !(e.conversationId === null || seen.has(e.conversationId) || e.actorUserId === me.id)) return false;
        if (before && !(e.createdAt < before)) return false;
        if (clientId && e.clientId !== clientId) return false;
        if (userId && e.actorUserId !== userId) return false;
        if (channelType && e.channelType !== channelType) return false;
        if (type && !e.type.startsWith(type)) return false;
        return true;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .slice(0, limit);
    return { events: events.map(serializeActivity) };
  },
  { roles: MANAGER_ROLES },
);

interface WorkloadRow extends UserBrief {
  lastSeenAt: string | null;
  presence: Presence;
  onCall: boolean;
  open: number;
  pending: number;
  snoozed: number;
  waiting: number;
  overdue: number;
  repliesToday: number;
  callsToday: number;
  avgFirstResponseSec: number | null;
}

/** Per-person workload: open/pending/waiting, today's replies, average first response, presence. */
route(
  'GET',
  '/oversight/workload',
  ({ me }): { attentionHours: number; users: WorkloadRow[] } => {
    const s = db();
    const admin = isAdmin(me);
    const users = s.users
      .filter((u) => u.active && (admin || u.id === me.id || s.teams.some((t) => me.teamIds.includes(t.id) && t.memberIds.includes(u.id))))
      .sort((a, b) => a.name.localeCompare(b.name));
    const today = startOfDay(Date.now());
    const todayIso = new Date(today).toISOString();
    const overdueBefore = new Date(Date.now() - ATTENTION_HOURS * HOUR).toISOString();
    const weekAgo = Date.now() - 7 * DAY;
    const weekAgoIso = new Date(weekAgo).toISOString();
    const past = history(s.baseTime).conversations.filter((c) => c.firstResponseAt >= weekAgo);
    return {
      attentionHours: ATTENTION_HOURS,
      users: users.map((u) => {
        const mine = s.conversations.filter((c) => c.assigneeId === u.id);
        const frt = [
          ...s.conversations.filter((c) => c.assigneeId === u.id && c.firstResponseAt && c.firstResponseAt >= weekAgoIso).map((c) => (Date.parse(c.firstResponseAt!) - Date.parse(c.createdAt)) / 1000),
          ...past.filter((c) => c.assigneeId === u.id).map((c) => (c.firstResponseAt - c.createdAt) / 1000),
        ];
        return {
          ...userBrief(u, 'full')!,
          lastSeenAt: u.lastSeenAt,
          presence: presenceOf(u.id),
          onCall: false,
          open: mine.filter((c) => c.status === 'OPEN').length,
          pending: mine.filter((c) => c.status === 'PENDING').length,
          snoozed: mine.filter((c) => c.status === 'SNOOZED').length,
          waiting: mine.filter((c) => c.status === 'OPEN' && c.waitingSince).length,
          overdue: mine.filter((c) => c.status === 'OPEN' && c.waitingSince && c.waitingSince < overdueBefore).length,
          repliesToday: s.messages.filter((m) => m.senderUserId === u.id && m.kind === 'MESSAGE' && m.direction === 'OUTGOING' && m.createdAt >= todayIso).length,
          callsToday: s.calls.filter((k) => k.userId === u.id && k.startedAt >= todayIso).length,
          avgFirstResponseSec: frt.length ? frt.reduce((a, b) => a + b, 0) / frt.length : null,
        };
      }),
    };
  },
  { roles: MANAGER_ROLES },
);

/** Things that need a manager's eyes right now. */
route(
  'GET',
  '/oversight/attention',
  ({ me }): { attentionHours: number; overdue: Conversation[]; unassigned: Conversation[]; urgent: Conversation[]; missedCalls: CallInfo[]; failedMessages: { id: string; content: string | null; error: string | null; createdAt: string; conversation: Conversation }[] } => {
    const s = db();
    const scope = visibleConversations(me, s);
    const overdueBefore = new Date(Date.now() - ATTENTION_HOURS * HOUR).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * DAY).toISOString();
    const newestFirst = (a: { lastMessageAt: string }, b: { lastMessageAt: string }) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1);
    const overdue = scope
      .filter((c) => c.status === 'OPEN' && c.waitingSince && c.waitingSince < overdueBefore)
      .sort((a, b) => (a.waitingSince! < b.waitingSince! ? -1 : 1))
      .slice(0, 50);
    const unassigned = scope.filter((c) => c.status === 'OPEN' && !c.assigneeId).sort(newestFirst).slice(0, 50);
    const urgent = scope.filter((c) => (c.status === 'OPEN' || c.status === 'PENDING') && (c.priority === 'HIGH' || c.priority === 'URGENT')).sort(newestFirst).slice(0, 50);
    // A missed call is "handled" once someone called back or replied afterwards.
    const missedCalls = s.calls
      .filter((k) => (k.status === 'MISSED' || k.status === 'VOICEMAIL') && k.startedAt >= twoDaysAgo)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, 50)
      .filter((k) => !(k.conversationId && s.messages.some((m) => m.conversationId === k.conversationId && m.direction === 'OUTGOING' && (m.kind === 'MESSAGE' || m.kind === 'CALL') && m.createdAt > k.startedAt)));
    const visible = new Map(scope.map((c) => [c.id, c]));
    const failed = s.messages
      .filter((m) => m.status === 'FAILED' && m.createdAt >= twoDaysAgo && visible.has(m.conversationId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 30);
    return {
      attentionHours: ATTENTION_HOURS,
      overdue: overdue.map((c) => serializeConversation(c)),
      unassigned: unassigned.map((c) => serializeConversation(c)),
      urgent: urgent.map((c) => serializeConversation(c)),
      missedCalls: missedCalls.map((k) => serializeCall(k, 'full')),
      failedMessages: failed.map((m) => ({ id: m.id, content: m.content, error: m.error, createdAt: m.createdAt, conversation: serializeConversation(visible.get(m.conversationId)!) })),
    };
  },
  { roles: MANAGER_ROLES },
);

/** Snapshot numbers for the oversight header. */
route(
  'GET',
  '/oversight/summary',
  ({ me }) => {
    const s = db();
    const scope = visibleConversations(me, s);
    const ids = new Set(scope.map((c) => c.id));
    const today = new Date(startOfDay(Date.now())).toISOString();
    const open = scope.filter((c) => c.status === 'OPEN');
    const todays = s.messages.filter((m) => m.kind === 'MESSAGE' && m.createdAt >= today && ids.has(m.conversationId));
    return {
      open: open.length,
      unassigned: open.filter((c) => !c.assigneeId).length,
      waiting: open.filter((c) => c.waitingSince).length,
      resolvedToday: scope.filter((c) => c.resolvedAt && c.resolvedAt >= today).length,
      incomingToday: todays.filter((m) => m.direction === 'INCOMING').length,
      outgoingToday: todays.filter((m) => m.direction === 'OUTGOING' && m.senderUserId).length,
      callsToday: s.calls.filter((k) => k.startedAt >= today).length,
      internalMessagesToday: s.chatMessages.filter((m) => m.createdAt >= today && m.userId).length,
    };
  },
  { roles: MANAGER_ROLES },
);

// ─── Internal communication visibility (owner/admin, audited) ────────────────

const visibleKinds = (): string[] => (INTERNAL_VISIBILITY === 'all' ? ['PUBLIC', 'PRIVATE', 'DM', 'GROUP_DM'] : INTERNAL_VISIBILITY === 'channels' ? ['PUBLIC', 'PRIVATE'] : ['PUBLIC']);

route(
  'GET',
  '/oversight/internal/channels',
  () => {
    const s = db();
    const kinds = visibleKinds();
    const channels = s.channels
      .filter((c) => kinds.includes(c.kind))
      .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1))
      .slice(0, 300);
    return {
      visibility: INTERNAL_VISIBILITY,
      channels: channels.map((c) => {
        const members = c.members.map((m) => s.users.find((u) => u.id === m.userId)).filter((u) => u !== undefined);
        const client = c.clientId ? s.clients.find((x) => x.id === c.clientId) : undefined;
        return {
          id: c.id,
          kind: c.kind,
          name: c.kind === 'DM' || c.kind === 'GROUP_DM' ? members.map((u) => u.name).join(' ↔ ') : c.name,
          topic: c.topic,
          client: client ? { id: client.id, name: client.name } : null,
          archived: c.archived,
          members: members.map((u) => userBrief(u)!),
          messageCount: s.chatMessages.filter((m) => m.channelId === c.id).length,
          lastMessageAt: c.lastMessageAt,
        };
      }),
    };
  },
  { roles: ADMIN_ROLES },
);

route(
  'GET',
  '/oversight/internal/channels/:id/messages',
  ({ me, params, query }): { audited: boolean; messages: ChatMessage[] } => {
    const s = db();
    const before = dateParam(qstr(query, 'before'), 'before');
    const limit = qnum(query, 'limit', 100, 1, 200);
    const ch = s.channels.find((c) => c.id === params.id);
    if (!ch) throw notFound('Channel');
    if (!visibleKinds().includes(ch.kind)) throw forbidden(`oversight.internal_visibility is "${INTERNAL_VISIBILITY}"; this ${ch.kind.toLowerCase()} is not visible`);
    // Reading a private space is itself recorded, and shows up in the audit log.
    if (ch.kind !== 'PUBLIC') audit(me.id, 'oversight.internal_read', { type: 'channel', id: ch.id }, { kind: ch.kind, name: ch.name });
    const rows = s.chatMessages
      .filter((m) => m.channelId === ch.id && (!before || m.createdAt < before))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit)
      .reverse();
    return { audited: ch.kind !== 'PUBLIC', messages: rows.map(serializeChatMessage) };
  },
  { roles: ADMIN_ROLES },
);

// ─── Audit log ───────────────────────────────────────────────────────────────

route(
  'GET',
  '/audit-logs',
  ({ query }) => {
    const s = db();
    const before = dateParam(qstr(query, 'before'), 'before');
    const action = qstr(query, 'action');
    const actorId = qstr(query, 'actorId');
    const limit = qnum(query, 'limit', 100, -Infinity, 200);
    const logs = s.audit
      .filter((l) => (!before || l.createdAt < before) && (!action || l.action.startsWith(action)) && (!actorId || l.actorId === actorId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .slice(0, Math.max(0, limit))
      .map((l) => {
        const actor = l.actorId ? s.users.find((u) => u.id === l.actorId) : undefined;
        return { ...l, actor: actor ? { id: actor.id, name: actor.name, email: actor.email } : null };
      });
    return { logs };
  },
  { roles: ADMIN_ROLES },
);
