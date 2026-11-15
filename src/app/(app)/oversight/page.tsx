'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, ArrowDownLeft, ArrowUpRight, Eye, Hash, Lock, MessagesSquare, Phone, PhoneMissed, ShieldAlert, UserX, Users } from 'lucide-react';
import { api, type CallInfo, type ChannelType, type ChatMessage, type Conversation, type Presence, type UserBrief } from '@/lib/api';
import { CHANNEL_LABEL, cn, duration, timeAgo, timeShort } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { useSocketEvent } from '@/hooks/use-realtime';
import { usePresence } from '@/hooks/use-presence';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge, Card, Empty, PageHeader, PageLoader, Stat, Tabs } from '@/components/ui/misc';
import { Select } from '@/components/ui/form';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { Dialog } from '@/components/ui/dialog';
import { ConversationRow } from '@/components/inbox/conversation-list';
import { RichText } from '@/components/messages/content';

interface ActivityEvent {
  id: string;
  type: string;
  summary: string;
  createdAt: string;
  conversationId: string | null;
  channelType: ChannelType | null;
  actor: { id: string; name: string; avatarKey?: string | null } | null;
  client: { id: string; name: string } | null;
}

interface WorkloadUser extends UserBrief {
  presence: Presence;
  onCall: boolean;
  lastSeenAt: string | null;
  open: number;
  pending: number;
  snoozed: number;
  waiting: number;
  overdue: number;
  repliesToday: number;
  callsToday: number;
  avgFirstResponseSec: number | null;
}

type Tab = 'live' | 'attention' | 'workload' | 'internal';

function eventIcon(e: ActivityEvent) {
  if (e.type.startsWith('call.missed') || e.type.startsWith('call.voicemail')) return <PhoneMissed className="h-3.5 w-3.5 text-danger" />;
  if (e.type.startsWith('call')) return <Phone className="h-3.5 w-3.5 text-sky-500" />;
  if (e.type === 'message.incoming') return <ArrowDownLeft className="h-3.5 w-3.5 text-success" />;
  if (e.type === 'message.outgoing') return <ArrowUpRight className="h-3.5 w-3.5 text-primary" />;
  if (e.type === 'message.failed') return <AlertTriangle className="h-3.5 w-3.5 text-danger" />;
  if (e.type.startsWith('chat')) return <MessagesSquare className="h-3.5 w-3.5 text-fg-3" />;
  return <Activity className="h-3.5 w-3.5 text-fg-3" />;
}

function LiveFeed() {
  const { inboxes } = useApp();
  const qc = useQueryClient();
  const [type, setType] = useState('');
  const [channelType, setChannelType] = useState('');
  const [paused, setPaused] = useState(false);
  const [extra, setExtra] = useState<ActivityEvent[]>([]);
  const key = ['oversight-activity', type, channelType];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<{ events: ActivityEvent[] }>('/oversight/activity', { type, channelType, limit: 80 }) });
  useEffect(() => setExtra([]), [type, channelType]);
  useSocketEvent<ActivityEvent>('activity', (e) => {
    if (paused) return;
    if (type && !e.type.startsWith(type)) return;
    if (channelType && e.channelType !== channelType) return;
    setExtra((x) => [e, ...x].slice(0, 200));
    qc.invalidateQueries({ queryKey: ['oversight-summary'] });
  });
  const events = useMemo(() => {
    const seen = new Set<string>();
    return [...extra, ...(data?.events ?? [])].filter((e) => !seen.has(e.id) && seen.add(e.id));
  }, [extra, data]);
  const channelTypes = [...new Set(inboxes.map((i) => i.channelType))];
  return (
    <Card
      padded={false}
      title={
        <span className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', paused ? 'bg-fg-3' : 'animate-pulse bg-success')} /> Live activity
        </span>
      }
      actions={
        <div className="flex items-center gap-2">
          <Select value={type} onChange={(e) => setType(e.target.value)} className="h-7 w-auto text-xs" aria-label="Activity type">
            <option value="">Everything</option>
            <option value="message.incoming">Client messages</option>
            <option value="message.outgoing">Agency replies</option>
            <option value="call">Calls</option>
            <option value="conversation">Assignments & status</option>
            <option value="client">Client changes</option>
          </Select>
          <Select value={channelType} onChange={(e) => setChannelType(e.target.value)} className="hidden h-7 w-auto text-xs sm:block" aria-label="Channel">
            <option value="">All channels</option>
            {channelTypes.map((t) => (
              <option key={t} value={t}>
                {CHANNEL_LABEL[t]}
              </option>
            ))}
          </Select>
          <Button size="xs" variant="outline" onClick={() => setPaused((p) => !p)}>
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      }
    >
      {isLoading && <PageLoader />}
      {!isLoading && !events.length && <Empty icon={<Activity className="h-5 w-5" />} title="Quiet right now">Client messages, replies, calls and assignments appear here as they happen.</Empty>}
      <ol className="max-h-[70vh] divide-y divide-border overflow-y-auto">
        {events.map((e) => {
          const body = (
            <div className="flex gap-3 px-4 py-2.5 hover:bg-surface-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2">{eventIcon(e)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] break-words text-fg">{e.summary}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-fg-3">
                  {e.channelType && (
                    <span className="inline-flex items-center gap-1">
                      <ChannelIcon type={e.channelType} className="h-3 w-3" /> {CHANNEL_LABEL[e.channelType]}
                    </span>
                  )}
                  {e.client && <span className="font-medium text-fg-2">{e.client.name}</span>}
                  {e.actor && <span>by {e.actor.name}</span>}
                  <span>{timeShort(e.createdAt)}</span>
                </p>
              </div>
            </div>
          );
          return <li key={e.id}>{e.conversationId ? <Link href={`/inbox/${e.conversationId}`}>{body}</Link> : body}</li>;
        })}
      </ol>
    </Card>
  );
}

function Attention() {
  const { data, isLoading } = useQuery({
    queryKey: ['oversight-attention'],
    queryFn: () =>
      api.get<{ attentionHours: number; overdue: Conversation[]; unassigned: Conversation[]; urgent: Conversation[]; missedCalls: CallInfo[]; failedMessages: { id: string; content: string | null; error: string | null; createdAt: string; conversation: Conversation }[] }>(
        '/oversight/attention',
      ),
    refetchInterval: 60_000,
  });
  if (isLoading || !data) return <PageLoader />;
  const Group = ({ title, icon, items, empty }: { title: string; icon: React.ReactNode; items: Conversation[]; empty: string }) => (
    <Card padded={false} title={<span className="flex items-center gap-2">{icon} {title} <Badge>{items.length}</Badge></span>}>
      {!items.length && <p className="px-4 py-6 text-center text-sm text-fg-3">{empty}</p>}
      <div className="max-h-96 overflow-y-auto">
        {items.map((c) => (
          <ConversationRow key={c.id} c={c} href={`/inbox/${c.id}`} />
        ))}
      </div>
    </Card>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Group title={`Clients waiting over ${data.attentionHours}h`} icon={<AlertTriangle className="h-4 w-4 text-danger" />} items={data.overdue} empty="No one has been waiting that long 👏" />
      <Group title="Unassigned" icon={<UserX className="h-4 w-4 text-warning" />} items={data.unassigned} empty="Every open conversation has an owner." />
      <Group title="High priority & urgent" icon={<ShieldAlert className="h-4 w-4 text-orange-500" />} items={data.urgent} empty="Nothing flagged as high priority." />
      <Card padded={false} title={<span className="flex items-center gap-2"><PhoneMissed className="h-4 w-4 text-danger" /> Missed calls not followed up <Badge>{data.missedCalls.length}</Badge></span>}>
        {!data.missedCalls.length && <p className="px-4 py-6 text-center text-sm text-fg-3">All missed calls were followed up.</p>}
        <ul className="max-h-96 divide-y divide-border overflow-y-auto">
          {data.missedCalls.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">
                  {k.contact?.name ?? k.fromNumber} {k.client && <span className="font-normal text-fg-3">· {k.client.name}</span>}
                </p>
                <p className="text-xs text-fg-3">
                  {k.status === 'VOICEMAIL' ? 'Left a voicemail' : 'Missed'} · {timeAgo(k.startedAt)} · {k.inbox?.name}
                </p>
              </div>
              {k.conversationId && (
                <Link href={`/inbox/${k.conversationId}`} className="text-xs font-medium text-primary hover:underline">
                  Open
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {!!data.failedMessages.length && (
        <Card padded={false} className="lg:col-span-2" title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-danger" /> Messages that failed to send <Badge>{data.failedMessages.length}</Badge></span>}>
          <ul className="divide-y divide-border">
            {data.failedMessages.map((m) => (
              <li key={m.id}>
                <Link href={`/inbox/${m.conversation.id}`} className="block px-4 py-2.5 hover:bg-surface-2">
                  <p className="truncate text-[13px]">{m.content ?? 'Attachment'}</p>
                  <p className="truncate text-xs text-danger">{m.error}</p>
                  <p className="text-[11px] text-fg-3">
                    {m.conversation.contact?.name ?? m.conversation.groupName} · {m.conversation.inbox?.name} · {timeAgo(m.createdAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function PresenceCell({ u }: { u: WorkloadUser }) {
  const live = usePresence(u.id) ?? u.presence;
  const label = u.onCall ? 'On a call' : live === 'ONLINE' ? 'Online' : live === 'AWAY' ? 'Away' : live === 'BUSY' ? 'Busy' : u.lastSeenAt ? `Seen ${timeAgo(u.lastSeenAt)}` : 'Offline';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-2">
      <span className={cn('h-2 w-2 rounded-full', u.onCall ? 'bg-sky-500' : live === 'ONLINE' ? 'bg-success' : live === 'AWAY' ? 'bg-warning' : live === 'BUSY' ? 'bg-danger' : 'bg-fg-3')} />
      {label}
    </span>
  );
}

function Workload() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['oversight-workload'], queryFn: () => api.get<{ attentionHours: number; users: WorkloadUser[] }>('/oversight/workload'), refetchInterval: 60_000 });
  useSocketEvent('oncall', () => qc.invalidateQueries({ queryKey: ['oversight-workload'] }));
  if (isLoading || !data) return <PageLoader />;
  const max = Math.max(1, ...data.users.map((u) => u.open + u.pending));
  return (
    <Card padded={false} title="Team workload">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="border-b border-border bg-surface-2 text-[11px] tracking-wide text-fg-3 uppercase">
            <tr>
              <th className="px-4 py-2 font-semibold">Person</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Open load</th>
              <th className="px-3 py-2 text-right font-semibold">Waiting</th>
              <th className="px-3 py-2 text-right font-semibold">Over {data.attentionHours}h</th>
              <th className="px-3 py-2 text-right font-semibold">Replies today</th>
              <th className="px-3 py-2 text-right font-semibold">Calls today</th>
              <th className="px-4 py-2 text-right font-semibold">Avg first reply (7d)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.users.map((u) => (
              <tr key={u.id} className="hover:bg-surface-2">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={u.name} src={u.avatarUrl} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{u.name}</span>
                      <span className="block truncate text-[11px] text-fg-3">{u.title ?? u.department ?? ''}</span>
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <PresenceCell u={u} />
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${((u.open + u.pending) / max) * 100}%` }} />
                    </span>
                    <span className="text-xs tabular-nums">
                      {u.open} open{u.pending ? ` · ${u.pending} pending` : ''}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{u.waiting || '–'}</td>
                <td className={cn('px-3 py-2.5 text-right tabular-nums', u.overdue && 'font-semibold text-danger')}>{u.overdue || '–'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{u.repliesToday || '–'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{u.callsToday || '–'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{duration(u.avgFirstResponseSec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

interface InternalChannel {
  id: string;
  kind: 'PUBLIC' | 'PRIVATE' | 'DM' | 'GROUP_DM';
  name: string | null;
  topic: string | null;
  client: { id: string; name: string } | null;
  members: UserBrief[];
  messageCount: number;
  lastMessageAt: string;
}

function Internal() {
  const { data, isLoading } = useQuery({ queryKey: ['oversight-internal'], queryFn: () => api.get<{ visibility: string; channels: InternalChannel[] }>('/oversight/internal/channels') });
  const [open, setOpen] = useState<InternalChannel | null>(null);
  if (isLoading || !data) return <PageLoader />;
  const note =
    data.visibility === 'all'
      ? 'You can read all channels and direct messages. Opening private content is recorded in the audit log.'
      : data.visibility === 'channels'
        ? 'You can read public and private channels. Direct messages stay private. Opening a private channel is recorded in the audit log.'
        : 'Only public channels are visible here.';
  return (
    <>
      <div className="mb-3 flex items-start gap-2 rounded-xl border border-border bg-surface-2 px-4 py-3 text-[13px] text-fg-2">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-fg-3" />
        <p>
          {note} This is set by <code className="rounded bg-surface-3 px-1 text-xs">oversight.internal_visibility</code> in <code className="rounded bg-surface-3 px-1 text-xs">config/features.json</code> (currently “{data.visibility}”).
        </p>
      </div>
      <Card padded={false} title="Internal channels">
        {!data.channels.length && <Empty title="No channels" />}
        <ul className="divide-y divide-border">
          {data.channels.map((c) => (
            <li key={c.id}>
              <button onClick={() => setOpen(c)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
                {c.kind === 'PUBLIC' ? <Hash className="h-4 w-4 text-fg-3" /> : c.kind === 'PRIVATE' ? <Lock className="h-4 w-4 text-fg-3" /> : <Users className="h-4 w-4 text-fg-3" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-fg-3">
                    {c.members.length} members · {c.messageCount} messages{c.client ? ` · ${c.client.name}` : ''}
                  </span>
                </span>
                <Badge color={c.kind === 'PUBLIC' ? '#16a34a' : c.kind === 'PRIVATE' ? '#d97706' : '#dc2626'}>{c.kind === 'GROUP_DM' ? 'group DM' : c.kind.toLowerCase()}</Badge>
                <span className="hidden text-[11px] text-fg-3 sm:inline">{timeAgo(c.lastMessageAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <InternalReader channel={open} onClose={() => setOpen(null)} />
    </>
  );
}

function InternalReader({ channel, onClose }: { channel: InternalChannel | null; onClose: () => void }) {
  const { users } = useApp();
  const { data, isLoading, error } = useQuery({
    queryKey: ['oversight-internal-messages', channel?.id],
    queryFn: () => api.get<{ audited: boolean; messages: ChatMessage[] }>(`/oversight/internal/channels/${channel!.id}/messages`),
    enabled: Boolean(channel),
    retry: false,
  });
  return (
    <Dialog open={Boolean(channel)} onOpenChange={(v) => !v && onClose()} title={channel?.name ?? 'Channel'} description={channel ? `${channel.members.map((m) => m.name).join(', ')}` : undefined} size="lg">
      {data?.audited && (
        <p className="mb-3 flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
          <ShieldAlert className="h-4 w-4" /> Oversight view of private content. This access was written to the audit log.
        </p>
      )}
      {isLoading && <PageLoader />}
      {error && <p className="text-sm text-danger">{(error as Error).message}</p>}
      {data && !data.messages.length && <p className="py-6 text-center text-sm text-fg-3">No messages</p>}
      <div className="space-y-2.5">
        {data?.messages.map((m) => (
          <div key={m.id} className={cn('flex gap-2.5', m.parentId && 'ml-8')}>
            <Avatar name={m.user?.name ?? 'System'} src={m.user?.avatarUrl} size="sm" />
            <div className="min-w-0">
              <p className="text-xs">
                <b>{m.user?.name ?? 'System'}</b> <span className="text-fg-3">{timeShort(m.createdAt)}</span>
              </p>
              <p className="text-[13px] text-fg-2">{m.deletedAt ? <i>deleted</i> : <RichText text={m.content} mentionNames={users.map((u) => u.name)} />}</p>
              {!!m.attachments.length && <p className="text-[11px] text-fg-3">📎 {m.attachments.map((a) => a.fileName).join(', ')}</p>}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export default function OversightPage() {
  const { features, isManager, isAdmin } = useApp();
  const [tab, setTab] = useState<Tab>('live');
  const qc = useQueryClient();
  const { data: s } = useQuery({
    queryKey: ['oversight-summary'],
    queryFn: () => api.get<{ open: number; unassigned: number; waiting: number; resolvedToday: number; incomingToday: number; outgoingToday: number; callsToday: number; internalMessagesToday: number }>('/oversight/summary'),
    enabled: features.oversight && isManager,
    refetchInterval: 60_000,
    staleTime: 5_000,
  });
  useSocketEvent('conversation.updated', () => qc.invalidateQueries({ queryKey: ['oversight-attention'] }));
  if (!features.oversight || !isManager) return <Empty icon={<Eye className="h-5 w-5" />} title="Oversight is for managers and admins" />;
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader title="Oversight" subtitle={isAdmin ? 'Everything happening across the agency, live.' : 'Everything happening across your teams and clients, live.'} />
      <div className="space-y-4 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Stat label="Open" value={s?.open ?? '–'} />
          <Stat label="Unassigned" value={s?.unassigned ?? '–'} tone={s?.unassigned ? 'warning' : undefined} />
          <Stat label="Clients waiting" value={s?.waiting ?? '–'} tone={s?.waiting ? 'danger' : undefined} />
          <Stat label="Resolved today" value={s?.resolvedToday ?? '–'} tone="success" />
          <Stat label="Client msgs today" value={s?.incomingToday ?? '–'} />
          <Stat label="Replies today" value={s?.outgoingToday ?? '–'} />
          <Stat label="Calls today" value={s?.callsToday ?? '–'} />
          <Stat label="Team msgs today" value={s?.internalMessagesToday ?? '–'} />
        </div>
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            ...(features.activityFeed ? [{ value: 'live' as Tab, label: 'Live feed' }] : []),
            { value: 'attention', label: 'Needs attention' },
            ...(features.workload ? [{ value: 'workload' as Tab, label: 'Workload' }] : []),
            ...(isAdmin && features.internalChat ? [{ value: 'internal' as Tab, label: 'Internal comms' }] : []),
          ]}
        />
        {tab === 'live' && features.activityFeed && <LiveFeed />}
        {tab === 'attention' && <Attention />}
        {tab === 'workload' && features.workload && <Workload />}
        {tab === 'internal' && isAdmin && <Internal />}
      </div>
    </div>
  );
}
