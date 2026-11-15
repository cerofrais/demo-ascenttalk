'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Contact as ContactIcon, Mail, Pencil, Phone, Plus, Search } from 'lucide-react';
import { api, type CallInfo, type Conversation } from '@/lib/api';
import { CHANNEL_LABEL, duration, timeShort } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge, Empty, PageHeader, PageLoader } from '@/components/ui/misc';
import { Drawer } from '@/components/ui/dialog';
import { Select } from '@/components/ui/form';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { ConversationRow } from '@/components/inbox/conversation-list';
import { NewConversationDialog } from '@/components/inbox/new-conversation';
import { ContactFormDialog } from '@/components/clients/client-form';
import { useDialer } from '@/components/shell/softphone';

interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roleAtClient: string | null;
  clientId: string | null;
  notes: string | null;
  client: { id: string; name: string } | null;
  identities: { channelType: keyof typeof CHANNEL_LABEL; identifier: string }[];
  _count?: { conversations: number };
}

function ContactsInner() {
  const { features } = useApp();
  const search = useSearchParams();
  const router = useRouter();
  const selected = search.get('id');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [unlinked, setUnlinked] = useState(false);
  const [form, setForm] = useState<{ open: boolean; contact?: ContactRow | null }>({ open: false });
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading } = useQuery({ queryKey: ['contacts', dq, unlinked], queryFn: () => api.get<{ contacts: ContactRow[] }>('/contacts', { q: dq, unlinked: unlinked || undefined }) });
  const open = (id: string | null) => router.replace(id ? `/contacts?id=${id}` : '/contacts', { scroll: false });
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Contacts"
        subtitle="People who reach you on any channel. Link them to a client so their messages land on the client timeline."
        actions={
          <Button onClick={() => setForm({ open: true, contact: null })}>
            <Plus className="h-4 w-4" /> Add contact
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2 md:px-6">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or email" className="h-8 w-full rounded-lg border border-border bg-surface-2 pl-8 text-[13px] outline-none focus:border-primary" />
        </div>
        {features.clients && (
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg-2">
            <input type="checkbox" checked={unlinked} onChange={(e) => setUnlinked(e.target.checked)} className="accent-[var(--primary)]" />
            Not linked to a client
          </label>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <PageLoader />}
        {data && !data.contacts.length && (
          <Empty icon={<ContactIcon className="h-5 w-5" />} title="No contacts found">
            Contacts are created automatically when someone messages or calls you.
          </Empty>
        )}
        <ul className="divide-y divide-border bg-surface">
          {data?.contacts.map((c) => (
            <li key={c.id}>
              <button onClick={() => open(c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 md:px-6">
                <Avatar name={c.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {c.name} {c.roleAtClient && <span className="font-normal text-fg-3">· {c.roleAtClient}</span>}
                  </p>
                  <p className="truncate text-xs text-fg-3">{[c.phone, c.email].filter(Boolean).join(' · ') || 'No phone or email'}</p>
                </div>
                <div className="hidden items-center gap-1 sm:flex">
                  {[...new Set(c.identities.map((i) => i.channelType))].map((t) => (
                    <ChannelIcon key={t} type={t as any} className="h-3.5 w-3.5" />
                  ))}
                </div>
                {features.clients && (c.client ? <Badge>{c.client.name}</Badge> : <Badge color="#d97706">unlinked</Badge>)}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <ContactDrawer id={selected} onClose={() => open(null)} onEdit={(contact) => setForm({ open: true, contact })} />
      <ContactFormDialog open={form.open} onOpenChange={(v) => setForm((s) => ({ ...s, open: v }))} contact={form.contact} />
    </div>
  );
}

function ContactDrawer({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (c: ContactRow) => void }) {
  const { features } = useApp();
  const qc = useQueryClient();
  const router = useRouter();
  const dialer = useDialer();
  const [compose, setCompose] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['contact', id],
    queryFn: () => api.get<{ contact: ContactRow; conversations: Conversation[]; calls: CallInfo[] }>(`/contacts/${id}`),
    enabled: Boolean(id),
  });
  const { data: clients } = useQuery({ queryKey: ['clients', 'picker'], queryFn: () => api.get<{ clients: { id: string; name: string }[] }>('/clients'), enabled: Boolean(id) && features.clients });
  const c = data?.contact;
  const link = async (clientId: string) => {
    try {
      await api.patch(`/contacts/${id}`, { clientId: clientId || null });
      qc.invalidateQueries({ queryKey: ['contact', id] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(clientId ? 'Linked to client' : 'Unlinked');
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  return (
    <Drawer open={Boolean(id)} onOpenChange={(v) => !v && onClose()} title="Contact">
      {isLoading && <PageLoader />}
      {c && (
        <div>
          <div className="flex flex-col items-center gap-1 border-b border-border px-4 py-5 text-center">
            <Avatar name={c.name} size="xl" />
            <p className="mt-1 font-semibold">{c.name}</p>
            {c.roleAtClient && <p className="text-xs text-fg-3">{c.roleAtClient}</p>}
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {c.phone && dialer.available && (
                <Button size="sm" variant="outline" onClick={() => dialer.call(c.phone!, { name: c.name, contactId: c.id })}>
                  <Phone className="h-4 w-4" /> Call
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setCompose(true)}>
                Message
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onEdit(c)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </div>
          </div>
          <div className="space-y-2 border-b border-border px-4 py-3 text-[13px]">
            {c.phone && (
              <p className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-fg-3" /> {c.phone}
              </p>
            )}
            {c.email && (
              <p className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-fg-3" /> {c.email}
              </p>
            )}
            <div className="flex flex-wrap gap-1">
              {c.identities.map((i) => (
                <Badge key={`${i.channelType}-${i.identifier}`}>
                  <ChannelIcon type={i.channelType as any} className="h-3 w-3" /> {CHANNEL_LABEL[i.channelType]}
                </Badge>
              ))}
            </div>
            {c.notes && <p className="text-fg-2">{c.notes}</p>}
          </div>
          {features.clients && (
            <div className="border-b border-border px-4 py-3">
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Client</p>
              <Select value={c.clientId ?? ''} onChange={(e) => link(e.target.value)}>
                <option value="">Not linked</option>
                {clients?.clients.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name}
                  </option>
                ))}
              </Select>
              {c.client && (
                <Link href={`/clients/${c.client.id}`} className="mt-1.5 inline-block text-xs text-primary hover:underline">
                  Open {c.client.name}
                </Link>
              )}
            </div>
          )}
          <div className="border-b border-border">
            <p className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Conversations</p>
            {!data.conversations.length && <p className="px-4 pb-3 text-xs text-fg-3">No conversations yet</p>}
            {data.conversations.map((cv) => (
              <ConversationRow key={cv.id} c={cv} href={`/inbox/${cv.id}`} />
            ))}
          </div>
          {!!data.calls.length && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Recent calls</p>
              <ul className="px-4 pb-4 text-xs text-fg-2">
                {data.calls.map((k) => (
                  <li key={k.id} className="flex justify-between py-1">
                    <span>
                      {k.direction === 'INBOUND' ? 'Incoming' : 'Outgoing'} · {k.status.toLowerCase().replace('_', ' ')}
                      {k.durationSec ? ` · ${duration(k.durationSec)}` : ''}
                    </span>
                    <span className="text-fg-3">{timeShort(k.startedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <NewConversationDialog open={compose} onOpenChange={setCompose} contact={c ? { id: c.id, name: c.name } : null} onCreated={(cid) => router.push(`/inbox/${cid}`)} />
    </Drawer>
  );
}

export default function ContactsPage() {
  return (
    <Suspense>
      <ContactsInner />
    </Suspense>
  );
}
