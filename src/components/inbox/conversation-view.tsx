'use client';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlarmClock, ArrowLeft, CheckCircle2, ChevronDown, CornerUpLeft, Lock, MessageSquare, MoreVertical, PanelRight, Phone, RotateCcw, UserPlus, Users, X } from 'lucide-react';
import { api, ApiError, type Conversation, type ConversationStatus, type Message } from '@/lib/api';
import { CHANNEL_LABEL, cn, conversationTitle, dayLabel } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { emitSocket, useSocketEvent } from '@/hooks/use-realtime';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { Empty, PageLoader, PriorityBadge, Spinner, StatusBadge } from '@/components/ui/misc';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tooltip } from '@/components/ui/menu';
import { Drawer, Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/form';
import { Composer, type ComposerPayload } from '@/components/messages/composer';
import { useDialer } from '@/components/shell/softphone';
import { MessageBubble } from './message-bubble';
import { ConversationDetails } from './conversation-details';
import { ChatActionDialog, WhatsAppChatMenuItems, useWhatsAppChatInfo, type ChatAction } from './whatsapp-chat-actions';

type MsgPage = { messages: Message[]; hasMore: boolean };
export type ConversationFull = Conversation & { participants: { id: string; name: string }[] };

const TEXT_CHANNELS = ['WHATSAPP', 'EMAIL', 'WEBSITE', 'TELEGRAM', 'FACEBOOK', 'INSTAGRAM', 'SMS'];

function snoozeOptions() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const monday = new Date(now);
  monday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  monday.setHours(9, 0, 0, 0);
  return [
    { label: 'In 1 hour', at: new Date(+now + 3600_000) },
    { label: 'In 4 hours', at: new Date(+now + 4 * 3600_000) },
    { label: 'Tomorrow 9:00', at: tomorrow },
    { label: 'Next Monday 9:00', at: monday },
  ];
}

export function ConversationView({ id }: { id: string }) {
  const { me, features, users, isManager } = useApp();
  const qc = useQueryClient();
  const router = useRouter();
  const dialer = useDialer();
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [details, setDetails] = useState(false);
  const [share, setShare] = useState<Message | null>(null);
  const [typing, setTyping] = useState<{ name: string; at: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prevHeight = useRef(0);

  const convQuery = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.get<{ conversation: ConversationFull; previous: Conversation[] }>(`/conversations/${id}`),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const conv = convQuery.data?.conversation;
  const waInfo = useWhatsAppChatInfo(id, conv?.channelType === 'WHATSAPP');
  const [chatAction, setChatAction] = useState<ChatAction | null>(null);
  const removing = useRef(false);

  const msgKey = useMemo(() => ['messages', id], [id]);
  const msgs = useInfiniteQuery({
    queryKey: msgKey,
    queryFn: ({ pageParam }) => api.get<MsgPage>(`/conversations/${id}/messages`, { before: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.createdAt : undefined),
    refetchOnWindowFocus: false,
  });
  const messages = useMemo(() => [...(msgs.data?.pages ?? [])].reverse().flatMap((p) => p.messages), [msgs.data]);

  const markRead = useCallback(() => {
    api.post(`/conversations/${id}/read`).then(() => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
    }).catch(() => undefined);
    api.post('/notifications/read', { link: `/inbox/${id}` }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })).catch(() => undefined);
  }, [id, qc]);

  useEffect(() => {
    emitSocket('conversation.view', id);
    setMode('reply');
    setReplyTo(null);
    stick.current = true;
    markRead();
    return () => emitSocket('conversation.view', '');
  }, [id, markRead]);

  const upsert = useCallback(
    (m: Message) => {
      qc.setQueryData<InfiniteData<MsgPage>>(msgKey, (data) => {
        if (!data) return data;
        let found = false;
        const pages = data.pages.map((p) => ({
          ...p,
          messages: p.messages.map((x) => (x.id === m.id ? ((found = true), m) : x)),
        }));
        if (!found) pages[0] = { ...pages[0], messages: [...pages[0].messages, m] };
        return { ...data, pages };
      });
    },
    [qc, msgKey],
  );

  useSocketEvent<{ conversationId: string; message: Message }>('message.created', (p) => {
    if (p.conversationId !== id) return;
    upsert(p.message);
    if (p.message.direction === 'INCOMING' && document.visibilityState === 'visible') markRead();
    setTyping(null);
  });
  useSocketEvent<{ conversationId: string; message: Message }>('message.updated', (p) => p.conversationId === id && upsert(p.message));
  useSocketEvent<{ conversationId: string; messageId: string; status: Message['status'] }>('message.status', (p) => {
    if (p.conversationId !== id) return;
    qc.setQueryData<InfiniteData<MsgPage>>(msgKey, (data) =>
      data ? { ...data, pages: data.pages.map((pg) => ({ ...pg, messages: pg.messages.map((x) => (x.id === p.messageId ? { ...x, status: p.status } : x)) })) } : data,
    );
  });
  useSocketEvent<Conversation>('conversation.updated', (c) => {
    if (c.id === id) qc.setQueryData(['conversation', id], (d: any) => (d ? { ...d, conversation: { ...d.conversation, ...c, unread: 0 } } : d));
  });
  // deleted by someone else (or by clean-up on the tracking screen) while open here
  useSocketEvent<{ ids?: string[] }>('conversations.removed', (p) => {
    if (removing.current || !p.ids?.includes(id)) return;
    toast.info('This conversation was deleted from AscenTalk');
    router.replace('/inbox');
  });
  useSocketEvent<any>('typing', (p) => {
    if (p.scope === 'conversation' && p.id === id && p.userId !== me.id) setTyping({ name: p.contact ? 'Visitor' : `${p.name}${p.isPrivate ? ' (note)' : ''}`, at: Date.now() });
  });
  useEffect(() => {
    if (!typing) return;
    const t = setTimeout(() => setTyping(null), 4000);
    return () => clearTimeout(t);
  }, [typing]);

  // Keep the view pinned to the bottom, and preserve position when older pages load.
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

  const patch = async (body: Record<string, unknown>, ok?: string) => {
    try {
      const res = await api.patch<{ conversation: Conversation }>(`/conversations/${id}`, body);
      qc.setQueryData(['conversation', id], (d: any) => (d ? { ...d, conversation: { ...d.conversation, ...res.conversation } } : d));
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['conversation-counts'] });
      if (ok) toast.success(ok);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const send = async (p: ComposerPayload) => {
    stick.current = true;
    const res = await api.post<{ message: Message }>(`/conversations/${id}/messages`, {
      content: p.content,
      attachmentIds: p.attachmentIds,
      mentions: p.mentions,
      kind: mode === 'note' ? 'NOTE' : 'MESSAGE',
      replyToId: mode === 'reply' ? (replyTo?.id ?? null) : null,
    });
    upsert(res.message);
    setReplyTo(null);
  };

  if (convQuery.isLoading) return <PageLoader />;
  if (!conv) {
    return (
      <Empty icon={<MessageSquare className="h-5 w-5" />} title="Conversation not found" action={<Button onClick={() => router.push('/inbox')}>Back to inbox</Button>}>
        It may have been removed, or you don't have access to it.
      </Empty>
    );
  }

  const title = conversationTitle(conv);
  const channelType = conv.channelType;
  const canText = channelType ? TEXT_CHANNELS.includes(channelType) : false;
  const mentionUsers = users.filter((u) => u.id !== me.id);
  const mentionNames = users.map((u) => u.name);
  const phone = conv.contact?.phone;
  const metaWindowClosed = (channelType === 'FACEBOOK' || channelType === 'INSTAGRAM') && conv.lastIncomingAt && Date.now() - +new Date(conv.lastIncomingAt) > 24 * 3600_000;
  const inboxDown = conv.inbox && conv.inbox.status !== 'connected' && channelType !== 'WEBSITE';

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col bg-bg">
        {/* Header */}
        <header className="flex items-center gap-2 border-b border-border bg-surface px-2 py-2 md:px-4">
          <Link href="/inbox" className="rounded-lg p-1.5 text-fg-2 hover:bg-surface-2 lg:hidden" aria-label="Back to inbox">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => setDetails(true)}>
            {conv.isGroup ? (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-fg-2">
                <Users className="h-4 w-4" />
              </span>
            ) : (
              <Avatar name={title} src={conv.contact?.avatarUrl} />
            )}
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{title}</span>
                <span className="hidden text-xs text-fg-3 sm:inline">#{conv.displayId}</span>
                <span className="hidden sm:inline">
                  <PriorityBadge priority={conv.priority} />
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-fg-3">
                <ChannelIcon type={channelType} className="h-3.5 w-3.5" />
                <span className="truncate">
                  {conv.inbox?.name}
                  {conv.client ? ` · ${conv.client.name}` : ''}
                </span>
              </span>
            </span>
          </button>

          {/* Assignee */}
          <Menu>
            <MenuTrigger asChild>
              <button className="hidden items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface-2 sm:flex" aria-label="Assign">
                {conv.assignee ? <Avatar name={conv.assignee.name} src={conv.assignee.avatarUrl} size="xs" /> : <UserPlus className="h-3.5 w-3.5 text-fg-3" />}
                <span className="max-w-24 truncate">{conv.assignee?.name.split(' ')[0] ?? 'Assign'}</span>
                <ChevronDown className="h-3 w-3 text-fg-3" />
              </button>
            </MenuTrigger>
            <MenuContent className="w-56">
              <MenuLabel>Assign to</MenuLabel>
              {conv.assignee?.id !== me.id && <MenuItem onSelect={() => patch({ assigneeId: me.id })}>Me</MenuItem>}
              {users
                .filter((u) => u.id !== me.id && u.role !== 'GUEST')
                .map((u) => (
                  <MenuItem key={u.id} checked={conv.assignee?.id === u.id} onSelect={() => patch({ assigneeId: u.id })} icon={<Avatar name={u.name} src={u.avatarUrl} size="xs" />}>
                    {u.name}
                  </MenuItem>
                ))}
              {conv.assignee && (
                <>
                  <MenuSeparator />
                  <MenuItem onSelect={() => patch({ assigneeId: null })}>Unassign</MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>

          {phone && dialer.available && (
            <Tooltip content={`Call ${phone}`}>
              <Button variant="ghost" size="icon" onClick={() => dialer.call(phone, { name: conv.contact?.name, contactId: conv.contact?.id, conversationId: channelType === 'VOICE' ? conv.id : null })} aria-label="Call contact">
                <Phone className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}

          {conv.status === 'RESOLVED' ? (
            <Button variant="outline" size="sm" onClick={() => patch({ status: 'OPEN' }, 'Reopened')}>
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Reopen</span>
            </Button>
          ) : (
            <Button variant="success" size="sm" onClick={() => patch({ status: 'RESOLVED' }, 'Resolved')}>
              <CheckCircle2 className="h-4 w-4" />
              <span className="hidden sm:inline">Resolve</span>
            </Button>
          )}

          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </MenuTrigger>
            <MenuContent className="w-56">
              <MenuLabel>Status</MenuLabel>
              {(['OPEN', 'PENDING', 'RESOLVED'] as ConversationStatus[]).map((s) => (
                <MenuItem key={s} checked={conv.status === s} onSelect={() => patch({ status: s })}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </MenuItem>
              ))}
              {features.snooze && (
                <>
                  <MenuLabel>Snooze</MenuLabel>
                  {snoozeOptions().map((o) => (
                    <MenuItem key={o.label} icon={<AlarmClock className="h-3.5 w-3.5" />} onSelect={() => patch({ status: 'SNOOZED', snoozedUntil: o.at.toISOString() }, `Snoozed: ${o.label.toLowerCase()}`)}>
                      {o.label}
                    </MenuItem>
                  ))}
                </>
              )}
              <MenuSeparator />
              <MenuItem icon={<PanelRight className="h-3.5 w-3.5" />} onSelect={() => setDetails(true)}>
                Details
              </MenuItem>
              <MenuItem onSelect={() => patch({ assigneeId: me.id })} icon={<UserPlus className="h-3.5 w-3.5" />}>
                Assign to me
              </MenuItem>
              {channelType === 'WHATSAPP' && <WhatsAppChatMenuItems info={waInfo.data} onChoose={setChatAction} />}
            </MenuContent>
          </Menu>
        </header>

        {inboxDown && (
          <div className="border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-xs text-warning">
            {conv.inbox?.name} is not connected. Replies will fail until an admin reconnects it under Settings → Inboxes.
          </div>
        )}
        {conv.status === 'SNOOZED' && conv.snoozedUntil && (
          <div className="border-b border-border bg-surface-2 px-4 py-1.5 text-xs text-fg-2">Snoozed until {new Date(conv.snoozedUntil).toLocaleString()}</div>
        )}

        {/* Messages */}
        <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto py-3">
          {msgs.isFetchingNextPage && (
            <div className="flex justify-center py-2">
              <Spinner />
            </div>
          )}
          {msgs.isLoading && <PageLoader />}
          {!msgs.isLoading && !messages.length && <Empty title="No messages yet">Say hello 👋</Empty>}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            const sameSender =
              prev && !newDay && prev.kind === m.kind && prev.direction === m.direction && prev.senderUser?.id === m.senderUser?.id && prev.senderName === m.senderName && +new Date(m.createdAt) - +new Date(prev.createdAt) < 5 * 60_000;
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="my-3 flex items-center gap-3 px-5">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-medium text-fg-3">{dayLabel(m.createdAt)}</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <MessageBubble
                  m={m}
                  channelType={channelType}
                  isGroup={conv.isGroup}
                  showSender={!sameSender}
                  mentionNames={mentionNames}
                  onReply={canText && channelType !== 'EMAIL' && channelType !== 'WEBSITE' ? (x) => (setMode('reply'), setReplyTo(x)) : undefined}
                  onRetry={(x) => api.post(`/conversations/${id}/messages/${x.id}/retry`).catch((e) => toast.error(e.message))}
                  onDelete={(x) => api.del(`/conversations/${id}/messages/${x.id}`).catch((e) => toast.error(e.message))}
                  onShare={features.internalChat ? setShare : undefined}
                  canDelete={m.senderUser?.id === me.id || isManager}
                />
              </Fragment>
            );
          })}
          {typing && <p className="px-5 py-1 text-xs text-fg-3 italic">{typing.name} is typing…</p>}
        </div>

        {/* Composer */}
        <div className="bg-surface">
          <div className="flex items-center gap-1 border-t border-border px-3 pt-2">
            <button
              onClick={() => setMode('reply')}
              disabled={!canText}
              className={cn('rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-40', mode === 'reply' ? 'bg-primary-soft text-primary' : 'text-fg-3 hover:bg-surface-2')}
            >
              Reply{channelType ? ` via ${CHANNEL_LABEL[channelType]}` : ''}
            </button>
            {features.privateNotes && (
              <button
                onClick={() => setMode('note')}
                className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium', mode === 'note' ? 'bg-note text-fg ring-1 ring-note-border' : 'text-fg-3 hover:bg-surface-2')}
              >
                <Lock className="h-3 w-3" /> Private note
              </button>
            )}
          </div>
          <Composer
            key={mode}
            draftKey={`${id}:${mode}`}
            tone={mode === 'note' ? 'note' : 'default'}
            placeholder={
              mode === 'note'
                ? 'Internal note. Only your team sees this. Use @ to mention a teammate.'
                : conv.isGroup
                  ? `Message the group… ${features.cannedResponses ? '(type / for canned responses)' : ''}`
                  : `Reply to ${conv.contact?.name ?? 'contact'}… ${features.cannedResponses ? '(type / for canned responses)' : ''}`
            }
            onSend={send}
            mentionUsers={mode === 'note' ? mentionUsers : []}
            canned={mode === 'reply' && features.cannedResponses}
            cannedVars={{ 'contact.name': conv.contact?.name?.split(' ')[0] ?? '', 'client.name': conv.client?.name ?? '', 'agent.name': me.name }}
            onTyping={() => emitSocket('typing', { scope: 'conversation', id, isPrivate: mode === 'note' })}
            disabled={mode === 'reply' && !canText}
            disabledReason={channelType === 'VOICE' ? 'This is a phone conversation. Use the call button, or add a private note.' : 'Replies are not available on this channel.'}
            allowAttachments={features.files}
            allowVoiceNote={mode === 'reply' && (channelType === 'WHATSAPP' || channelType === 'TELEGRAM')}
            sendLabel={mode === 'note' ? 'Add note' : 'Send'}
            footerLeft={
              mode === 'reply' && metaWindowClosed
                ? '⚠ Last client message was over 24h ago. Meta may reject this reply.'
                : mode === 'reply' && conv.status === 'RESOLVED'
                  ? 'Replying will reopen this conversation'
                  : undefined
            }
            header={
              replyTo && mode === 'reply' ? (
                <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5 text-xs">
                  <CornerUpLeft className="h-3.5 w-3.5 text-primary" />
                  <span className="min-w-0 flex-1 truncate">
                    Replying to <b>{replyTo.senderName ?? 'message'}</b>: {replyTo.content}
                  </span>
                  <button onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                    <X className="h-3.5 w-3.5 text-fg-3" />
                  </button>
                </div>
              ) : undefined
            }
          />
        </div>
      </div>

      {/* Details: fixed panel on xl, drawer otherwise */}
      <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-border bg-surface xl:block">
        <ConversationDetails conv={conv} previous={convQuery.data?.previous ?? []} onPatch={patch} />
      </aside>
      <Drawer open={details} onOpenChange={setDetails} title="Details" className="xl:hidden">
        <ConversationDetails conv={conv} previous={convQuery.data?.previous ?? []} onPatch={patch} />
      </Drawer>

      <ShareDialog message={share} conversationId={id} onClose={() => setShare(null)} />
      {channelType === 'WHATSAPP' && (
        <ChatActionDialog
          action={chatAction}
          conversationId={id}
          title={title}
          info={waInfo.data}
          onClose={() => setChatAction(null)}
          onStart={() => (removing.current = true)}
          onDone={() => router.replace('/inbox')}
        />
      )}
    </div>
  );
}

function ShareDialog({ message, conversationId, onClose }: { message: Message | null; conversationId: string; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ['chat-channels'], queryFn: () => api.get<{ channels: { id: string; name: string; kind: string }[] }>('/chat/channels'), enabled: Boolean(message) });
  const [channelId, setChannelId] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (message) setComment('');
  }, [message]);
  const submit = async () => {
    if (!message || !channelId) return;
    setLoading(true);
    try {
      await api.post(`/chat/channels/${channelId}/share`, { conversationId, messageId: message.id, comment });
      toast.success('Shared with the team');
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog
      open={Boolean(message)}
      onOpenChange={(v) => !v && onClose()}
      title="Share to team chat"
      description="Posts this client message into an internal channel with a link back."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading} disabled={!channelId}>
            Share
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <blockquote className="line-clamp-4 rounded-lg border-l-2 border-primary bg-surface-2 px-3 py-2 text-xs text-fg-2">{message?.content ?? 'Attachment'}</blockquote>
        <Select value={channelId} onChange={(e) => setChannelId(e.target.value)} aria-label="Channel">
          <option value="">Choose a channel or DM…</option>
          {data?.channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.kind === 'DM' || c.kind === 'GROUP_DM' ? c.name : `#${c.name}`}
            </option>
          ))}
        </Select>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Add a comment (optional)" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary" />
      </div>
    </Dialog>
  );
}

