'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Grip, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Smartphone, Voicemail } from 'lucide-react';
import { api, type CallInfo } from '@/lib/api';
import { cn, duration, timeFull } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { useSocketEvent } from '@/hooks/use-realtime';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge, Empty, PageHeader, PageLoader, Tabs } from '@/components/ui/misc';
import { useDialer } from '@/components/shell/softphone';

type Filter = 'all' | 'mine' | 'missed' | 'inbound' | 'outbound';

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: '#16a34a',
  MISSED: '#dc2626',
  VOICEMAIL: '#7c3aed',
  NO_ANSWER: '#d97706',
  BUSY: '#d97706',
  FAILED: '#dc2626',
  IN_PROGRESS: '#0ea5e9',
  RINGING: '#0ea5e9',
  QUEUED: '#64748b',
};

export default function CallsPage() {
  const { features, isAdmin } = useApp();
  const dialer = useDialer();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const query = useInfiniteQuery({
    queryKey: ['calls', filter],
    queryFn: ({ pageParam }) =>
      api.get<{ calls: CallInfo[]; nextCursor: string | null }>('/calls', {
        cursor: pageParam,
        mine: filter === 'mine' || undefined,
        status: filter === 'missed' ? 'MISSED' : undefined,
        direction: filter === 'inbound' ? 'INBOUND' : filter === 'outbound' ? 'OUTBOUND' : undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
    enabled: features.channels.VOICE,
  });
  useSocketEvent('call.updated', () => qc.invalidateQueries({ queryKey: ['calls'] }));
  const calls = useMemo(() => query.data?.pages.flatMap((p) => p.calls) ?? [], [query.data]);

  if (!features.channels.VOICE) return <Empty title="Calling is disabled">Enable `channels.voice` in config/features.json.</Empty>;
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Calls"
        subtitle={
          dialer.available
            ? dialer.status === 'mobile'
              ? 'Calls are bridged through your mobile. Change this in your profile.'
              : dialer.status === 'ready'
                ? 'Browser softphone is connected.'
                : 'Connecting the browser softphone…'
            : 'Phone calls with clients, recordings and voicemail.'
        }
        actions={
          dialer.available && (
            <Button onClick={dialer.openKeypad}>
              <Grip className="h-4 w-4" /> Dial pad
            </Button>
          )
        }
      />
      {!features.voice.enabled && (
        <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-[13px] text-warning md:px-6">
          Calling isn't connected yet. {isAdmin ? 'Add PLIVO_AUTH_ID and PLIVO_AUTH_TOKEN to .env, then add a phone line under Settings → Inboxes.' : 'Ask an admin to connect Plivo.'}
        </div>
      )}
      <div className="border-b border-border bg-surface px-4 py-2 md:px-6">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: 'All' },
            { value: 'mine', label: 'My calls' },
            { value: 'missed', label: 'Missed' },
            { value: 'inbound', label: 'Incoming' },
            { value: 'outbound', label: 'Outgoing' },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isLoading && <PageLoader />}
        {!query.isLoading && !calls.length && (
          <Empty icon={<Phone className="h-5 w-5" />} title="No calls yet">
            Calls you make and receive on your agency numbers show up here with recordings.
          </Empty>
        )}
        <ul className="divide-y divide-border bg-surface">
          {calls.map((k) => {
            const missed = ['MISSED', 'NO_ANSWER', 'BUSY', 'FAILED'].includes(k.status);
            const Icon = k.status === 'VOICEMAIL' ? Voicemail : missed ? PhoneMissed : k.direction === 'INBOUND' ? PhoneIncoming : PhoneOutgoing;
            const number = k.direction === 'INBOUND' ? k.fromNumber : k.toNumber;
            return (
              <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-6">
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', missed ? 'bg-danger/10 text-danger' : 'bg-sky-500/10 text-sky-600')}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {k.contact?.name ?? number ?? 'Unknown'}
                    {k.client && <span className="font-normal text-fg-3"> · {k.client.name}</span>}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-3">
                    <span>{number}</span>
                    <span>{timeFull(k.startedAt)}</span>
                    {k.durationSec ? <span>{duration(k.durationSec)}</span> : null}
                    {k.mode === 'MOBILE' && (
                      <span className="inline-flex items-center gap-0.5">
                        <Smartphone className="h-3 w-3" /> mobile
                      </span>
                    )}
                    {k.inbox && <span>{k.inbox.name}</span>}
                  </p>
                  {(k.recordingUrl || k.voicemailUrl) && <audio controls preload="none" src={(k.voicemailUrl ?? k.recordingUrl)!} className="mt-1.5 h-8 w-full max-w-sm" />}
                </div>
                {k.user && (
                  <span className="hidden items-center gap-1.5 text-xs text-fg-2 sm:flex">
                    <Avatar name={k.user.name} src={k.user.avatarUrl} size="xs" /> {k.user.name}
                  </span>
                )}
                <Badge color={STATUS_COLOR[k.status]}>{k.status.toLowerCase().replace('_', ' ')}</Badge>
                <div className="flex gap-1">
                  {k.conversationId && (
                    <Link href={`/inbox/${k.conversationId}`}>
                      <Button size="xs" variant="ghost">
                        Open
                      </Button>
                    </Link>
                  )}
                  {number && dialer.available && (
                    <Button size="xs" variant="outline" onClick={() => dialer.call(number, { name: k.contact?.name, contactId: k.contact?.id, conversationId: k.conversationId })}>
                      <Phone className="h-3.5 w-3.5" /> {missed && k.direction === 'INBOUND' ? 'Call back' : 'Call'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {query.hasNextPage && (
          <div className="p-4">
            <Button variant="outline" size="sm" className="w-full" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
