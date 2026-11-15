'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Compass, Hash, Lock, MessageSquarePlus, Plus } from 'lucide-react';
import { api, type ChatChannel } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/misc';
import { Tooltip } from '@/components/ui/menu';

export function useChannels() {
  return useQuery({ queryKey: ['chat-channels'], queryFn: () => api.get<{ channels: ChatChannel[] }>('/chat/channels') });
}

function ChannelLink({ c, active }: { c: ChatChannel; active: boolean }) {
  const { me } = useApp();
  const isDm = c.kind === 'DM' || c.kind === 'GROUP_DM';
  const other = isDm ? c.members.filter((m) => m.id !== me.id) : [];
  return (
    <Link
      href={`/chat/${c.id}`}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors',
        active ? 'bg-primary-soft font-medium text-primary' : c.unread ? 'font-semibold text-fg hover:bg-surface-2' : 'text-fg-2 hover:bg-surface-2',
      )}
    >
      {isDm ? (
        other.length === 1 ? (
          <Avatar name={other[0].name} src={other[0].avatarUrl} userId={other[0].id} size="xs" />
        ) : other.length === 0 ? (
          <Avatar name={me.name} src={me.avatarUrl} size="xs" />
        ) : (
          <span className="flex h-5 w-5 items-center justify-center rounded bg-surface-3 text-[10px] font-semibold">{other.length}</span>
        )
      ) : c.kind === 'PRIVATE' ? (
        <Lock className="h-3.5 w-3.5 shrink-0 opacity-70" />
      ) : (
        <Hash className="h-3.5 w-3.5 shrink-0 opacity-70" />
      )}
      <span className="min-w-0 flex-1 truncate">{isDm && other.length === 0 ? `${me.name} (you)` : c.name}</span>
      {c.unread > 0 && !c.muted && <span className="rounded-full bg-danger px-1.5 text-[10px] leading-4 font-semibold text-white">{c.unread > 99 ? '99+' : c.unread}</span>}
    </Link>
  );
}

export function ChannelSidebar() {
  const { features, me } = useApp();
  const params = useParams<{ id?: string }>();
  const { data, isLoading } = useChannels();
  const [create, setCreate] = useState(false);
  const [dm, setDm] = useState(false);
  const [browse, setBrowse] = useState(false);
  const groups = useMemo(() => {
    const all = data?.channels ?? [];
    return {
      channels: all.filter((c) => (c.kind === 'PUBLIC' || c.kind === 'PRIVATE') && !c.clientId).sort((a, b) => a.name.localeCompare(b.name)),
      clients: all.filter((c) => (c.kind === 'PUBLIC' || c.kind === 'PRIVATE') && c.clientId).sort((a, b) => a.name.localeCompare(b.name)),
      dms: all.filter((c) => c.kind === 'DM' || c.kind === 'GROUP_DM'),
    };
  }, [data]);
  const guest = me.role === 'GUEST';

  const Header = ({ title, action }: { title: string; action?: React.ReactNode }) => (
    <div className="mt-3 mb-1 flex items-center justify-between px-2">
      <span className="text-[11px] font-semibold tracking-wide text-fg-3 uppercase">{title}</span>
      {action}
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <h1 className="flex-1 text-base font-semibold">Team chat</h1>
        {!guest && (
          <Tooltip content="Browse channels">
            <Button variant="ghost" size="icon-sm" onClick={() => setBrowse(true)} aria-label="Browse channels">
              <Compass className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
        {features.dms && (
          <Tooltip content="New direct message">
            <Button variant="ghost" size="icon-sm" onClick={() => setDm(true)} aria-label="New direct message">
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {isLoading && (
          <div className="space-y-2 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        )}
        <Header
          title="Channels"
          action={
            !guest && (
              <button onClick={() => setCreate(true)} className="rounded p-0.5 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Create channel">
                <Plus className="h-3.5 w-3.5" />
              </button>
            )
          }
        />
        {groups.channels.map((c) => (
          <ChannelLink key={c.id} c={c} active={params.id === c.id} />
        ))}
        {!isLoading && !groups.channels.length && <p className="px-2 py-1 text-xs text-fg-3">No channels yet</p>}
        {!!groups.clients.length && (
          <>
            <Header title="Client channels" action={<Building2 className="h-3.5 w-3.5 text-fg-3" />} />
            {groups.clients.map((c) => (
              <ChannelLink key={c.id} c={c} active={params.id === c.id} />
            ))}
          </>
        )}
        {features.dms && (
          <>
            <Header
              title="Direct messages"
              action={
                <button onClick={() => setDm(true)} className="rounded p-0.5 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="New direct message">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              }
            />
            {groups.dms.map((c) => (
              <ChannelLink key={c.id} c={c} active={params.id === c.id} />
            ))}
            {!isLoading && !groups.dms.length && <p className="px-2 py-1 text-xs text-fg-3">Start a conversation with a teammate</p>}
          </>
        )}
      </div>
      <CreateChannelDialog open={create} onOpenChange={setCreate} />
      <NewDmDialog open={dm} onOpenChange={setDm} />
      <BrowseDialog open={browse} onOpenChange={setBrowse} />
    </div>
  );
}

export function CreateChannelDialog({ open, onOpenChange, clientId }: { open: boolean; onOpenChange: (v: boolean) => void; clientId?: string }) {
  const { features, users, me } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [priv, setPriv] = useState(false);
  const [client, setClient] = useState(clientId ?? '');
  const [members, setMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { data: clients } = useQuery({ queryKey: ['clients', 'picker'], queryFn: () => api.get<{ clients: { id: string; name: string }[] }>('/clients'), enabled: open && features.clients && features.clientLinkedChannels });
  const submit = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ channel: { id: string } }>('/chat/channels', { name, topic: topic || null, kind: priv ? 'PRIVATE' : 'PUBLIC', clientId: client || null, memberIds: members });
      await qc.invalidateQueries({ queryKey: ['chat-channels'] });
      onOpenChange(false);
      setName('');
      setTopic('');
      setMembers([]);
      router.push(`/chat/${res.channel.id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create a channel"
      description="Channels are where your team talks about a topic, a team or a client."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading} disabled={!name.trim()}>
            Create channel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" hint="Lowercase, no spaces. e.g. acme-foods, design-reviews">
          <Input value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="project-name" autoFocus />
        </Field>
        <Field label="Topic (optional)">
          <Textarea rows={2} value={topic} onChange={(e) => setTopic(e.target.value)} />
        </Field>
        {features.clients && features.clientLinkedChannels && (
          <Field label="Link to a client (optional)" hint="Client-linked channels show up on the client's page.">
            <Select value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">Not linked</option>
              {clients?.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-[13px] font-medium">Private channel</p>
            <p className="text-xs text-fg-3">Only invited members can see it.</p>
          </div>
          <Switch checked={priv} onChange={setPriv} label="Private channel" />
        </div>
        <Field label="Add members">
          <UserChecklist users={users.filter((u) => u.id !== me.id)} value={members} onChange={setMembers} />
        </Field>
      </div>
    </Dialog>
  );
}

export function UserChecklist({ users, value, onChange, max }: { users: { id: string; name: string; avatarUrl: string | null; title?: string | null }[]; value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const [q, setQ] = useState('');
  const shown = users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="rounded-lg border border-border">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="h-8 w-full border-b border-border bg-transparent px-3 text-[13px] outline-none" />
      <div className="max-h-44 overflow-y-auto p-1">
        {shown.map((u) => {
          const on = value.includes(u.id);
          return (
            <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-2">
              <input
                type="checkbox"
                checked={on}
                disabled={!on && max !== undefined && value.length >= max}
                onChange={() => onChange(on ? value.filter((x) => x !== u.id) : [...value, u.id])}
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              <Avatar name={u.name} src={u.avatarUrl} size="xs" />
              <span className="flex-1 truncate text-[13px]">{u.name}</span>
              {u.title && <span className="truncate text-[11px] text-fg-3">{u.title}</span>}
            </label>
          );
        })}
        {!shown.length && <p className="px-2 py-2 text-xs text-fg-3">No one found</p>}
      </div>
    </div>
  );
}

function NewDmDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { users, me, features } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ channel: { id: string } }>('/chat/dm', { userIds: picked });
      await qc.invalidateQueries({ queryKey: ['chat-channels'] });
      onOpenChange(false);
      setPicked([]);
      router.push(`/chat/${res.channel.id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New direct message"
      description={features.groupDms ? 'Pick one person, or up to 7 for a group DM.' : 'Pick a teammate.'}
      size="sm"
      footer={
        <Button onClick={submit} loading={loading} disabled={!picked.length}>
          Open chat
        </Button>
      }
    >
      <UserChecklist users={users.filter((u) => u.id !== me.id)} value={picked} onChange={setPicked} max={features.groupDms ? 7 : 1} />
    </Dialog>
  );
}

function BrowseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['chat-browse'], queryFn: () => api.get<{ channels: ChatChannel[] }>('/chat/channels/browse'), enabled: open });
  const join = async (id: string) => {
    await api.post(`/chat/channels/${id}/join`);
    await qc.invalidateQueries({ queryKey: ['chat-channels'] });
    qc.invalidateQueries({ queryKey: ['chat-browse'] });
    onOpenChange(false);
    router.push(`/chat/${id}`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Browse channels" description="Public channels you haven't joined yet.">
      <div className="space-y-1">
        {data?.channels.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <Hash className="h-4 w-4 text-fg-3" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{c.name}</p>
              <p className="truncate text-xs text-fg-3">
                {c.memberCount} members{c.client ? ` · ${c.client.name}` : ''}
                {c.topic ? ` · ${c.topic}` : ''}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => join(c.id)}>
              Join
            </Button>
          </div>
        ))}
        {data && !data.channels.length && <p className="py-6 text-center text-sm text-fg-3">You're in every public channel 🎉</p>}
      </div>
    </Dialog>
  );
}
