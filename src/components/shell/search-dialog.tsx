'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as D from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Building2, Hash, MessageSquare, Search, User } from 'lucide-react';
import { api } from '@/lib/api';
import { conversationTitle, timeShort } from '@/lib/utils';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/misc';

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const router = useRouter();
  const { data, isFetching } = useQuery({ queryKey: ['search', dq], queryFn: () => api.get('/search', { q: dq }), enabled: dq.length >= 2 });
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);
  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="py-1">
      <p className="px-3 py-1 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">{title}</p>
      {children}
    </div>
  );
  const Row = ({ onClick, icon, title, sub, right }: { onClick: () => void; icon: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) => (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center text-fg-3">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-fg">{title}</span>
        {sub && <span className="block truncate text-xs text-fg-3">{sub}</span>}
      </span>
      {right && <span className="shrink-0 text-[11px] text-fg-3">{right}</span>}
    </button>
  );
  const empty = data && !data.clients.length && !data.contacts.length && !data.conversations.length && !data.messages.length && !data.chat.length && !data.people.length;
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content className="fixed top-[8vh] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
          <D.Title className="sr-only">Search</D.Title>
          <D.Description className="sr-only">Search clients, contacts, conversations and messages</D.Description>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 text-fg-3" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients, people, conversations, messages…" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-3" />
            {isFetching && <Spinner />}
          </div>
          <div className="max-h-[60vh] overflow-y-auto pb-2">
            {dq.length < 2 && <p className="px-4 py-8 text-center text-sm text-fg-3">Type at least 2 characters</p>}
            {empty && <p className="px-4 py-8 text-center text-sm text-fg-3">No results for “{dq}”</p>}
            {!!data?.clients.length && (
              <Section title="Clients">
                {data.clients.map((c: any) => (
                  <Row key={c.id} onClick={() => go(`/clients/${c.id}`)} icon={<Building2 className="h-4 w-4" />} title={c.name} sub={c.status.toLowerCase()} />
                ))}
              </Section>
            )}
            {!!data?.contacts.length && (
              <Section title="Contacts">
                {data.contacts.map((c: any) => (
                  <Row key={c.id} onClick={() => go(`/contacts?id=${c.id}`)} icon={<User className="h-4 w-4" />} title={c.name} sub={[c.client?.name, c.phone, c.email].filter(Boolean).join(' · ')} />
                ))}
              </Section>
            )}
            {!!data?.people.length && (
              <Section title="Team">
                {data.people.map((p: any) => (
                  <Row key={p.id} onClick={() => go(`/chat?dm=${p.id}`)} icon={<Avatar name={p.name} src={p.avatarUrl} size="sm" />} title={p.name} sub={p.title ?? p.email} />
                ))}
              </Section>
            )}
            {!!data?.conversations.length && (
              <Section title="Conversations">
                {data.conversations.map((c: any) => (
                  <Row key={c.id} onClick={() => go(`/inbox/${c.id}`)} icon={<ChannelIcon type={c.channelType} />} title={conversationTitle(c)} sub={c.subject ?? c.lastMessagePreview} right={`#${c.displayId}`} />
                ))}
              </Section>
            )}
            {!!data?.messages.length && (
              <Section title="Client messages">
                {data.messages.map((m: any) => (
                  <Row key={m.id} onClick={() => go(`/inbox/${m.conversation.id}`)} icon={<ChannelIcon type={m.conversation.channelType} />} title={m.content} sub={`${m.senderName ?? ''} · ${conversationTitle(m.conversation)}`} right={timeShort(m.createdAt)} />
                ))}
              </Section>
            )}
            {!!data?.chat.length && (
              <Section title="Team chat">
                {data.chat.map((m: any) => (
                  <Row
                    key={m.id}
                    onClick={() => go(`/chat/${m.channel.id}${m.parentId ? `?thread=${m.parentId}` : ''}`)}
                    icon={m.channel.kind === 'DM' ? <MessageSquare className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                    title={m.content}
                    sub={`${m.user?.name ?? ''} · ${m.channel.name ?? 'Direct message'}`}
                    right={timeShort(m.createdAt)}
                  />
                ))}
              </Section>
            )}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
