'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Building2, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge, Empty, PageHeader, PageLoader, Tabs } from '@/components/ui/misc';
import { CLIENT_STATUS_COLOR, ClientFormDialog, type ClientRecord } from '@/components/clients/client-form';

type StatusTab = 'ALL' | ClientRecord['status'];

export default function ClientsPage() {
  const { me, features } = useApp();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusTab>('ALL');
  const [mine, setMine] = useState(false);
  const [create, setCreate] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['clients', q, status, mine],
    queryFn: () => api.get<{ clients: ClientRecord[] }>('/clients', { q, status: status === 'ALL' ? undefined : status, mine: mine || undefined }),
    enabled: features.clients,
  });
  if (!features.clients) return <Empty title="Clients are disabled">Enable `clients` in config/features.json.</Empty>;
  const canCreate = me.role !== 'MEMBER' && me.role !== 'GUEST';
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Clients"
        subtitle="Every brand you serve, with its people, conversations, calls and files."
        actions={
          canCreate && (
            <Button onClick={() => setCreate(true)}>
              <Plus className="h-4 w-4" /> Add client
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2 md:px-6">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients or tags" className="h-8 w-full rounded-lg border border-border bg-surface-2 pl-8 text-[13px] outline-none focus:border-primary" />
        </div>
        <Tabs<StatusTab>
          value={status}
          onChange={setStatus}
          items={[
            { value: 'ALL', label: 'All' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'LEAD', label: 'Leads' },
            { value: 'PAUSED', label: 'Paused' },
            { value: 'CHURNED', label: 'Churned' },
          ]}
        />
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-[13px] text-fg-2">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="accent-[var(--primary)]" />
          My accounts
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        {isLoading && <PageLoader />}
        {data && !data.clients.length && (
          <Empty icon={<Building2 className="h-5 w-5" />} title="No clients found" action={canCreate && <Button onClick={() => setCreate(true)}>Add your first client</Button>}>
            Add a client to group its contacts, WhatsApp groups, emails and calls in one timeline.
          </Empty>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data?.clients.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`} className="rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-border-strong">
              <div className="flex items-start gap-3">
                <Avatar name={c.name} src={c.logoUrl} square size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.name}</p>
                  <p className="truncate text-xs text-fg-3">{c.industry ?? 'No industry set'}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge color={CLIENT_STATUS_COLOR[c.status]}>{c.status.toLowerCase()}</Badge>
                    {c.tags.slice(0, 2).map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </div>
                </div>
                {!!c.openConversations && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-fg">{c.openConversations} open</span>}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-fg-3">
                <span className="flex items-center gap-1.5">
                  {c.accountManager ? (
                    <>
                      <Avatar name={c.accountManager.name} src={c.accountManager.avatarUrl} size="xs" />
                      <span className="text-fg-2">{c.accountManager.name}</span>
                    </>
                  ) : (
                    'No account manager'
                  )}
                </span>
                <span>{c.lastActivityAt ? `Active ${timeAgo(c.lastActivityAt)}` : `${c.counts?.contacts ?? 0} contacts`}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <ClientFormDialog open={create} onOpenChange={setCreate} onSaved={(c) => router.push(`/clients/${c.id}`)} />
    </div>
  );
}
