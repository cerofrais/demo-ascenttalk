/**
 * Reports (routes/reports.ts). The API computes these in SQL; here the same numbers are counted over the
 * conversations of the last week plus the compact back history (history.ts), so 30 and 90 day ranges have a
 * believable shape.
 */
import type { ChannelType } from '@/lib/api';
import { inReportScope, type Viewer } from '../access';
import { history } from '../history';
import { invalid, qenum, qstr, route } from '../http';
import { db, type DemoState } from '../store';
import { startOfDay } from '../util';

const DAY = 86_400_000;

/** One conversation as the report queries see it, whether it still exists in the inbox or only in history. */
interface Row {
  id: string | null;
  createdAt: number;
  firstResponseAt: number | null;
  resolvedAt: number | null;
  lastMessageAt: number;
  open: boolean;
  inboxId: string;
  channelType: ChannelType | null;
  assigneeId: string | null;
  teamId: string | null;
  clientId: string | null;
  /** Message timestamps (live conversations) */
  incomingAt: number[];
  outgoingAt: number[];
}

interface Filters {
  inboxId?: string;
  teamId?: string;
  clientId?: string;
}

function range(query: URLSearchParams): { from: number; to: number; filters: Filters } {
  const parse = (key: string): Date | undefined => {
    const raw = qstr(query, key);
    if (raw === undefined) return undefined;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw invalid(key);
    return d;
  };
  const to = parse('to') ?? new Date();
  const from = parse('from') ?? new Date(to.getTime() - 29 * DAY);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from: from.getTime(), to: to.getTime(), filters: { inboxId: qstr(query, 'inboxId'), teamId: qstr(query, 'teamId'), clientId: qstr(query, 'clientId') } };
}

function rowsFor(me: Viewer, s: DemoState, f: Filters): Row[] {
  const keep = (c: { assigneeId: string | null; teamId: string | null; inboxId: string; clientId: string | null }) =>
    inReportScope(me, c, s) && (!f.inboxId || c.inboxId === f.inboxId) && (!f.teamId || c.teamId === f.teamId) && (!f.clientId || c.clientId === f.clientId);

  const rows: Row[] = [];
  const live = new Map<string, Row>();
  for (const c of s.conversations) {
    if (!keep(c)) continue;
    const row: Row = {
      id: c.id,
      createdAt: Date.parse(c.createdAt),
      firstResponseAt: c.firstResponseAt ? Date.parse(c.firstResponseAt) : null,
      resolvedAt: c.resolvedAt ? Date.parse(c.resolvedAt) : null,
      lastMessageAt: Date.parse(c.lastMessageAt),
      open: c.status === 'OPEN',
      inboxId: c.inboxId,
      channelType: s.inboxes.find((i) => i.id === c.inboxId)?.channelType ?? null,
      assigneeId: c.assigneeId,
      teamId: c.teamId,
      clientId: c.clientId,
      incomingAt: [],
      outgoingAt: [],
    };
    rows.push(row);
    live.set(c.id, row);
  }
  for (const m of s.messages) {
    if (m.kind !== 'MESSAGE') continue;
    const row = live.get(m.conversationId);
    if (row) (m.direction === 'INCOMING' ? row.incomingAt : row.outgoingAt).push(Date.parse(m.createdAt));
  }
  // The history only refers to the inboxes, people and clients the data set starts with; anything since
  // deleted simply stops matching, as its rows would have gone from the database.
  const inboxIds = new Set(s.inboxes.map((i) => i.id));
  for (const p of history(s.baseTime).conversations) {
    if (!inboxIds.has(p.inboxId)) continue;
    const c = {
      assigneeId: s.users.some((u) => u.id === p.assigneeId) ? p.assigneeId : null,
      teamId: p.teamId && s.teams.some((t) => t.id === p.teamId) ? p.teamId : null,
      inboxId: p.inboxId,
      clientId: p.clientId && s.clients.some((x) => x.id === p.clientId) ? p.clientId : null,
    };
    if (!keep(c)) continue;
    // the client wrote on the day the conversation opened; the replies are spread from first response to resolution
    const outgoingAt: number[] = [];
    for (let i = 0; i < p.outgoing; i++) outgoingAt.push(p.firstResponseAt + ((p.resolvedAt - p.firstResponseAt) * i) / Math.max(1, p.outgoing));
    const incomingAt: number[] = [];
    for (let i = 0; i < p.incoming; i++) incomingAt.push(p.createdAt + ((p.resolvedAt - p.createdAt) * i) / Math.max(1, p.incoming + 1));
    rows.push({ id: null, createdAt: p.createdAt, firstResponseAt: p.firstResponseAt, resolvedAt: p.resolvedAt, lastMessageAt: p.resolvedAt, open: false, channelType: p.channelType, ...c, incomingAt, outgoingAt });
  }
  return rows;
}

const within = (t: number | null, from: number, to: number): t is number => t !== null && t >= from && t <= to;

/** PERCENTILE_CONT: linear interpolation between the two nearest values. */
function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

interface CallRow {
  startedAt: number;
  userId: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  durationSec: number;
  conversationId: string | null;
}

function allCalls(s: DemoState): CallRow[] {
  return [
    ...s.calls.map((k) => ({ startedAt: Date.parse(k.startedAt), userId: k.userId, direction: k.direction, status: k.status, durationSec: k.durationSec ?? 0, conversationId: k.conversationId })),
    ...history(s.baseTime).calls.map((k) => ({ ...k, userId: k.userId && s.users.some((u) => u.id === k.userId) ? k.userId : null, conversationId: null })),
  ];
}

route('GET', '/reports/overview', ({ me, query }) => {
  const s = db();
  const { from, to, filters } = range(query);
  const rows = rowsFor(me, s, filters);
  const inScope = new Set(rows.map((r) => r.id).filter((id): id is string => id !== null));

  // one bucket per calendar day of the range
  const buckets = new Map<number, { day: string; created: number; resolved: number; incoming: number; outgoing: number; calls: number }>();
  for (let d = new Date(from); d.getTime() <= to; d.setDate(d.getDate() + 1)) {
    // The API sends a SQL date; local midnight keeps the label on the right day in every time zone.
    buckets.set(d.getTime(), { day: new Date(d.getTime()).toISOString(), created: 0, resolved: 0, incoming: 0, outgoing: 0, calls: 0 });
  }
  const bucket = (t: number | null) => (t === null ? undefined : buckets.get(startOfDay(t)));
  for (const r of rows) {
    const created = bucket(r.createdAt);
    if (created) created.created++;
    const resolved = bucket(r.resolvedAt);
    if (resolved) resolved.resolved++;
    for (const t of r.incomingAt) {
      const b = bucket(t);
      if (b) b.incoming++;
    }
    for (const t of r.outgoingAt) {
      const b = bucket(t);
      if (b) b.outgoing++;
    }
  }
  for (const k of allCalls(s)) {
    if (k.conversationId && !inScope.has(k.conversationId)) continue;
    const b = bucket(k.startedAt);
    if (b) b.calls++;
  }
  const daily = [...buckets.values()];
  const sum = (key: 'incoming' | 'outgoing' | 'calls') => daily.reduce((n, d) => n + d[key], 0);
  const responded = rows.filter((r) => within(r.firstResponseAt, from, to));
  const resolved = rows.filter((r) => within(r.resolvedAt, from, to));
  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    totals: {
      created: rows.filter((r) => within(r.createdAt, from, to)).length,
      resolved: resolved.length,
      openNow: rows.filter((r) => r.open).length,
      unassignedNow: rows.filter((r) => r.open && !r.assigneeId).length,
      firstResponseMedianSec: percentile(responded.map((r) => (r.firstResponseAt! - r.createdAt) / 1000), 0.5),
      firstResponseP90Sec: percentile(responded.map((r) => (r.firstResponseAt! - r.createdAt) / 1000), 0.9),
      resolutionMedianSec: percentile(resolved.map((r) => (r.resolvedAt! - r.createdAt) / 1000), 0.5),
      incoming: sum('incoming'),
      outgoing: sum('outgoing'),
      calls: sum('calls'),
    },
    daily,
  };
});

const DIMENSIONS = ['channel', 'user', 'team', 'client', 'inbox'] as const;

route('GET', '/reports/breakdown', ({ me, query }) => {
  const s = db();
  const dimension = qenum(query, 'dimension', DIMENSIONS, 'channel');
  const { from, to, filters } = range(query);
  const keyOf = (r: Row): string => {
    switch (dimension) {
      case 'channel':
        return r.channelType ?? 'UNKNOWN';
      case 'inbox':
        return s.inboxes.find((i) => i.id === r.inboxId)?.name ?? 'Inbox';
      case 'user':
        return s.users.find((u) => u.id === r.assigneeId)?.name ?? 'Unassigned';
      case 'team':
        return s.teams.find((t) => t.id === r.teamId)?.name ?? 'No team';
      default:
        return s.clients.find((c) => c.id === r.clientId)?.name ?? 'No client';
    }
  };
  const groups = new Map<string, { key: string; created: number; resolved: number; openNow: number; frt: number[]; incoming: number; outgoing: number }>();
  for (const r of rowsFor(me, s, filters)) {
    if (!(r.lastMessageAt >= from || r.open)) continue;
    const key = keyOf(r);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, created: 0, resolved: 0, openNow: 0, frt: [], incoming: 0, outgoing: 0 }));
    if (within(r.createdAt, from, to)) g.created++;
    if (within(r.resolvedAt, from, to)) g.resolved++;
    if (r.open) g.openNow++;
    if (within(r.firstResponseAt, from, to)) g.frt.push((r.firstResponseAt - r.createdAt) / 1000);
    g.incoming += r.incomingAt.filter((t) => t >= from && t <= to).length;
    g.outgoing += r.outgoingAt.filter((t) => t >= from && t <= to).length;
  }
  return {
    dimension,
    rows: [...groups.values()]
      .sort((a, b) => b.created - a.created || b.openNow - a.openNow || a.key.localeCompare(b.key))
      .slice(0, 100)
      .map((g) => ({ key: g.key, created: g.created, resolved: g.resolved, openNow: g.openNow, firstResponseAvgSec: g.frt.length ? g.frt.reduce((a, b) => a + b, 0) / g.frt.length : null, incoming: g.incoming, outgoing: g.outgoing })),
  };
});

route('GET', '/reports/calls', ({ query }) => {
  const s = db();
  const { from, to } = range(query);
  const groups = new Map<string, { key: string; inbound: number; outbound: number; missed: number; completed: number; completedDuration: number; totalDuration: number }>();
  for (const k of allCalls(s)) {
    if (k.startedAt < from || k.startedAt > to) continue;
    const key = s.users.find((u) => u.id === k.userId)?.name ?? 'Unanswered';
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, inbound: 0, outbound: 0, missed: 0, completed: 0, completedDuration: 0, totalDuration: 0 }));
    if (k.direction === 'INBOUND') g.inbound++;
    else g.outbound++;
    if (k.status === 'MISSED' || k.status === 'VOICEMAIL') g.missed++;
    if (k.status === 'COMPLETED') {
      g.completed++;
      g.completedDuration += k.durationSec;
    }
    g.totalDuration += k.durationSec;
  }
  const byUser = [...groups.values()].sort((a, b) => b.inbound + b.outbound - (a.inbound + a.outbound) || a.key.localeCompare(b.key));
  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    totals: byUser.reduce(
      (t, r) => ({ inbound: t.inbound + r.inbound, outbound: t.outbound + r.outbound, missed: t.missed + r.missed, completed: t.completed + r.completed, totalDuration: t.totalDuration + r.totalDuration }),
      { inbound: 0, outbound: 0, missed: 0, completed: 0, totalDuration: 0 },
    ),
    byUser: byUser.map((r) => ({ key: r.key, inbound: r.inbound, outbound: r.outbound, missed: r.missed, completed: r.completed, avgDurationSec: r.completed ? Math.round(r.completedDuration / r.completed) : 0, totalDurationSec: r.totalDuration })),
  };
});
