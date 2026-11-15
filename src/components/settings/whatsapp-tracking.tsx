'use client';
/**
 * Choosing which WhatsApp chats and groups a linked number brings into AscenTalk
 * (API: apps/api/src/routes/whatsapp-sync.ts, rules: apps/api/src/channels/whatsapp-sync-rules.ts).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, ListFilter, Plus, RefreshCw, Search, Trash2, TriangleAlert, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { useSocketEvent } from '@/hooks/use-realtime';
import { Button } from '@/components/ui/button';
import { Badge, Card, Empty, PageLoader, Spinner, Tabs } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';

// ─── API shapes ─────────────────────────────────────────────────────────────

export type ChatPolicy = 'approved' | 'clients' | 'all';
export type GroupPolicy = 'approved' | 'all';

export interface TrackingSummary {
  inbox: { id: string; name: string; status: string; statusDetail: string | null; phoneNumber: string | null };
  owner: { id: string; name: string } | null;
  isOwner: boolean;
  canManage: boolean;
  canLink: boolean;
  groupsFeature: boolean;
  /** False until someone has saved a choice: nothing is tracked yet. */
  configured: boolean;
  rules: { chats: ChatPolicy; groups: GroupPolicy };
  counts: { chats: number; groups: number; blocked: number; outside: number };
  /** Only sent to whoever manages the number. */
  allow?: string[];
  block?: string[];
}

export interface TrackingChatRow {
  id: string;
  name: string | null;
  phone: string | null;
  client: boolean;
  clientName: string | null;
  listed: boolean;
  inInbox: boolean;
  wroteAt: string | null;
}

export interface TrackingGroupRow {
  id: string;
  name: string;
  size: number | null;
  community: boolean;
  listed: boolean;
  inInbox: boolean;
  wroteAt: string | null;
}

export interface TrackingChatList {
  connected: boolean;
  rows: TrackingChatRow[];
  error: string | null;
}

export interface TrackingGroupList {
  featureEnabled: boolean;
  connected: boolean;
  rows: TrackingGroupRow[];
  fetchedAt: string | null;
  error: string | null;
}

export interface OutsideConversation {
  id: string;
  displayId: number;
  jid: string;
  name: string;
  isGroup: boolean;
  messages: number;
  lastMessageAt: string;
}

export interface TrackingRemoval {
  conversations: number;
  messages: number;
  files: number;
  contacts: number;
}

const base = (id: string) => `/inboxes/${id}/whatsapp/tracking`;
const keys = {
  mine: ['whatsapp-mine'] as const,
  summary: (id: string) => ['wa-tracking', id] as const,
  chats: (id: string) => ['wa-tracking', id, 'chats'] as const,
  groups: (id: string) => ['wa-tracking', id, 'groups'] as const,
  outside: (id: string) => ['wa-tracking', id, 'outside'] as const,
};

/** Shows "WhatsApp tracking" in Settings to admins, and to anyone who owns a linked number. */
export function useShowWhatsAppTracking(): boolean {
  const { isAdmin, features, inboxes } = useApp();
  const available = features.channels.WHATSAPP && inboxes.some((i) => i.channelType === 'WHATSAPP');
  const mine = useQuery({ queryKey: keys.mine, queryFn: () => api.get<{ inboxes: TrackingSummary[] }>('/whatsapp/mine'), enabled: available && !isAdmin, staleTime: 5 * 60_000, retry: false });
  return available && (isAdmin || Boolean(mine.data?.inboxes.length));
}

// ─── Rules, as the screen edits them ────────────────────────────────────────

interface Draft {
  chats: ChatPolicy;
  groups: GroupPolicy;
  allow: Set<string>;
  block: Set<string>;
}

const isGroupId = (id: string) => id.endsWith('@g.us');

/** What the policy alone says, before the allow and block lists. */
function policyDefault(d: Draft, id: string, client: boolean): boolean {
  if (isGroupId(id)) return d.groups === 'all';
  return d.chats === 'all' || (d.chats === 'clients' && client);
}

function isTracked(d: Draft, id: string, client: boolean): boolean {
  if (d.block.has(id)) return false;
  if (d.allow.has(id)) return true;
  return policyDefault(d, id, client);
}

/** The lists only hold exceptions to the policy, so a choice that matches the policy clears the entry. */
function setTracked(d: Draft, id: string, client: boolean, want: boolean): Draft {
  const allow = new Set(d.allow);
  const block = new Set(d.block);
  allow.delete(id);
  block.delete(id);
  if (want !== policyDefault(d, id, client)) (want ? allow : block).add(id);
  return { ...d, allow, block };
}

const draftFrom = (s: TrackingSummary): Draft => ({ chats: s.rules.chats, groups: s.rules.groups, allow: new Set(s.allow ?? []), block: new Set(s.block ?? []) });
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const sameDraft = (a: Draft, b: Draft) => a.chats === b.chats && a.groups === b.groups && sameSet(a.allow, b.allow) && sameSet(a.block, b.block);

function phoneToJid(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? `${digits}@s.whatsapp.net` : null;
}

const CHAT_POLICY: Record<ChatPolicy, { label: string; hint: string }> = {
  approved: { label: 'Only chats I choose', hint: 'Nothing else is stored. Best for a personal number.' },
  clients: { label: 'Client contacts, plus chats I choose', hint: 'Anyone saved as a contact on a client record, as soon as they write.' },
  all: { label: 'Every chat, except the ones I block', hint: 'Best for a number used only for work.' },
};

const GROUP_POLICY: Record<GroupPolicy, { label: string; hint: string }> = {
  approved: { label: 'Only groups I choose', hint: 'Family, friends and community groups stay out.' },
  all: { label: 'Every group, except the ones I block', hint: 'Including groups the number joins later.' },
};

export function policySummary(s: TrackingSummary): string {
  if (!s.configured) return 'Nothing is tracked yet';
  const chats = s.rules.chats === 'all' ? 'all chats' : s.rules.chats === 'clients' ? `client contacts + ${s.counts.chats} chosen` : `${s.counts.chats} chosen chat${s.counts.chats === 1 ? '' : 's'}`;
  const groups = !s.groupsFeature ? 'groups off' : s.rules.groups === 'all' ? 'all groups' : `${s.counts.groups} chosen group${s.counts.groups === 1 ? '' : 's'}`;
  return `Tracking ${chats} and ${groups}${s.counts.blocked ? `, ${s.counts.blocked} blocked` : ''}`;
}

// ─── One number, on the overview ────────────────────────────────────────────

const STATUS: Record<string, { label: string; color: string }> = {
  connected: { label: 'Linked', color: '#16a34a' },
  connecting: { label: 'Waiting to be linked', color: '#b98300' },
  pending: { label: 'Not linked', color: '#b98300' },
  disconnected: { label: 'Not linked', color: '#dc2626' },
  error: { label: 'Needs attention', color: '#dc2626' },
};

export function NumberCard({ inboxId, onOpen }: { inboxId: string; onOpen: () => void }) {
  const { isAdmin, users } = useApp();
  const qc = useQueryClient();
  const { data: s, error } = useQuery({ queryKey: keys.summary(inboxId), queryFn: () => api.get<TrackingSummary>(base(inboxId)) });
  const [savingOwner, setSavingOwner] = useState(false);
  if (error) return <Card><p className="text-sm text-danger">{(error as Error).message}</p></Card>;
  if (!s) return <Card><div className="flex justify-center py-6"><Spinner /></div></Card>;
  const status = STATUS[s.inbox.status] ?? STATUS.pending;

  const changeOwner = async (userId: string | null) => {
    const who = users.find((u) => u.id === userId)?.name;
    if (userId && !confirm(`${who} will decide which chats and groups this number tracks. Admins will no longer see its chat list. Continue?`)) return;
    setSavingOwner(true);
    try {
      await api.put(`/inboxes/${inboxId}/whatsapp/owner`, { userId });
      await qc.invalidateQueries({ queryKey: ['wa-tracking', inboxId] });
      qc.invalidateQueries({ queryKey: keys.mine });
      toast.success(userId ? `This number now belongs to ${who}` : 'This number is now managed by admins');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingOwner(false);
    }
  };

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {s.inbox.name}
          {s.inbox.phoneNumber && <span className="font-normal text-fg-3">{s.inbox.phoneNumber}</span>}
          <Badge color={status.color}>{status.label}</Badge>
        </span>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className={cn('flex items-center gap-1.5 text-sm font-medium', !s.configured && 'text-warning')}>
              {!s.configured && <TriangleAlert className="h-4 w-4 shrink-0" />}
              {policySummary(s)}
            </p>
            <p className="text-xs text-fg-3">
              {s.owner ? (s.isOwner ? 'This is your number: only you choose what it tracks.' : `Belongs to ${s.owner.name}: only they choose what it tracks.`) : 'An agency number: admins choose what it tracks.'}
            </p>
            {s.counts.outside > 0 && s.canManage && (
              <p className="text-xs text-fg-2">
                {s.counts.outside} conversation{s.counts.outside === 1 ? '' : 's'} from before {s.counts.outside === 1 ? 'is' : 'are'} no longer tracked.
              </p>
            )}
          </div>
          {s.canManage ? (
            <Button size="sm" onClick={onOpen}>
              <ListFilter className="h-4 w-4" /> Choose chats and groups
            </Button>
          ) : null}
        </div>

        {isAdmin && (
          <Field label="Whose number is this?" hint="A personal number should belong to its owner, so only they see its chats and decide what the agency gets.">
            <Select value={s.owner?.id ?? ''} disabled={savingOwner} onChange={(e) => void changeOwner(e.target.value || null)} className="max-w-sm">
              <option value="">Agency number, managed by admins</option>
              {users
                .filter((u) => u.role !== 'GUEST')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}

        {s.canLink && <LinkPhone summary={s} />}
      </div>
    </Card>
  );
}

// ─── Linking the phone (for the owner; admins can also link from Inboxes & channels) ─

type LinkState = { state: string; qr: string | null; pairingCode?: string | null; status?: string };

function LinkPhone({ summary }: { summary: TrackingSummary }) {
  const qc = useQueryClient();
  const id = summary.inbox.id;
  const linked = summary.inbox.status === 'connected';
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [mode, setMode] = useState<'qr' | 'phone'>('qr');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['wa-tracking', id] });

  const start = async (phoneNumber?: string) => {
    setBusy(true);
    try {
      const res = await api.post<LinkState>(`/inboxes/${id}/whatsapp/link`, phoneNumber ? { phoneNumber } : {});
      setQr(res.qr);
      setCode(res.pairingCode ?? null);
      if (res.state === 'open') {
        setOpen(false);
        refresh();
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open || linked) return;
    const t = setInterval(async () => {
      const res = await api.get<LinkState>(`/inboxes/${id}/whatsapp/link`).catch(() => null);
      if (!res) return;
      if (res.qr) setQr(res.qr);
      if (res.pairingCode) setCode(res.pairingCode);
      if (res.state === 'open') {
        setOpen(false);
        refresh();
        toast.success('WhatsApp linked');
      }
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, linked, id]);

  useSocketEvent<{ inboxId: string; qr: string | null; pairingCode?: string | null }>('whatsapp.qr', (p) => {
    if (p.inboxId !== id) return;
    if (p.qr) setQr(p.qr);
    if (p.pairingCode) setCode(p.pairingCode);
  });

  if (linked) {
    if (!summary.isOwner) return null;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2/60 px-3 py-2">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <p className="flex-1 text-xs text-fg-2">Your phone is linked. Unlinking stops all syncing until you link it again.</p>
        <Button
          size="xs"
          variant="outline"
          onClick={async () => {
            if (!confirm('Unlink your phone? Nothing will sync until you link it again.')) return;
            await api.post(`/inboxes/${id}/whatsapp/unlink`).catch((err) => toast.error(err.message));
            refresh();
          }}
        >
          Unlink
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2/60 px-3 py-2">
        <p className="flex-1 text-xs text-fg-2">
          {summary.configured ? 'The phone is not linked, so nothing is syncing.' : 'Choose what to track first, then link the phone: nothing is stored until you do both.'}
        </p>
        <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
          Link phone
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border p-4 text-center">
      {mode === 'phone' ? (
        code ? (
          <>
            <p className="font-mono text-3xl font-semibold tracking-[0.2em]" aria-label="Pairing code">
              {code.slice(0, 4)}-{code.slice(4)}
            </p>
            <p className="mt-3 text-sm font-medium">Enter this code in WhatsApp</p>
            <p className="text-xs text-fg-3">WhatsApp → Settings → Linked devices → Link a device → Link with phone number instead</p>
          </>
        ) : (
          <form
            className="mx-auto flex max-w-sm flex-col gap-2 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              void start(phone);
            }}
          >
            <Field label="Your WhatsApp number, with country code">
              <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </Field>
            <Button type="submit" loading={busy}>
              Get pairing code
            </Button>
          </form>
        )
      ) : qr ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="WhatsApp QR code" className="mx-auto h-56 w-56 rounded-lg bg-white p-2" />
          <p className="mt-3 text-sm font-medium">Scan with WhatsApp</p>
          <p className="text-xs text-fg-3">WhatsApp → Settings → Linked devices → Link a device</p>
        </>
      ) : (
        <Button onClick={() => start()} loading={busy}>
          Show QR code
        </Button>
      )}
      <div className="mt-3 flex flex-wrap justify-center gap-4">
        <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setMode(mode === 'qr' ? 'phone' : 'qr')}>
          {mode === 'qr' ? 'On your phone? Link with a code instead' : 'Scan a QR code instead'}
        </button>
        <button type="button" className="text-xs text-fg-3 hover:underline" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Choosing chats and groups ──────────────────────────────────────────────

type Filter = 'all' | 'tracked' | 'untracked' | 'recent';
const PAGE = 150;

interface Row {
  id: string;
  title: string;
  sub: string | null;
  client: boolean;
  badges: { text: string; color?: string }[];
  wroteAt: string | null;
  inInbox: boolean;
}

function chatRow(c: TrackingChatRow): Row {
  const badges: Row['badges'] = [];
  if (c.client) badges.push({ text: c.clientName ? `Client: ${c.clientName}` : 'Client contact', color: '#2a78d6' });
  if (c.inInbox) badges.push({ text: 'In AscenTalk' });
  if (!c.listed) badges.push({ text: c.phone ? 'Not in the phone’s list' : 'Number hidden by WhatsApp' });
  // a contact saved under its own number has no name worth showing
  const name = c.name && c.name.replace(/\D/g, '') !== (c.phone ?? '').replace(/\D/g, '') ? c.name : null;
  return { id: c.id, title: name ?? c.phone ?? 'Private number', sub: name ? c.phone : null, client: c.client, badges, wroteAt: c.wroteAt, inInbox: c.inInbox };
}

function groupRow(g: TrackingGroupRow): Row {
  const badges: Row['badges'] = [];
  if (g.community) badges.push({ text: 'Community' });
  if (g.inInbox) badges.push({ text: 'In AscenTalk' });
  if (!g.listed) badges.push({ text: 'Not in the phone’s list' });
  return { id: g.id, title: g.name, sub: g.size ? `${g.size} members` : null, client: false, badges, wroteAt: g.wroteAt, inInbox: g.inInbox };
}

const byTitle = (a: Row, b: Row) => {
  const an = a.sub === null && /^\+?\d/.test(a.title);
  const bn = b.sub === null && /^\+?\d/.test(b.title);
  return Number(an) - Number(bn) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
};

export function TrackingEditor({ inboxId, onBack }: { inboxId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: keys.summary(inboxId), queryFn: () => api.get<TrackingSummary>(base(inboxId)) });
  const s = summary.data;
  const allowed = Boolean(s?.canManage);
  const chats = useQuery({ queryKey: keys.chats(inboxId), queryFn: () => api.get<TrackingChatList>(`${base(inboxId)}/chats`), enabled: allowed, retry: false });
  const [refreshGroups, setRefreshGroups] = useState(false);
  const groups = useQuery({
    queryKey: keys.groups(inboxId),
    queryFn: () => api.get<TrackingGroupList>(`${base(inboxId)}/groups`, refreshGroups ? { refresh: '1' } : undefined),
    enabled: allowed,
    retry: false,
    staleTime: 10 * 60_000,
  });

  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (!s?.allow) return;
    const next = draftFrom(s);
    setSaved(next);
    setDraft((d) => (d && saved && !sameDraft(d, saved) ? d : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const [tab, setTab] = useState<'chats' | 'groups'>('chats');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [added, setAdded] = useState<TrackingChatRow[]>([]);
  const [newNumber, setNewNumber] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setLimit(PAGE), [tab, filter, query]);

  const rows = useMemo(() => {
    if (tab === 'groups') return (groups.data?.rows ?? []).map(groupRow).sort(byTitle);
    const known = new Set((chats.data?.rows ?? []).map((r) => r.id));
    return [...(chats.data?.rows ?? []), ...added.filter((a) => !known.has(a.id))].map(chatRow).sort(byTitle);
  }, [tab, chats.data, groups.data, added]);

  if (summary.isLoading) return <PageLoader />;
  if (!s) return <Empty title="This number was not found" action={<Button variant="outline" onClick={onBack}>Back</Button>} />;
  if (!s.canManage)
    return (
      <Empty title={`Only ${s.owner?.name ?? 'the owner'} can choose what this number tracks`} action={<Button variant="outline" onClick={onBack}>Back</Button>}>
        It is their personal number, so its chats and groups are only shown to them.
      </Empty>
    );
  if (!draft || !saved) return <PageLoader />;

  const dirty = !sameDraft(draft, saved);
  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (q && !`${r.title} ${r.sub ?? ''} ${r.badges.map((b) => b.text).join(' ')}`.toLowerCase().includes(q)) return false;
    const on = isTracked(draft, r.id, r.client);
    if (filter === 'tracked') return on;
    if (filter === 'untracked') return !on;
    if (filter === 'recent') return Boolean(r.wroteAt) && !on;
    return true;
  });
  const trackedCount = rows.filter((r) => isTracked(draft, r.id, r.client)).length;
  const recentCount = rows.filter((r) => r.wroteAt && !isTracked(draft, r.id, r.client)).length;

  const toggle = (r: Row, want: boolean) => setDraft((d) => d && setTracked(d, r.id, r.client, want));
  const setAll = (want: boolean) => setDraft((d) => d && visible.reduce((acc, r) => setTracked(acc, r.id, r.client, want), d));
  const keepExisting = () =>
    setDraft((d) => {
      if (!d) return d;
      const inInbox = [...(chats.data?.rows ?? []).map(chatRow), ...(groups.data?.rows ?? []).map(groupRow)].filter((r) => r.inInbox);
      return inInbox.reduce((acc, r) => setTracked(acc, r.id, r.client, true), d);
    });

  const addNumber = () => {
    const jid = phoneToJid(newNumber);
    if (!jid) return toast.error('Enter the full number with country code, for example +91 98765 43210');
    const digits = jid.split('@')[0];
    setAdded((a) => (a.some((x) => x.id === jid) ? a : [...a, { id: jid, name: null, phone: `+${digits}`, client: false, clientName: null, listed: false, inInbox: false, wroteAt: null }]));
    setDraft((d) => d && setTracked(d, jid, false, true));
    setNewNumber('');
    setTab('chats');
    setQuery(digits.slice(-6));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put<TrackingSummary>(base(inboxId), { chats: draft.chats, groups: draft.groups, allow: [...draft.allow], block: [...draft.block] });
      qc.setQueryData(keys.summary(inboxId), res);
      const next = draftFrom(res);
      setSaved(next);
      setDraft(next);
      qc.invalidateQueries({ queryKey: keys.outside(inboxId) });
      qc.invalidateQueries({ queryKey: keys.mine });
      toast.success('Saved. Only the chosen chats and groups will sync from now on.');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const list = tab === 'groups' ? groups : chats;
  const groupsOff = tab === 'groups' && (groups.data ? !groups.data.featureEnabled : !s.groupsFeature);

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 pt-4 md:px-6 md:pt-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> All numbers
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{s.inbox.name}</h1>
          <p className="text-sm text-fg-3">{s.inbox.phoneNumber ?? 'Number not linked yet'}</p>
        </div>
      </div>

      {!s.configured && (
        <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <TriangleAlert className="h-5 w-5 shrink-0 text-warning" />
          <div className="space-y-2">
            <p>
              <span className="font-medium">Nothing from this number is tracked yet.</span> Choose below, then save. Chats you leave out are ignored completely: their messages are not stored, and
              nobody can write to them from AscenTalk.
            </p>
            {(chats.data?.rows.some((r) => r.inInbox) || groups.data?.rows.some((r) => r.inInbox)) && (
              <Button size="xs" variant="outline" onClick={keepExisting}>
                Keep the chats already in AscenTalk
              </Button>
            )}
          </div>
        </div>
      )}

      <Card title="What to track">
        <div className="grid gap-5 md:grid-cols-2">
          <PolicyPicker
            label="Direct chats"
            value={draft.chats}
            options={CHAT_POLICY}
            onChange={(chats) => setDraft({ ...draft, chats })}
          />
          <PolicyPicker
            label="Groups"
            value={draft.groups}
            options={GROUP_POLICY}
            onChange={(groups) => setDraft({ ...draft, groups })}
            note={!s.groupsFeature ? 'Groups are switched off for the whole agency, so none sync whatever you choose here.' : undefined}
          />
        </div>
      </Card>

      <Card padded={false}>
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs
              value={tab}
              onChange={(t) => {
                setTab(t);
                setQuery('');
              }}
              items={[
                { value: 'chats', label: 'Chats', count: chats.data ? (chats.data.rows.length + added.length) : undefined },
                { value: 'groups', label: 'Groups', count: groups.data?.rows.length },
              ]}
            />
            {tab === 'groups' && groups.data?.fetchedAt && (
              <span className="flex items-center gap-2 text-xs text-fg-3">
                List from {timeAgo(groups.data.fetchedAt)}
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={groups.isFetching}
                  onClick={() => {
                    setRefreshGroups(true);
                    void qc.invalidateQueries({ queryKey: keys.groups(inboxId) }).finally(() => setRefreshGroups(false));
                  }}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', groups.isFetching && 'animate-spin')} /> Refresh
                </Button>
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-fg-3" />
              <Input className="pl-8" placeholder={tab === 'chats' ? 'Search name, number or client' : 'Search groups'} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select className="w-auto" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Show">
              <option value="all">All ({rows.length})</option>
              <option value="tracked">Tracked ({trackedCount})</option>
              <option value="untracked">Not tracked ({rows.length - trackedCount})</option>
              <option value="recent">Wrote recently, not tracked ({recentCount})</option>
            </Select>
          </div>
          {tab === 'chats' && (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addNumber();
              }}
            >
              <Input type="tel" inputMode="tel" className="max-w-xs" placeholder="Add a number: +91 98765 43210" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} aria-label="Add a number to track" />
              <Button type="submit" size="sm" variant="outline" disabled={!newNumber.trim()}>
                <Plus className="h-4 w-4" /> Track this number
              </Button>
            </form>
          )}
        </div>

        {groupsOff ? (
          <Empty icon={<Users className="h-5 w-5" />} title="Groups are switched off">
            An admin has turned WhatsApp groups off in Features, so no group syncs from any number.
          </Empty>
        ) : list.isLoading ? (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-fg-3">
            <Spinner />
            {tab === 'groups' ? 'Asking WhatsApp for this number’s groups. With many groups this can take up to a minute.' : 'Loading chats…'}
          </div>
        ) : (
          <>
            {list.data?.error && <p className="border-b border-border bg-warning/10 px-4 py-2 text-xs text-fg-2">{list.data.error}</p>}
            {list.error && <p className="border-b border-border bg-danger/10 px-4 py-2 text-xs text-danger">{(list.error as Error).message}</p>}
            {list.data && !list.data.connected && (
              <p className="border-b border-border bg-surface-2 px-4 py-2 text-xs text-fg-2">The phone is not linked, so only chats you chose before, or added by number, are shown.</p>
            )}
            {visible.length > 0 && (
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-fg-3">
                <span>
                  {visible.length} shown
                </span>
                <span className="flex gap-1">
                  <Button size="xs" variant="ghost" onClick={() => setAll(true)}>
                    Track all shown
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setAll(false)}>
                    Track none of these
                  </Button>
                </span>
              </div>
            )}
            {visible.length === 0 ? (
              <Empty title={rows.length ? 'Nothing matches' : tab === 'chats' ? 'No chats to show' : 'No groups to show'}>
                {rows.length ? 'Try another search or filter.' : tab === 'chats' ? 'Add a number above, or link the phone to see its chats.' : 'Link the phone to see its groups.'}
              </Empty>
            ) : (
              <ul className="divide-y divide-border">
                {visible.slice(0, limit).map((r) => {
                  const on = isTracked(draft, r.id, r.client);
                  return (
                    <li key={r.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                        <input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--primary)]" checked={on} onChange={(e) => toggle(r, e.target.checked)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{r.title}</span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3">
                            {r.sub && <span>{r.sub}</span>}
                            {r.wroteAt && !on && <span className="text-warning">Wrote {timeAgo(r.wroteAt)}, not stored</span>}
                            {r.badges.map((b) => (
                              <Badge key={b.text} color={b.color}>
                                {b.text}
                              </Badge>
                            ))}
                          </span>
                        </span>
                        <span className={cn('shrink-0 text-xs font-medium', on ? 'text-success' : 'text-fg-3')}>{on ? 'Tracked' : 'Ignored'}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {visible.length > limit && (
              <div className="border-t border-border p-3 text-center">
                <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
                  Show {Math.min(PAGE, visible.length - limit)} more of {visible.length - limit}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <OutsideSection inboxId={inboxId} dirty={dirty} />

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-surface/95 backdrop-blur md:-mx-6">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6 safe-bottom">
          <p className="text-sm text-fg-2">{dirty ? 'You have unsaved choices.' : s.configured ? policySummary(s) : 'Nothing saved yet.'}</p>
          <div className="flex gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(saved)}>
                Undo
              </Button>
            )}
            <Button onClick={save} loading={saving} disabled={!dirty && s.configured}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PolicyPicker<T extends string>({ label, value, options, onChange, note }: { label: string; value: T; options: Record<T, { label: string; hint: string }>; onChange: (v: T) => void; note?: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-[13px] font-semibold">{label}</legend>
      {(Object.keys(options) as T[]).map((key) => (
        <label key={key} className={cn('flex cursor-pointer gap-3 rounded-lg border p-3', value === key ? 'border-primary bg-primary-soft/60' : 'border-border hover:bg-surface-2/60')}>
          <input type="radio" className="mt-0.5 accent-[var(--primary)]" checked={value === key} onChange={() => onChange(key)} />
          <span>
            <span className="block text-sm font-medium">{options[key].label}</span>
            <span className="block text-xs text-fg-3">{options[key].hint}</span>
          </span>
        </label>
      ))}
      {note && <p className="text-xs text-warning">{note}</p>}
    </fieldset>
  );
}

// ─── Conversations synced before the current choices ────────────────────────

function OutsideSection({ inboxId, dirty }: { inboxId: string; dirty: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: keys.outside(inboxId), queryFn: () => api.get<{ conversations: OutsideConversation[] }>(`${base(inboxId)}/outside`) });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const rows = data?.conversations ?? [];
  useEffect(() => setPicked((p) => new Set([...p].filter((id) => rows.some((r) => r.id === id)))), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (isLoading || !rows.length) return null;
  const chosen = rows.filter((r) => picked.has(r.id));
  const messages = chosen.reduce((n, r) => n + r.messages, 0);

  const remove = async () => {
    setBusy(true);
    try {
      const res = await api.post<TrackingRemoval>(`${base(inboxId)}/outside/remove`, { ids: chosen.map((r) => r.id) });
      toast.success(`Removed ${res.conversations} conversation${res.conversations === 1 ? '' : 's'} and ${res.messages} message${res.messages === 1 ? '' : 's'}`);
      setPicked(new Set());
      setConfirming(false);
      qc.invalidateQueries({ queryKey: keys.outside(inboxId) });
      qc.invalidateQueries({ queryKey: keys.summary(inboxId) });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={`Synced before, no longer tracked (${rows.length})`}
      actions={
        <Button size="sm" variant="danger" disabled={!chosen.length || dirty} onClick={() => setConfirming(true)}>
          <Trash2 className="h-4 w-4" /> Remove {chosen.length || ''}
        </Button>
      }
      padded={false}
    >
      <p className="border-b border-border px-4 py-3 text-xs text-fg-3">
        These came in before your current choices. They no longer update, and nothing can be sent to them. Removing them deletes their messages and files from AscenTalk for everyone. WhatsApp on the
        phone is not touched.{dirty ? ' Save your choices first.' : ''}
      </p>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs">
        <Button size="xs" variant="ghost" onClick={() => setPicked(picked.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))}>
          {picked.size === rows.length ? 'Select none' : 'Select all'}
        </Button>
      </div>
      <ul className="max-h-80 divide-y divide-border overflow-y-auto">
        {rows.map((r) => (
          <li key={r.id}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-surface-2/60">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={picked.has(r.id)}
                onChange={(e) => setPicked((p) => {
                  const next = new Set(p);
                  if (e.target.checked) next.add(r.id);
                  else next.delete(r.id);
                  return next;
                })}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {r.name} {r.isGroup && <Badge>Group</Badge>}
                </span>
                <span className="text-xs text-fg-3">
                  #{r.displayId} · {r.messages} message{r.messages === 1 ? '' : 's'} · last {timeAgo(r.lastMessageAt)}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${chosen.length} conversation${chosen.length === 1 ? '' : 's'}?`}
        description="This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={remove}>
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-2">
          {messages} message{messages === 1 ? '' : 's'} and their files will be deleted from AscenTalk for everyone, along with contacts that only existed because of these chats. Contacts on a client
          record are kept. WhatsApp on the phone is not touched.
        </p>
      </Dialog>
    </Card>
  );
}
