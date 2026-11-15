'use client';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, BellOff, Building2, Hash, Lock, LogOut, MessageSquare, MoreVertical, Pencil, SmilePlus, Trash2, UserPlus, Users, X } from 'lucide-react';
import { api, ApiError, type ChatChannel, type ChatMessage } from '@/lib/api';
import { cn, dayLabel, timeFull, timeShort } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { emitSocket, useSocketEvent } from '@/hooks/use-realtime';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Empty, PageLoader, Spinner } from '@/components/ui/misc';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Popover, Tooltip } from '@/components/ui/menu';
import { Dialog } from '@/components/ui/dialog';
import { Attachments, DriveLinks, RichText } from '@/components/messages/content';
import { Composer, type ComposerPayload } from '@/components/messages/composer';
import { UserChecklist } from './channel-sidebar';

type Page = { messages: ChatMessage[]; hasMore: boolean };
const QUICK = ['👍', '❤️', '😂', '🎉', '🙏', '👀', '✅', '🔥'];

function MessageItem({
  m,
  compact,
  mentionNames,
  onThread,
  inThread,
}: {
  m: ChatMessage;
  compact: boolean;
  mentionNames: string[];
  onThread?: (m: ChatMessage) => void;
  inThread?: boolean;
}) {
  const { me, features, isAdmin } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content);
  const react = (emoji: string) => api.post(`/chat/messages/${m.id}/reactions`, { emoji }).catch((e) => toast.error(e.message));
  const save = async () => {
    if (!draft.trim()) return;
    await api.patch(`/chat/messages/${m.id}`, { content: draft }).catch((e) => toast.error(e.message));
    setEditing(false);
  };
  if (m.meta?.system) {
    return (
      <div className="my-1.5 flex justify-center">
        <span className="rounded-full bg-surface-2 px-3 py-0.5 text-[11px] text-fg-3">
          {m.content} · {timeShort(m.createdAt)}
        </span>
      </div>
    );
  }
  const mine = m.user?.id === me.id;
  const deleted = Boolean(m.deletedAt);
  const shared = m.meta?.sharedConversation as { id: string; displayId: number } | undefined;
  return (
    <div className={cn('group relative flex gap-2.5 px-3 hover:bg-surface-2/60 md:px-5', compact ? 'py-0.5' : 'pt-2 pb-0.5')}>
      <div className="w-9 shrink-0">
        {!compact ? (
          <Avatar name={m.user?.name ?? 'Removed user'} src={m.user?.avatarUrl} userId={m.user?.id} />
        ) : (
          <span className="hidden pt-1 text-right text-[10px] text-fg-3 group-hover:block">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold">{m.user?.name ?? 'Removed user'}</span>
            {m.user?.title && <span className="hidden text-[11px] text-fg-3 sm:inline">{m.user.title}</span>}
            <Tooltip content={timeFull(m.createdAt)}>
              <span className="text-[11px] text-fg-3">{timeShort(m.createdAt)}</span>
            </Tooltip>
          </div>
        )}
        {deleted ? (
          <p className="text-[13px] text-fg-3 italic">This message was deleted</p>
        ) : editing ? (
          <div className="mt-1 space-y-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), void save());
                if (e.key === 'Escape') setEditing(false);
              }}
              rows={2}
              autoFocus
              className="w-full rounded-lg border border-primary bg-surface px-3 py-2 text-sm outline-none"
            />
            <div className="flex gap-2">
              <Button size="xs" onClick={save}>
                Save
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {m.content && (
              <p className="text-sm leading-relaxed">
                <RichText text={m.content} mentionNames={mentionNames} />
                {m.editedAt && <span className="ml-1 text-[10px] text-fg-3">(edited)</span>}
              </p>
            )}
            {shared && (
              <Link href={`/inbox/${shared.id}`} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-primary hover:bg-surface-2">
                <MessageSquare className="h-3.5 w-3.5" /> Open client conversation #{shared.displayId}
              </Link>
            )}
            {!!m.attachments.length && <Attachments items={m.attachments} className="mt-1.5" />}
            <DriveLinks links={m.meta?.driveLinks} />
          </>
        )}
        {!!m.reactions.length && !deleted && (
          <div className="mt-1 flex flex-wrap gap-1">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => react(r.emoji)}
                className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs', r.userIds.includes(me.id) ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface hover:bg-surface-2')}
              >
                {r.emoji} <span className="tabular-nums">{r.count}</span>
              </button>
            ))}
          </div>
        )}
        {!inThread && m.replyCount > 0 && (
          <button onClick={() => onThread?.(m)} className="mt-1 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary-soft">
            <MessageSquare className="h-3.5 w-3.5" />
            {m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}
            {m.lastReplyAt && <span className="font-normal text-fg-3">· last {timeShort(m.lastReplyAt)}</span>}
          </button>
        )}
      </div>
      {!deleted && !editing && (
        <div className="absolute -top-3 right-3 hidden items-center rounded-lg border border-border bg-surface shadow-card group-hover:flex focus-within:flex md:right-5">
          {features.reactions && (
            <Popover
              align="end"
              side="top"
              trigger={
                <button className="p-1.5 text-fg-3 hover:text-fg" aria-label="Add reaction">
                  <SmilePlus className="h-4 w-4" />
                </button>
              }
            >
              <div className="flex gap-0.5">
                {QUICK.map((e) => (
                  <button key={e} onClick={() => react(e)} className="rounded p-1 text-lg hover:bg-surface-2">
                    {e}
                  </button>
                ))}
              </div>
            </Popover>
          )}
          {features.threads && !inThread && onThread && (
            <Tooltip content="Reply in thread">
              <button onClick={() => onThread(m)} className="p-1.5 text-fg-3 hover:text-fg" aria-label="Reply in thread">
                <MessageSquare className="h-4 w-4" />
              </button>
            </Tooltip>
          )}
          {mine && (
            <Tooltip content="Edit">
              <button onClick={() => (setDraft(m.content), setEditing(true))} className="p-1.5 text-fg-3 hover:text-fg" aria-label="Edit message">
                <Pencil className="h-4 w-4" />
              </button>
            </Tooltip>
          )}
          {(mine || isAdmin) && (
            <Tooltip content="Delete">
              <button onClick={() => confirm('Delete this message?') && api.del(`/chat/messages/${m.id}`).catch((e) => toast.error(e.message))} className="p-1.5 text-fg-3 hover:text-danger" aria-label="Delete message">
                <Trash2 className="h-4 w-4" />
              </button>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

function isCompact(prev: ChatMessage | undefined, m: ChatMessage) {
  return Boolean(
    prev && !prev.meta?.system && !m.meta?.system && prev.user?.id === m.user?.id && +new Date(m.createdAt) - +new Date(prev.createdAt) < 5 * 60_000 && new Date(prev.createdAt).toDateString() === new Date(m.createdAt).toDateString(),
  );
}

export function ChannelView({ id }: { id: string }) {
  const { me, users, features } = useApp();
  const qc = useQueryClient();
  const router = useRouter();
  const search = useSearchParams();
  const threadId = search.get('thread');
  const [members, setMembers] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prevHeight = useRef(0);

  const chQuery = useQuery({
    queryKey: ['chat-channel', id],
    queryFn: () => api.get<{ channel: ChatChannel }>(`/chat/channels/${id}`),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const channel = chQuery.data?.channel;
  const key = useMemo(() => ['chat-messages', id], [id]);
  const msgs = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.get<Page>(`/chat/channels/${id}/messages`, { before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.createdAt : undefined),
    refetchOnWindowFocus: false,
  });
  const messages = useMemo(() => [...(msgs.data?.pages ?? [])].reverse().flatMap((p) => p.messages), [msgs.data]);

  const markRead = useCallback(() => {
    api.post(`/chat/channels/${id}/read`).catch(() => undefined);
    api.post('/notifications/read', { link: `/chat/${id}` }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })).catch(() => undefined);
  }, [id, qc]);

  useEffect(() => {
    emitSocket('channel.join', id);
    stick.current = true;
    markRead();
  }, [id, markRead]);

  useSocketEvent<ChatMessage>('chat.message.created', (m) => {
    if (m.channelId !== id) return;
    if (m.parentId) {
      qc.setQueryData(['chat-thread', m.parentId], (d: any) => (d && !d.replies.some((r: ChatMessage) => r.id === m.id) ? { ...d, replies: [...d.replies, m] } : d));
      return;
    }
    qc.setQueryData<InfiniteData<Page>>(key, (data) => {
      if (!data || data.pages.some((p) => p.messages.some((x) => x.id === m.id))) return data;
      const pages = [...data.pages];
      pages[0] = { ...pages[0], messages: [...pages[0].messages, m] };
      return { ...data, pages };
    });
    if (document.visibilityState === 'visible') markRead();
    setTyping(null);
  });
  useSocketEvent<ChatMessage>('chat.message.updated', (m) => {
    if (m.channelId !== id) return;
    qc.setQueryData<InfiniteData<Page>>(key, (data) => (data ? { ...data, pages: data.pages.map((p) => ({ ...p, messages: p.messages.map((x) => (x.id === m.id ? m : x)) })) } : data));
    const tid = m.parentId ?? m.id;
    qc.setQueryData(['chat-thread', tid], (d: any) => (d ? { parent: d.parent.id === m.id ? m : d.parent, replies: d.replies.map((r: ChatMessage) => (r.id === m.id ? m : r)) } : d));
  });
  useSocketEvent<any>('chat.channel.updated', (c) => c.id === id && qc.setQueryData(['chat-channel', id], { channel: c }));
  useSocketEvent<any>('typing', (p) => p.scope === 'channel' && p.id === id && p.userId !== me.id && setTyping(p.name));
  useEffect(() => {
    if (!typing) return;
    const t = setTimeout(() => setTyping(null), 3500);
    return () => clearTimeout(t);
  }, [typing]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
    else if (prevHeight.current && el.scrollHeight > prevHeight.current) el.scrollTop += el.scrollHeight - prevHeight.current;
    prevHeight.current = el.scrollHeight;
  }, [messages.length, typing]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (el.scrollTop < 80 && msgs.hasNextPage && !msgs.isFetchingNextPage) {
      prevHeight.current = el.scrollHeight;
      void msgs.fetchNextPage();
    }
  };

  const openThread = (m: ChatMessage | null) => router.replace(m ? `/chat/${id}?thread=${m.id}` : `/chat/${id}`, { scroll: false });

  if (chQuery.isLoading) return <PageLoader />;
  if (!channel) {
    return (
      <Empty title="Channel not found" action={<Button onClick={() => router.push('/chat')}>Back to chat</Button>}>
        It may be private, archived or deleted.
      </Empty>
    );
  }

  const isDm = channel.kind === 'DM' || channel.kind === 'GROUP_DM';
  const others = channel.members.filter((m) => m.id !== me.id);
  const mentionUsers = (isDm ? others : users.filter((u) => u.id !== me.id));
  const mentionNames = users.map((u) => u.name);
  const send = async (p: ComposerPayload) => {
    stick.current = true;
    await api.post(`/chat/channels/${id}/messages`, p);
  };
  const leave = async () => {
    if (!confirm(`Leave ${isDm ? 'this conversation' : `#${channel.name}`}?`)) return;
    await api.post(`/chat/channels/${id}/leave`);
    qc.invalidateQueries({ queryKey: ['chat-channels'] });
    router.push('/chat');
  };

  return (
    <div className="flex h-full min-w-0">
      <div className={cn('flex min-w-0 flex-1 flex-col bg-bg', threadId && 'hidden md:flex')}>
        <header className="flex items-center gap-2 border-b border-border bg-surface px-2 py-2 md:px-4">
          <Link href="/chat" className="rounded-lg p-1.5 text-fg-2 hover:bg-surface-2 lg:hidden" aria-label="Back to channels">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
              {isDm ? (
                others.length === 1 ? (
                  <Avatar name={others[0].name} src={others[0].avatarUrl} userId={others[0].id} size="sm" />
                ) : (
                  <Users className="h-4 w-4 text-fg-3" />
                )
              ) : channel.kind === 'PRIVATE' ? (
                <Lock className="h-4 w-4 text-fg-3" />
              ) : (
                <Hash className="h-4 w-4 text-fg-3" />
              )}
              <span className="truncate">{channel.name}</span>
              {channel.muted && <BellOff className="h-3.5 w-3.5 text-fg-3" />}
            </p>
            <p className="truncate text-xs text-fg-3">
              {isDm ? (others.length === 1 ? (others[0].title ?? others[0].email) : `${channel.members.length} people`) : (channel.topic ?? `${channel.memberCount} members`)}
            </p>
          </div>
          {channel.client && (
            <Link href={`/clients/${channel.client.id}`} className="hidden items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface-2 sm:flex">
              <Building2 className="h-3.5 w-3.5 text-fg-3" /> {channel.client.name}
            </Link>
          )}
          {!isDm && (
            <button onClick={() => setMembers(true)} className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-surface-2" aria-label="Members">
              <AvatarStack users={channel.members} max={3} size="xs" showMore={false} />
              <span className="text-xs text-fg-3">{channel.memberCount}</span>
            </button>
          )}
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Channel menu">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </MenuTrigger>
            <MenuContent>
              {!isDm && (
                <MenuItem icon={<UserPlus className="h-3.5 w-3.5" />} onSelect={() => setMembers(true)}>
                  Members
                </MenuItem>
              )}
              <MenuItem
                icon={<BellOff className="h-3.5 w-3.5" />}
                onSelect={async () => {
                  await api.patch(`/chat/channels/${id}/mute`, { muted: !channel.muted });
                  qc.invalidateQueries({ queryKey: ['chat-channel', id] });
                  qc.invalidateQueries({ queryKey: ['chat-channels'] });
                }}
              >
                {channel.muted ? 'Unmute' : 'Mute'} notifications
              </MenuItem>
              {!isDm && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={<LogOut className="h-3.5 w-3.5" />} danger onSelect={leave}>
                    Leave channel
                  </MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
        </header>

        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto pt-2 pb-3">
          {msgs.isFetchingNextPage && (
            <div className="flex justify-center py-2">
              <Spinner />
            </div>
          )}
          {msgs.isLoading && <PageLoader />}
          {!msgs.isLoading && !msgs.hasNextPage && (
            <div className="px-5 pt-6 pb-3">
              <p className="text-lg font-semibold">{isDm ? channel.name : `#${channel.name}`}</p>
              <p className="text-sm text-fg-3">
                {isDm ? 'This is the start of your direct messages.' : channel.kind === 'PRIVATE' ? 'This is the start of this private channel.' : 'This is the start of the channel.'}
                {channel.description ? ` ${channel.description}` : ''}
              </p>
            </div>
          )}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="my-2 flex items-center gap-3 px-5">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-medium text-fg-3">{dayLabel(m.createdAt)}</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <MessageItem m={m} compact={!newDay && isCompact(prev, m)} mentionNames={mentionNames} onThread={features.threads ? openThread : undefined} />
              </Fragment>
            );
          })}
          {typing && <p className="px-5 py-1 text-xs text-fg-3 italic">{typing} is typing…</p>}
        </div>

        <Composer
          draftKey={`chat:${id}`}
          placeholder={isDm ? `Message ${channel.name}` : `Message #${channel.name}`}
          onSend={send}
          mentionUsers={mentionUsers}
          allowChannelMention={!isDm}
          onTyping={() => emitSocket('typing', { scope: 'channel', id })}
          allowAttachments={features.files}
          disabled={channel.archived}
          disabledReason="This channel is archived."
        />
      </div>

      {threadId && features.threads && <ThreadPanel channelId={id} parentId={threadId} onClose={() => openThread(null)} mentionUsers={mentionUsers} mentionNames={mentionNames} />}

      <MembersDialog open={members} onOpenChange={setMembers} channel={channel} />
    </div>
  );
}

function ThreadPanel({ channelId, parentId, onClose, mentionUsers, mentionNames }: { channelId: string; parentId: string; onClose: () => void; mentionUsers: any[]; mentionNames: string[] }) {
  const { features } = useApp();
  const { data, isLoading } = useQuery({ queryKey: ['chat-thread', parentId], queryFn: () => api.get<{ parent: ChatMessage; replies: ChatMessage[] }>(`/chat/messages/${parentId}/thread`) });
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // scrollIntoView returns a Promise in newer browsers; an effect must not return it
    end.current?.scrollIntoView({ block: 'end' });
  }, [data?.replies.length]);
  return (
    <aside className="flex w-full shrink-0 flex-col border-l border-border bg-surface md:w-[380px]">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Thread</p>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close thread">
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {isLoading && <PageLoader />}
        {data && (
          <>
            <MessageItem m={data.parent} compact={false} mentionNames={mentionNames} inThread />
            <div className="my-2 flex items-center gap-3 px-5">
              <span className="text-[11px] text-fg-3">
                {data.replies.length} {data.replies.length === 1 ? 'reply' : 'replies'}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            {data.replies.map((r, i) => (
              <MessageItem key={r.id} m={r} compact={isCompact(data.replies[i - 1], r)} mentionNames={mentionNames} inThread />
            ))}
            <div ref={end} />
          </>
        )}
      </div>
      <Composer
        draftKey={`thread:${parentId}`}
        placeholder="Reply in thread…"
        onSend={async (p) => {
          await api.post(`/chat/channels/${channelId}/messages`, { ...p, parentId });
        }}
        mentionUsers={mentionUsers}
        allowAttachments={features.files}
        autoFocus
        sendLabel="Reply"
      />
    </aside>
  );
}

function MembersDialog({ open, onOpenChange, channel }: { open: boolean; onOpenChange: (v: boolean) => void; channel: ChatChannel }) {
  const { users, me, isAdmin } = useApp();
  const qc = useQueryClient();
  const [adding, setAdding] = useState<string[]>([]);
  const memberIds = new Set(channel.members.map((m) => m.id));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['chat-channel', channel.id] });
    qc.invalidateQueries({ queryKey: ['chat-channels'] });
  };
  const add = async () => {
    await api.post(`/chat/channels/${channel.id}/members`, { userIds: adding }).catch((e) => toast.error(e.message));
    setAdding([]);
    refresh();
  };
  const remove = async (userId: string) => {
    await api.del(`/chat/channels/${channel.id}/members/${userId}`).catch((e) => toast.error(e.message));
    refresh();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Members of #${channel.name}`} description={`${channel.members.length} people`}>
      <div className="space-y-4">
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {channel.members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
              <Avatar name={m.name} src={m.avatarUrl} userId={m.id} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">
                  {m.name} {m.id === me.id && <span className="text-fg-3">(you)</span>}
                </p>
                <p className="truncate text-[11px] text-fg-3">{m.title ?? m.email}</p>
              </div>
              {m.id !== me.id && isAdmin && (
                <Button size="xs" variant="ghost" onClick={() => remove(m.id)}>
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-medium">Add people</p>
          <UserChecklist users={users.filter((u) => !memberIds.has(u.id))} value={adding} onChange={setAdding} />
          <Button className="mt-2" size="sm" disabled={!adding.length} onClick={add}>
            Add {adding.length || ''} to channel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

