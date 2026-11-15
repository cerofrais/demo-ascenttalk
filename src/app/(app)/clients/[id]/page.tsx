'use client';
import { use, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Activity, ArrowLeft, Download, ExternalLink, File as FileIcon, FolderOpen, Globe, Hash, Lock, Mail, Pencil, Phone, Plus, StickyNote, Trash2, Upload } from 'lucide-react';
import { api, type Attachment, type CallInfo, type ChannelType, type Conversation } from '@/lib/api';
import { bytes, cn, dayLabel, duration, timeAgo, timeShort } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge, Card, Empty, PageLoader, Stat, Tabs } from '@/components/ui/misc';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { Input } from '@/components/ui/form';
import { Attachments, DriveCard } from '@/components/messages/content';
import { ConversationRow } from '@/components/inbox/conversation-list';
import { NewConversationDialog } from '@/components/inbox/new-conversation';
import { CLIENT_STATUS_COLOR, ClientFormDialog, ContactFormDialog, type ClientRecord } from '@/components/clients/client-form';
import { CreateChannelDialog } from '@/components/chat/channel-sidebar';
import { useDialer } from '@/components/shell/softphone';

interface ClientFull extends ClientRecord {
  contacts: { id: string; name: string; email: string | null; phone: string | null; roleAtClient: string | null; clientId: string | null; notes: string | null }[];
  driveLinks: { id: string; url: string; title: string | null; fileType: string | null; createdAt: string; createdBy: { id: string; name: string } | null }[];
  channels: { id: string; name: string; kind: string; topic: string | null }[];
  stats: { open: number; pending: number; resolved: number; calls: number; lastActivityAt: string | null };
}

type TimelineItem =
  | { type: 'message' | 'note'; at: string; id: string; direction: 'INCOMING' | 'OUTGOING'; content: string | null; senderName: string | null; channelType: ChannelType; inbox: { name: string }; conversation: { id: string; displayId: number; title: string | null }; attachments: Attachment[] }
  | { type: 'call'; at: string; id: string; call: CallInfo; channelType: 'VOICE' }
  | { type: 'event'; at: string; id: string; summary: string; eventType: string; actor: { id: string; name: string } | null };

type Tab = 'timeline' | 'conversations' | 'contacts' | 'files' | 'team';

export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { features, isManager, me } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const dialer = useDialer();
  const [tab, setTab] = useState<Tab>('timeline');
  const [edit, setEdit] = useState(false);
  const [contactDialog, setContactDialog] = useState<{ open: boolean; contact?: ClientFull['contacts'][number] | null }>({ open: false });
  const [compose, setCompose] = useState<{ id: string; name: string } | null>(null);
  const [channelDialog, setChannelDialog] = useState(false);
  const [driveUrl, setDriveUrl] = useState('');
  const logoInput = useRef<HTMLInputElement>(null);

  const { data, isLoading, error } = useQuery({ queryKey: ['client', id], queryFn: () => api.get<{ client: ClientFull }>(`/clients/${id}`) });
  const timeline = useInfiniteQuery({
    queryKey: ['client-timeline', id],
    queryFn: ({ pageParam }) => api.get<{ items: TimelineItem[]; conversations: Conversation[]; nextBefore: string | null }>(`/clients/${id}/timeline`, { before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const files = useQuery({ queryKey: ['client-files', id], queryFn: () => api.get<{ files: (Attachment & { source: string; senderName: string | null; conversationId: string | null; channelId: string | null; channelType: ChannelType | null })[] }>(`/clients/${id}/files`), enabled: tab === 'files' });

  if (isLoading) return <PageLoader />;
  if (error || !data) return <Empty title="Client not found" action={<Button onClick={() => router.push('/clients')}>Back to clients</Button>} />;
  const c = data.client;
  const canEdit = isManager || c.accountManager?.id === me.id;
  const items = timeline.data?.pages.flatMap((p) => p.items) ?? [];
  const conversations = timeline.data?.pages[0]?.conversations ?? [];

  const addDrive = async () => {
    if (!driveUrl.trim()) return;
    try {
      await api.post(`/clients/${id}/drive-links`, { url: driveUrl.trim() });
      setDriveUrl('');
      qc.invalidateQueries({ queryKey: ['client', id] });
      toast.success('Drive link pinned');
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  const uploadLogo = async (file?: File) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      await fetch(`/api/clients/${id}/logo`, { method: 'POST', body: fd, credentials: 'include' }).then((r) => (r.ok ? r : Promise.reject(new Error('Upload failed'))));
      qc.invalidateQueries({ queryKey: ['client', id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border bg-surface px-4 py-4 md:px-6">
        <Link href="/clients" className="mb-3 inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> All clients
        </Link>
        <div className="flex flex-wrap items-start gap-4">
          <button className="group relative" onClick={() => canEdit && logoInput.current?.click()} aria-label="Change logo" disabled={!canEdit}>
            <Avatar name={c.name} src={c.logoUrl} square size="xl" />
            {canEdit && (
              <span className="absolute inset-0 hidden items-center justify-center rounded-lg bg-black/40 text-white group-hover:flex">
                <Upload className="h-4 w-4" />
              </span>
            )}
          </button>
          <input ref={logoInput} type="file" accept="image/*" hidden onChange={(e) => uploadLogo(e.target.files?.[0])} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{c.name}</h1>
              <Badge color={CLIENT_STATUS_COLOR[c.status]}>{c.status.toLowerCase()}</Badge>
              {c.tags.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-fg-2">
              {c.industry && <span>{c.industry}</span>}
              {c.website && (
                <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <Globe className="h-3.5 w-3.5" /> {c.website.replace(/^https?:\/\//, '')}
                </a>
              )}
              <span className="inline-flex items-center gap-1.5">
                {c.accountManager ? (
                  <>
                    <Avatar name={c.accountManager.name} src={c.accountManager.avatarUrl} size="xs" /> {c.accountManager.name} <span className="text-fg-3">(account manager)</span>
                  </>
                ) : (
                  <span className="text-warning">No account manager</span>
                )}
              </span>
              {c.team && <Badge color={c.team.color}>{c.team.name}</Badge>}
            </p>
            {c.notes && <p className="mt-2 max-w-2xl text-[13px] text-fg-2">{c.notes}</p>}
          </div>
          <div className="flex gap-2">
            {c.driveFolderUrl && features.driveLinks && (
              <a href={c.driveFolderUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  <FolderOpen className="h-4 w-4" /> Drive folder
                </Button>
              </a>
            )}
            {canEdit && (
              <Button variant="outline" onClick={() => setEdit(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Open conversations" value={c.stats.open} tone={c.stats.open ? 'warning' : undefined} />
          <Stat label="Pending" value={c.stats.pending} />
          <Stat label="Resolved" value={c.stats.resolved} />
          <Stat label="Last activity" value={<span className="text-base">{c.stats.lastActivityAt ? timeAgo(c.stats.lastActivityAt) : '—'}</span>} hint={`${c.stats.calls} ${c.stats.calls === 1 ? 'call' : 'calls'} logged`} />
        </div>
      </div>

      <div className="grid flex-1 gap-4 p-4 md:p-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            className="mb-3"
            items={[
              { value: 'timeline', label: 'Timeline' },
              { value: 'conversations', label: 'Conversations', count: conversations.length },
              { value: 'contacts', label: 'Contacts', count: c.contacts.length },
              { value: 'files', label: 'Files' },
              ...(features.internalChat ? [{ value: 'team' as Tab, label: 'Team channels', count: c.channels.length }] : []),
            ]}
          />

          {tab === 'timeline' && (
            <Card padded={false}>
              {timeline.isLoading && <PageLoader />}
              {!timeline.isLoading && !items.length && (
                <Empty icon={<Activity className="h-5 w-5" />} title="Nothing yet">
                  Messages, calls, notes and changes for this client will appear here across every channel.
                </Empty>
              )}
              <ol className="divide-y divide-border">
                {items.map((it, i) => {
                  const prev = items[i - 1];
                  const newDay = !prev || new Date(prev.at).toDateString() !== new Date(it.at).toDateString();
                  return (
                    <li key={`${it.type}-${it.id}`}>
                      {newDay && <p className="bg-surface-2 px-4 py-1 text-[11px] font-semibold text-fg-3">{dayLabel(it.at)}</p>}
                      <div className="flex gap-3 px-4 py-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2">
                          {it.type === 'event' ? <Activity className="h-3.5 w-3.5 text-fg-3" /> : it.type === 'note' ? <StickyNote className="h-3.5 w-3.5 text-warning" /> : <ChannelIcon type={it.channelType} className="h-3.5 w-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          {it.type === 'event' && (
                            <p className="text-[13px] text-fg-2">
                              {it.summary} <span className="text-[11px] text-fg-3">· {timeShort(it.at)}</span>
                            </p>
                          )}
                          {it.type === 'call' && (
                            <div>
                              <p className="text-[13px]">
                                <b>{it.call.direction === 'INBOUND' ? 'Incoming' : 'Outgoing'} call</b> · {it.call.status.toLowerCase().replace('_', ' ')}
                                {it.call.durationSec ? ` · ${duration(it.call.durationSec)}` : ''}
                                <span className="text-[11px] text-fg-3"> · {timeShort(it.at)}</span>
                              </p>
                              <p className="text-xs text-fg-3">
                                {it.call.contact?.name ?? it.call.fromNumber} {it.call.user ? `↔ ${it.call.user.name}` : ''}
                              </p>
                              {it.call.recordingUrl && <audio controls preload="none" src={it.call.recordingUrl} className="mt-1 h-8 w-full max-w-sm" />}
                              {it.call.voicemailUrl && <audio controls preload="none" src={it.call.voicemailUrl} className="mt-1 h-8 w-full max-w-sm" />}
                            </div>
                          )}
                          {(it.type === 'message' || it.type === 'note') && (
                            <div>
                              <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                                <b>{it.senderName ?? (it.direction === 'OUTGOING' ? 'Agency' : 'Client')}</b>
                                <span className="text-[11px] text-fg-3">
                                  {it.type === 'note' ? 'private note' : it.direction === 'INCOMING' ? 'wrote' : 'replied'} in{' '}
                                  <Link href={`/inbox/${it.conversation.id}`} className="text-primary hover:underline">
                                    {it.conversation.title ?? `#${it.conversation.displayId}`}
                                  </Link>{' '}
                                  · {it.inbox.name} · {timeShort(it.at)}
                                </span>
                              </p>
                              {it.content && <p className={cn('mt-0.5 line-clamp-4 text-[13px] whitespace-pre-wrap text-fg-2', it.type === 'note' && 'rounded-md bg-note px-2 py-1')}>{it.content}</p>}
                              {!!it.attachments.length && <Attachments items={it.attachments} className="mt-1.5" />}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {timeline.hasNextPage && (
                <div className="border-t border-border p-3">
                  <Button variant="outline" size="sm" className="w-full" loading={timeline.isFetchingNextPage} onClick={() => timeline.fetchNextPage()}>
                    Load older activity
                  </Button>
                </div>
              )}
            </Card>
          )}

          {tab === 'conversations' && (
            <Card padded={false}>
              {!conversations.length && <Empty title="No conversations linked">Link a conversation from the inbox, or add this client's contacts so new messages match automatically.</Empty>}
              {conversations.map((cv) => (
                <ConversationRow key={cv.id} c={cv} href={`/inbox/${cv.id}`} />
              ))}
            </Card>
          )}

          {tab === 'contacts' && (
            <Card
              padded={false}
              title="People at this client"
              actions={
                <Button size="sm" variant="outline" onClick={() => setContactDialog({ open: true, contact: null })}>
                  <Plus className="h-4 w-4" /> Add contact
                </Button>
              }
            >
              {!c.contacts.length && <Empty title="No contacts yet">Add the people you talk to. Incoming WhatsApp, email and calls match by phone or email.</Empty>}
              <ul className="divide-y divide-border">
                {c.contacts.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Avatar name={p.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">
                        {p.name} {p.roleAtClient && <span className="font-normal text-fg-3">· {p.roleAtClient}</span>}
                      </p>
                      <p className="flex flex-wrap gap-x-3 text-xs text-fg-3">
                        {p.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {p.phone}
                          </span>
                        )}
                        {p.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {p.email}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {p.phone && dialer.available && (
                        <Button size="xs" variant="outline" onClick={() => dialer.call(p.phone!, { name: p.name, contactId: p.id })}>
                          <Phone className="h-3.5 w-3.5" /> Call
                        </Button>
                      )}
                      <Button size="xs" variant="outline" onClick={() => setCompose({ id: p.id, name: p.name })}>
                        Message
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => setContactDialog({ open: true, contact: p })} aria-label="Edit contact">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {tab === 'files' && (
            <Card padded={false} title="Files exchanged">
              {files.isLoading && <PageLoader />}
              {files.data && !files.data.files.length && <Empty icon={<FileIcon className="h-5 w-5" />} title="No files yet">Attachments from client conversations and client-linked channels are collected here.</Empty>}
              <ul className="divide-y divide-border">
                {files.data?.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                    {f.kind === 'IMAGE' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.url} alt="" className="h-9 w-9 rounded-md object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-2 text-fg-3">
                        <FileIcon className="h-4 w-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[13px] font-medium hover:underline">
                        {f.fileName}
                      </a>
                      <p className="truncate text-xs text-fg-3">
                        {bytes(f.size)} · {f.senderName ?? 'Unknown'} · {f.source === 'internal' ? 'team channel' : 'client conversation'} · {f.createdAt ? timeShort(f.createdAt) : ''}
                      </p>
                    </div>
                    {f.conversationId && (
                      <Link href={`/inbox/${f.conversationId}`} className="text-xs text-primary hover:underline">
                        Open
                      </Link>
                    )}
                    <a href={`${f.url}&dl=1`} className="rounded-md p-1.5 text-fg-3 hover:bg-surface-2" aria-label="Download">
                      <Download className="h-4 w-4" />
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {tab === 'team' && (
            <Card
              padded={false}
              title="Internal channels about this client"
              actions={
                features.clientLinkedChannels && (
                  <Button size="sm" variant="outline" onClick={() => setChannelDialog(true)}>
                    <Plus className="h-4 w-4" /> New channel
                  </Button>
                )
              }
            >
              {!c.channels.length && <Empty title="No linked channels">Create a channel like #{c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')} for internal discussion. Clients never see it.</Empty>}
              <ul className="divide-y divide-border">
                {c.channels.map((ch) => (
                  <li key={ch.id}>
                    <Link href={`/chat/${ch.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                      {ch.kind === 'PRIVATE' ? <Lock className="h-4 w-4 text-fg-3" /> : <Hash className="h-4 w-4 text-fg-3" />}
                      <span className="text-[13px] font-medium">{ch.name}</span>
                      <span className="truncate text-xs text-fg-3">{ch.topic}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Right rail: Drive */}
        {features.driveLinks && (
          <div className="space-y-4">
            <Card title="Google Drive">
              {c.driveFolderUrl ? (
                <DriveCard link={{ url: c.driveFolderUrl, fileType: 'folder', title: `${c.name} shared folder` }} />
              ) : (
                <p className="text-xs text-fg-3">No shared folder set. Add one with Edit.</p>
              )}
              <p className="mt-4 mb-2 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Pinned links</p>
              <div className="space-y-1.5">
                {c.driveLinks.map((l) => (
                  <div key={l.id} className="group flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <DriveCard link={l} compact />
                    </div>
                    <button
                      className="rounded p-1 text-fg-3 opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100"
                      aria-label="Remove link"
                      onClick={async () => {
                        await api.del(`/drive-links/${l.id}`);
                        qc.invalidateQueries({ queryKey: ['client', id] });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {!c.driveLinks.length && <p className="text-xs text-fg-3">Pin briefs, decks and reports for quick access.</p>}
              </div>
              <div className="mt-3 flex gap-2">
                <Input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="Paste a Drive or Docs link" onKeyDown={(e) => e.key === 'Enter' && addDrive()} />
                <Button variant="outline" onClick={addDrive} disabled={!driveUrl.trim()} aria-label="Pin link">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </Card>
            {c.website && (
              <a href={c.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-border bg-surface p-3 text-[13px] hover:bg-surface-2">
                <ExternalLink className="h-4 w-4 text-fg-3" /> Visit website
              </a>
            )}
          </div>
        )}
      </div>

      <ClientFormDialog open={edit} onOpenChange={setEdit} client={c} />
      <ContactFormDialog open={contactDialog.open} onOpenChange={(v) => setContactDialog((s) => ({ ...s, open: v }))} contact={contactDialog.contact} clientId={id} />
      <NewConversationDialog open={Boolean(compose)} onOpenChange={(v) => !v && setCompose(null)} contact={compose} onCreated={(cid) => router.push(`/inbox/${cid}`)} />
      <CreateChannelDialog open={channelDialog} onOpenChange={setChannelDialog} clientId={id} />
    </div>
  );
}
