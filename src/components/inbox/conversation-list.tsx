'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Clock, Filter, Inbox as InboxIcon, PenSquare, Search, Users, X } from 'lucide-react';
import { api, type ChannelType, type Conversation, type ConversationStatus } from '@/lib/api';
import { CHANNEL_LABEL, cn, conversationTitle, timeShort } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { Avatar } from '@/components/ui/avatar';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { Badge, Empty, PRIORITY_COLOR, Skeleton, Tabs } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Tooltip } from '@/components/ui/menu';
import { NewConversationDialog } from './new-conversation';

type Tab = 'mine' | 'unassigned' | 'all' | 'mentions';

export function ConversationRow({ c, active, href }: { c: Conversation; active?: boolean; href: string }) {
  const title = conversationTitle(c);
  const waitingMin = c.waitingSince && c.status === 'OPEN' ? Math.floor((Date.now() - +new Date(c.waitingSince)) / 60000) : 0;
  return (
    <Link
      href={href}
      className={cn('relative flex gap-3 border-b border-border px-3 py-3 transition-colors hover:bg-surface-2', active && 'bg-primary-soft hover:bg-primary-soft')}
    >
      {c.priority !== 'NONE' && <span className="absolute inset-y-0 left-0 w-0.5" style={{ background: PRIORITY_COLOR[c.priority] }} />}
      <span className="relative shrink-0">
        {c.isGroup ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 text-fg-2">
            <Users className="h-4 w-4" />
          </span>
        ) : (
          <Avatar name={title} src={c.contact?.avatarUrl} />
        )}
        <span className="absolute -right-1 -bottom-1 rounded-full bg-surface p-0.5">
          <ChannelIcon type={c.channelType} className="h-3.5 w-3.5" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-[13px]', c.unread ? 'font-semibold text-fg' : 'font-medium text-fg')}>{title}</span>
          <span className={cn('shrink-0 text-[11px]', c.unread ? 'font-semibold text-primary' : 'text-fg-3')}>{timeShort(c.lastMessageAt)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-fg-3">
          {c.client && <span className="max-w-[45%] truncate font-medium text-fg-2">{c.client.name}</span>}
          {c.client && <span>·</span>}
          <span className="truncate">{c.inbox?.name}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-xs', c.unread ? 'text-fg' : 'text-fg-2')}>{c.lastMessagePreview || (c.subject ?? 'No messages yet')}</span>
          {c.unread > 0 && <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-fg">{c.unread}</span>}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          {waitingMin >= 30 && (
            <Badge color={waitingMin >= 240 ? '#dc2626' : '#d97706'}>
              <Clock className="h-3 w-3" />
              waiting {waitingMin >= 60 ? `${Math.floor(waitingMin / 60)}h` : `${waitingMin}m`}
            </Badge>
          )}
          {c.status !== 'OPEN' && <Badge>{c.status.toLowerCase()}</Badge>}
          {c.labels.slice(0, 2).map((l) => (
            <Badge key={l.id} color={l.color}>
              {l.name}
            </Badge>
          ))}
          <span className="ml-auto">
            {c.assignee ? (
              <Tooltip content={`Assigned to ${c.assignee.name}`}>
                <span>
                  <Avatar name={c.assignee.name} src={c.assignee.avatarUrl} size="xs" />
                </span>
              </Tooltip>
            ) : (
              <span className="text-[10px] text-fg-3">Unassigned</span>
            )}
          </span>
        </span>
      </span>
    </Link>
  );
}

export function ConversationList() {
  const { features, inboxes } = useApp();
  const params = useParams<{ id?: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((search.get('tab') as Tab) || 'mine');
  const [status, setStatus] = useState<ConversationStatus | 'ALL'>('OPEN');
  const [channelType, setChannelType] = useState<ChannelType | ''>('');
  const [inboxId, setInboxId] = useState('');
  const [sort, setSort] = useState<'latest' | 'waiting' | 'priority' | 'oldest'>('latest');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [compose, setCompose] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const filters = { tab, status, channelType, inboxId, sort, q: dq };
  const { data: counts } = useQuery({
    queryKey: ['conversation-counts', status, inboxId],
    queryFn: () => api.get<Record<Tab, number>>('/conversations/counts', { status, inboxId }),
  });
  const query = useInfiniteQuery({
    queryKey: ['conversations', filters],
    queryFn: ({ pageParam }) => api.get<{ conversations: Conversation[]; nextCursor: string | null }>('/conversations', { ...filters, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.conversations) ?? [], [query.data]);
  const channelTypes = [...new Set(inboxes.map((i) => i.channelType))];
  const activeFilters = Number(Boolean(channelType)) + Number(Boolean(inboxId)) + Number(status !== 'OPEN') + Number(sort !== 'latest');

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="space-y-2 border-b border-border px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <h1 className="flex-1 text-base font-semibold">Inbox</h1>
          <Tooltip content="Filters">
            <Button variant={showFilters || activeFilters ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setShowFilters((s) => !s)} aria-label="Filters">
              <Filter className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip content="New conversation">
            <Button variant="ghost" size="icon-sm" onClick={() => setCompose(true)} aria-label="New conversation">
              <PenSquare className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-fg-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, client, phone, #id…"
            className="h-8 w-full rounded-lg border border-border bg-surface-2 pr-7 pl-8 text-[13px] outline-none placeholder:text-fg-3 focus:border-primary"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute top-1/2 right-2 -translate-y-1/2 text-fg-3" aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 gap-2">
            <Select value={status} onChange={(e) => setStatus(e.target.value as any)} className="h-8 text-xs" aria-label="Status">
              <option value="OPEN">Open</option>
              <option value="PENDING">Pending</option>
              {features.snooze && <option value="SNOOZED">Snoozed</option>}
              <option value="RESOLVED">Resolved</option>
              <option value="ALL">All statuses</option>
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as any)} className="h-8 text-xs" aria-label="Sort">
              <option value="latest">Newest activity</option>
              <option value="waiting">Longest waiting</option>
              <option value="priority">Priority</option>
              <option value="oldest">Oldest activity</option>
            </Select>
            <Select value={channelType} onChange={(e) => (setChannelType(e.target.value as any), setInboxId(''))} className="h-8 text-xs" aria-label="Channel">
              <option value="">All channels</option>
              {channelTypes.map((t) => (
                <option key={t} value={t}>
                  {CHANNEL_LABEL[t]}
                </option>
              ))}
            </Select>
            <Select value={inboxId} onChange={(e) => setInboxId(e.target.value)} className="h-8 text-xs" aria-label="Inbox">
              <option value="">All inboxes</option>
              {inboxes
                .filter((i) => !channelType || i.channelType === channelType)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
            </Select>
          </div>
        )}
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'mine', label: 'Mine', count: counts?.mine },
            { value: 'unassigned', label: 'Unassigned', count: counts?.unassigned },
            { value: 'all', label: 'All', count: counts?.all },
            { value: 'mentions', label: '@Me', count: counts?.mentions || undefined },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 border-b border-border px-3 py-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        {!query.isLoading && !items.length && (
          <Empty icon={<InboxIcon className="h-5 w-5" />} title={dq ? 'No matches' : tab === 'mine' ? 'Nothing assigned to you' : 'No conversations here'}>
            {dq ? 'Try a different search or clear the filters.' : tab === 'mine' ? 'New conversations assigned to you will show up here.' : 'When clients reach out on any channel, conversations appear here.'}
          </Empty>
        )}
        {items.map((c) => (
          <ConversationRow key={c.id} c={c} active={params.id === c.id} href={`/inbox/${c.id}`} />
        ))}
        {query.hasNextPage && (
          <div className="p-3">
            <Button variant="outline" size="sm" className="w-full" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </div>
      <NewConversationDialog open={compose} onOpenChange={setCompose} onCreated={(id) => router.push(`/inbox/${id}`)} />
    </div>
  );
}
