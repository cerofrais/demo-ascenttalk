'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Check, ExternalLink, Mail, Phone, Plus, Tag } from 'lucide-react';
import { api, type Conversation, type Priority } from '@/lib/api';
import { CHANNEL_LABEL, cn, conversationTitle, timeAgo, timeFull, timeShort } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/misc';
import { Select } from '@/components/ui/form';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { Popover } from '@/components/ui/menu';
import { useDialer } from '@/components/shell/softphone';

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-3 last:border-0">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold tracking-wide text-fg-3 uppercase">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[13px]">
      <span className="shrink-0 text-fg-3">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}

export function ConversationDetails({
  conv,
  previous,
  onPatch,
}: {
  conv: Conversation & { participants?: { id: string; name: string }[] };
  previous: Conversation[];
  onPatch: (body: Record<string, unknown>, ok?: string) => Promise<void>;
}) {
  const { users, teams, labels, features, me } = useApp();
  const qc = useQueryClient();
  const dialer = useDialer();
  const [linking, setLinking] = useState(false);
  const { data: clients } = useQuery({
    queryKey: ['clients', 'picker'],
    queryFn: () => api.get<{ clients: { id: string; name: string }[] }>('/clients'),
    enabled: features.clients && linking,
  });

  const toggleLabel = async (labelId: string) => {
    const ids = new Set(conv.labels.map((l) => l.id));
    if (ids.has(labelId)) ids.delete(labelId);
    else ids.add(labelId);
    try {
      const res = await api.put<{ conversation: Conversation }>(`/conversations/${conv.id}/labels`, { labelIds: [...ids] });
      qc.setQueryData(['conversation', conv.id], (d: any) => (d ? { ...d, conversation: { ...d.conversation, labels: res.conversation.labels } } : d));
      qc.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const c = conv.contact;
  return (
    <div>
      <div className="flex flex-col items-center gap-1 border-b border-border px-4 py-5 text-center">
        <Avatar name={conversationTitle(conv)} src={c?.avatarUrl} size="xl" />
        <p className="mt-1 text-sm font-semibold">{conversationTitle(conv)}</p>
        <p className="flex items-center gap-1 text-xs text-fg-3">
          <ChannelIcon type={conv.channelType} className="h-3.5 w-3.5" />
          {conv.channelType ? CHANNEL_LABEL[conv.channelType] : ''} · {conv.inbox?.name}
        </p>
        {conv.isGroup && <Badge>Group conversation</Badge>}
        {c && !conv.isGroup && (
          <div className="mt-2 w-full space-y-1 text-left text-[13px]">
            {c.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-fg-3" />
                <span className="flex-1 truncate">{c.phone}</span>
                {dialer.available && (
                  <button className="text-xs font-medium text-primary" onClick={() => dialer.call(c.phone!, { name: c.name, contactId: c.id })}>
                    Call
                  </button>
                )}
              </div>
            )}
            {c.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-fg-3" />
                <span className="truncate">{c.email}</span>
              </div>
            )}
            <Link href={`/contacts?id=${c.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Open contact <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>

      {features.clients && (
        <Section
          title="Client"
          action={
            <button className="text-xs font-medium text-primary" onClick={() => setLinking((v) => !v)}>
              {conv.client ? 'Change' : 'Link'}
            </button>
          }
        >
          {conv.client ? (
            <Link href={`/clients/${conv.client.id}`} className="flex items-center gap-2.5 rounded-lg border border-border p-2 hover:bg-surface-2">
              <Avatar name={conv.client.name} src={conv.client.logoUrl} square size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{conv.client.name}</span>
                <span className="block text-[11px] text-fg-3">
                  {conv.client.accountManagerId ? `AM: ${users.find((u) => u.id === conv.client!.accountManagerId)?.name ?? '—'}` : 'No account manager'}
                </span>
              </span>
              <Building2 className="h-4 w-4 text-fg-3" />
            </Link>
          ) : (
            <p className="text-xs text-fg-3">Not linked to a client yet. Link it so it shows on the client's timeline.</p>
          )}
          {linking && (
            <Select
              className="mt-2"
              value={conv.client?.id ?? ''}
              onChange={async (e) => {
                await onPatch({ clientId: e.target.value || null }, e.target.value ? 'Linked to client' : 'Client unlinked');
                setLinking(false);
              }}
            >
              <option value="">No client</option>
              {clients?.clients.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.name}
                </option>
              ))}
            </Select>
          )}
        </Section>
      )}

      <Section title="Handling">
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-xs text-fg-3">Assignee</span>
            <Select value={conv.assignee?.id ?? ''} onChange={(e) => onPatch({ assigneeId: e.target.value || null })} disabled={me.role === 'GUEST'}>
              <option value="">Unassigned</option>
              {users
                .filter((u) => u.role !== 'GUEST')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.id === me.id ? ' (me)' : ''}
                  </option>
                ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-fg-3">Team</span>
            <Select value={conv.team?.id ?? ''} onChange={(e) => onPatch({ teamId: e.target.value || null })} disabled={me.role === 'GUEST'}>
              <option value="">No team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </label>
          {features.priority && (
            <label className="block">
              <span className="mb-1 block text-xs text-fg-3">Priority</span>
              <Select value={conv.priority} onChange={(e) => onPatch({ priority: e.target.value as Priority })}>
                {(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'] as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0) + p.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
      </Section>

      {features.labels && (
        <Section
          title="Labels"
          action={
            <Popover
              align="end"
              className="w-56 p-1"
              trigger={
                <button className="inline-flex items-center gap-1 text-xs font-medium text-primary" aria-label="Edit labels">
                  <Plus className="h-3 w-3" /> Edit
                </button>
              }
            >
              {labels.map((l) => {
                const on = conv.labels.some((x) => x.id === l.id);
                return (
                  <button key={l.id} onClick={() => toggleLabel(l.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                    <span className="flex-1 truncate">{l.name}</span>
                    {on && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                );
              })}
              {!labels.length && <p className="px-2 py-2 text-xs text-fg-3">No labels yet. Create them in Settings.</p>}
            </Popover>
          }
        >
          <div className="flex flex-wrap gap-1">
            {conv.labels.map((l) => (
              <Badge key={l.id} color={l.color}>
                <Tag className="h-3 w-3" />
                {l.name}
              </Badge>
            ))}
            {!conv.labels.length && <span className="text-xs text-fg-3">No labels</span>}
          </div>
        </Section>
      )}

      <Section title="Conversation">
        <Row label="Status">
          <StatusBadge status={conv.status} />
        </Row>
        <Row label="Started">{timeFull(conv.createdAt)}</Row>
        <Row label="Last client message">{conv.lastIncomingAt ? timeAgo(conv.lastIncomingAt) : '—'}</Row>
        <Row label="Last reply">{conv.lastOutgoingAt ? timeAgo(conv.lastOutgoingAt) : '—'}</Row>
        {conv.waitingSince && conv.status === 'OPEN' && (
          <Row label="Client waiting">
            <span className="font-medium text-warning">{timeAgo(conv.waitingSince).replace(' ago', '')}</span>
          </Row>
        )}
        {!!conv.participants?.length && (
          <Row label="Looped in">
            <span className="text-xs">{conv.participants.map((p) => p.name.split(' ')[0]).join(', ')}</span>
          </Row>
        )}
      </Section>

      {!!previous.length && (
        <Section title="Other conversations with this contact">
          <div className="space-y-1">
            {previous.map((p) => (
              <Link key={p.id} href={`/inbox/${p.id}`} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2')}>
                <ChannelIcon type={p.channelType} className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate text-xs">{p.lastMessagePreview || p.subject || p.inbox?.name}</span>
                <span className="shrink-0 text-[10px] text-fg-3">{timeShort(p.lastMessageAt)}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
