'use client';
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, duration } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { Card, Empty, PageHeader, PageLoader, Stat, Tabs } from '@/components/ui/misc';
import { Select } from '@/components/ui/form';

interface Overview {
  totals: { created: number; resolved: number; openNow: number; unassignedNow: number; firstResponseMedianSec: number | null; firstResponseP90Sec: number | null; resolutionMedianSec: number | null; incoming: number; outgoing: number; calls: number };
  daily: { day: string; created: number; resolved: number; incoming: number; outgoing: number; calls: number }[];
}
interface BreakdownRow {
  key: string;
  created: number;
  resolved: number;
  openNow: number;
  firstResponseAvgSec: number | null;
  incoming: number;
  outgoing: number;
}
interface CallsReport {
  totals: { inbound: number; outbound: number; missed: number; completed: number; totalDuration: number };
  byUser: { key: string; inbound: number; outbound: number; missed: number; completed: number; avgDurationSec: number; totalDurationSec: number }[];
}

type Dimension = 'channel' | 'user' | 'team' | 'client' | 'inbox';
const SERIES = { a: 'var(--series-1)', b: 'var(--series-2)' };
const CHANNEL_NAMES: Record<string, string> = { WHATSAPP: 'WhatsApp', EMAIL: 'Email', VOICE: 'Phone', WEBSITE: 'Website chat', TELEGRAM: 'Telegram', FACEBOOK: 'Messenger', INSTAGRAM: 'Instagram', SMS: 'SMS' };

function Legend({ items, shape }: { items: { label: string; color: string }[]; shape: 'line' | 'rect' }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-fg-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={cn(shape === 'line' ? 'h-0.5 w-4 rounded' : 'h-2.5 w-2.5 rounded-[3px]')} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function TipBox({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-pop">
      <p className="mb-1 text-[11px] text-fg-3">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-xs">
          <span className="h-0.5 w-3 rounded" style={{ background: p.color }} />
          <b className="text-fg tabular-nums">{p.value}</b>
          <span className="text-fg-2">{p.name}</span>
        </p>
      ))}
    </div>
  );
}

const axis = { fontSize: 11, fill: 'var(--text-3)' };

export default function ReportsPage() {
  const { features, isManager, inboxes, teams } = useApp();
  const [days, setDays] = useState(30);
  const [inboxId, setInboxId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [dimension, setDimension] = useState<Dimension>('channel');
  const [table, setTable] = useState(false);
  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(Date.now() - (days - 1) * 86400_000);
    return { from: from.toISOString(), to: to.toISOString() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);
  const filters = { ...range, inboxId, teamId };
  const enabled = features.reports && isManager;
  const overview = useQuery({ queryKey: ['report-overview', days, inboxId, teamId], queryFn: () => api.get<Overview>('/reports/overview', filters), enabled, placeholderData: keepPreviousData });
  const breakdown = useQuery({ queryKey: ['report-breakdown', days, inboxId, teamId, dimension], queryFn: () => api.get<{ rows: BreakdownRow[] }>('/reports/breakdown', { ...filters, dimension }), enabled, placeholderData: keepPreviousData });
  const calls = useQuery({ queryKey: ['report-calls', days], queryFn: () => api.get<CallsReport>('/reports/calls', range), enabled: enabled && features.channels.VOICE, placeholderData: keepPreviousData });

  if (!enabled) return <Empty icon={<BarChart3 className="h-5 w-5" />} title="Reports are for managers and admins" />;
  const t = overview.data?.totals;
  const daily = (overview.data?.daily ?? []).map((d) => ({ ...d, label: format(new Date(d.day), 'd MMM') }));
  const maxCreated = Math.max(1, ...(breakdown.data?.rows ?? []).map((r) => r.created + r.openNow));
  const tick = Math.max(0, Math.ceil(daily.length / 8) - 1);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader title="Reports" subtitle="Volumes, response times and call activity across channels, people and clients." />
      {/* One filter row scoping everything below */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2 md:px-6">
        <Tabs<string> value={String(days)} onChange={(v) => setDays(Number(v))} items={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
        <Select value={inboxId} onChange={(e) => setInboxId(e.target.value)} className="h-8 w-auto text-xs" aria-label="Inbox">
          <option value="">All inboxes</option>
          {inboxes.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
        <Select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="h-8 w-auto text-xs" aria-label="Team">
          <option value="">All teams</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name}
            </option>
          ))}
        </Select>
      </div>

      {overview.isLoading ? (
        <PageLoader />
      ) : (
        <div className={cn('space-y-4 p-4 transition-opacity md:p-6', overview.isFetching && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Conversations opened" value={t?.created ?? 0} hint={`${t?.resolved ?? 0} resolved in this period`} />
            <Stat label="Median first response" value={duration(t?.firstResponseMedianSec)} hint={`90% answered within ${duration(t?.firstResponseP90Sec)}`} />
            <Stat label="Median time to resolve" value={duration(t?.resolutionMedianSec)} />
            <Stat label="Open right now" value={t?.openNow ?? 0} hint={`${t?.unassignedNow ?? 0} unassigned`} tone={t?.unassignedNow ? 'warning' : undefined} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Conversations opened vs resolved" actions={<Legend shape="line" items={[{ label: 'Opened', color: SERIES.a }, { label: 'Resolved', color: SERIES.b }]} />}>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={daily} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval={tick} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip content={<TipBox />} cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }} />
                    <Line type="monotone" dataKey="created" name="Opened" stroke={SERIES.a} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
                    <Line type="monotone" dataKey="resolved" name="Resolved" stroke={SERIES.b} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Messages from clients vs replies" actions={<Legend shape="rect" items={[{ label: 'From clients', color: SERIES.a }, { label: 'Replies', color: SERIES.b }]} />}>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 8, right: 12, bottom: 0, left: -18 }} barGap={2} barCategoryGap="24%">
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval={tick} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip content={<TipBox />} cursor={{ fill: 'var(--surface-2)' }} />
                    <Bar dataKey="incoming" name="From clients" fill={SERIES.a} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                    <Bar dataKey="outgoing" name="Replies" fill={SERIES.b} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div>
            <button onClick={() => setTable((v) => !v)} className="text-xs font-medium text-primary hover:underline">
              {table ? 'Hide' : 'Show'} daily numbers as a table
            </button>
            {table && (
              <Card padded={false} className="mt-2">
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead className="sticky top-0 bg-surface-2 text-[11px] tracking-wide text-fg-3 uppercase">
                      <tr>
                        {['Day', 'Opened', 'Resolved', 'From clients', 'Replies', 'Calls'].map((h, i) => (
                          <th key={h} className={cn('px-4 py-2 font-semibold', i > 0 && 'text-right')}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {daily.map((d) => (
                        <tr key={d.day}>
                          <td className="px-4 py-1.5">{d.label}</td>
                          {[d.created, d.resolved, d.incoming, d.outgoing, d.calls].map((v, i) => (
                            <td key={i} className="px-4 py-1.5 text-right tabular-nums">
                              {v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>

          <Card
            padded={false}
            title="Breakdown"
            actions={
              <Tabs<Dimension>
                value={dimension}
                onChange={setDimension}
                items={[
                  { value: 'channel', label: 'Channel' },
                  { value: 'client', label: 'Client' },
                  { value: 'user', label: 'Person' },
                  { value: 'team', label: 'Team' },
                  { value: 'inbox', label: 'Inbox' },
                ]}
              />
            }
          >
            <div className={cn('overflow-x-auto transition-opacity', breakdown.isFetching && 'opacity-60')}>
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="border-b border-border bg-surface-2 text-[11px] tracking-wide text-fg-3 uppercase">
                  <tr>
                    <th className="px-4 py-2 font-semibold">{dimension === 'user' ? 'Assignee' : dimension.charAt(0).toUpperCase() + dimension.slice(1)}</th>
                    <th className="px-3 py-2 font-semibold">Opened</th>
                    <th className="px-3 py-2 text-right font-semibold">Resolved</th>
                    <th className="px-3 py-2 text-right font-semibold">Open now</th>
                    <th className="px-3 py-2 text-right font-semibold">From clients</th>
                    <th className="px-3 py-2 text-right font-semibold">Replies</th>
                    <th className="px-4 py-2 text-right font-semibold">Avg first response</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {breakdown.data?.rows.map((r) => (
                    <tr key={r.key} className="hover:bg-surface-2">
                      <td className="px-4 py-2 font-medium">{dimension === 'channel' ? (CHANNEL_NAMES[r.key] ?? r.key) : r.key}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-3">
                            <span className="block h-full rounded-full" style={{ width: `${(r.created / maxCreated) * 100}%`, background: SERIES.a }} />
                          </span>
                          <span className="tabular-nums">{r.created}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.resolved}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.openNow}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.incoming}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.outgoing}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{duration(r.firstResponseAvgSec)}</td>
                    </tr>
                  ))}
                  {breakdown.data && !breakdown.data.rows.length && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-fg-3">
                        No activity in this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {features.channels.VOICE && calls.data && (
            <Card padded={false} title="Calls">
              <div className="grid grid-cols-2 gap-3 border-b border-border p-4 sm:grid-cols-4">
                <Stat label="Incoming" value={calls.data.totals.inbound} />
                <Stat label="Outgoing" value={calls.data.totals.outbound} />
                <Stat label="Missed" value={calls.data.totals.missed} tone={calls.data.totals.missed ? 'danger' : undefined} />
                <Stat label="Talk time" value={duration(calls.data.totals.totalDuration)} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[13px]">
                  <thead className="border-b border-border bg-surface-2 text-[11px] tracking-wide text-fg-3 uppercase">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Person</th>
                      <th className="px-3 py-2 text-right font-semibold">Incoming</th>
                      <th className="px-3 py-2 text-right font-semibold">Outgoing</th>
                      <th className="px-3 py-2 text-right font-semibold">Missed</th>
                      <th className="px-3 py-2 text-right font-semibold">Avg duration</th>
                      <th className="px-4 py-2 text-right font-semibold">Talk time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {calls.data.byUser.map((r) => (
                      <tr key={r.key} className="hover:bg-surface-2">
                        <td className="px-4 py-2 font-medium">{r.key}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.inbound}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.outbound}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.missed}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{duration(r.avgDurationSec)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{duration(r.totalDurationSec)}</td>
                      </tr>
                    ))}
                    {!calls.data.byUser.length && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-fg-3">
                          No calls in this period
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
