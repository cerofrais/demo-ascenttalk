'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, type ChannelType } from '@/lib/api';
import { CHANNEL_LABEL, cn } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { useSocketEvent } from '@/hooks/use-realtime';
import { Button } from '@/components/ui/button';
import { Badge, Card, Empty, PageHeader, PageLoader, Spinner } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { ChannelIcon } from '@/components/ui/channel-icon';
import { UserChecklist } from '@/components/chat/channel-sidebar';
import { CopyField } from '@/components/settings/copy-field';

interface InboxFull {
  id: string;
  name: string;
  channelType: ChannelType;
  status: string;
  statusDetail: string | null;
  enabled: boolean;
  config: Record<string, any>;
  greeting: string | null;
  signature: string | null;
  team: { id: string; name: string; color: string } | null;
  teamId: string | null;
  memberIds: string[];
  token?: string;
  widgetSnippet?: string;
  metaWebhook?: { callbackUrl: string; verifyToken: string };
  flagEnabled: boolean;
  counts?: { conversations: number };
}

interface Providers {
  whatsapp: { enabled: boolean; configured: boolean; reachable: boolean };
  email: { enabled: boolean; google: { enabled: boolean; configured: boolean; redirectUri: string }; microsoft: { enabled: boolean; configured: boolean; redirectUri: string }; imapPassword: { enabled: boolean } };
  voice: { enabled: boolean; configured: boolean };
  website: { enabled: boolean };
  telegram: { enabled: boolean; publicUrl: string };
  facebook: { enabled: boolean; appSecretConfigured: boolean; webhook: string; verifyToken: string };
  instagram: { enabled: boolean; appSecretConfigured: boolean };
  publicUrl: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  connected: { label: 'Connected', color: '#16a34a' },
  connecting: { label: 'Waiting to be linked', color: '#d97706' },
  pending: { label: 'Setting up', color: '#d97706' },
  disconnected: { label: 'Disconnected', color: '#dc2626' },
  error: { label: 'Needs attention', color: '#dc2626' },
};

const CHANNEL_HELP: Record<string, string> = {
  WHATSAPP: 'Link a WhatsApp number by scanning a QR code. Supports groups, media and voice notes.',
  EMAIL: 'Connect a shared mailbox with Google or Microsoft sign-in. Replies thread correctly.',
  VOICE: 'Use a Plivo phone number for incoming and outgoing calls with recording.',
  WEBSITE: 'A chat bubble for your website or a client’s website.',
  TELEGRAM: 'Connect a Telegram bot. Works in private chats and groups.',
  FACEBOOK: 'Receive and reply to Facebook Page messages.',
  INSTAGRAM: 'Receive and reply to Instagram DMs for a professional account.',
};

type WhatsAppLink = { state: string; qr: string | null; pairingCode?: string | null };

function WhatsAppConnect({ inbox }: { inbox: InboxFull }) {
  const qc = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  // "phone" links with a pairing code: the only option when the admin is on the phone that owns the number.
  const [mode, setMode] = useState<'qr' | 'phone'>('qr');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState(inbox.status === 'connected' ? 'open' : 'unknown');
  const [busy, setBusy] = useState(false);
  const refreshList = () => qc.invalidateQueries({ queryKey: ['inboxes'] });
  const start = async (phoneNumber?: string) => {
    setBusy(true);
    try {
      const res = await api.post<WhatsAppLink>(`/inboxes/${inbox.id}/whatsapp/connect`, phoneNumber ? { phoneNumber } : {});
      setState(res.state);
      setQr(res.qr);
      setPairingCode(res.pairingCode ?? null);
      if (phoneNumber && res.state !== 'open' && !res.pairingCode) toast.error('WhatsApp did not return a pairing code. Check the number, or scan the QR code instead.');
      if (res.state === 'open') refreshList();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  // Poll while waiting for the link (QR and pairing codes rotate every ~30s).
  useEffect(() => {
    if (state === 'open') return;
    const t = setInterval(async () => {
      const res = await api.get<WhatsAppLink>(`/inboxes/${inbox.id}/whatsapp/status`).catch(() => null);
      if (!res) return;
      setState(res.state);
      if (res.qr) setQr(res.qr);
      if (res.pairingCode) setPairingCode(res.pairingCode);
      if (res.state === 'close') {
        // WhatsApp stopped offering codes (too many refreshes): go back to the start.
        setQr(null);
        setPairingCode(null);
      }
      if (res.state === 'open') {
        setQr(null);
        setPairingCode(null);
        refreshList();
        toast.success('WhatsApp connected');
      }
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, inbox.id]);
  useSocketEvent<{ inboxId: string; qr: string | null; pairingCode?: string | null }>('whatsapp.qr', (p) => {
    if (p.inboxId !== inbox.id) return;
    if (p.qr) setQr(p.qr);
    if (p.pairingCode) setPairingCode(p.pairingCode);
  });

  if (state === 'open') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4">
        <CheckCircle2 className="h-5 w-5 text-success" />
        <div className="flex-1">
          <p className="text-sm font-medium">Connected{inbox.config.phoneNumber ? ` as ${inbox.config.phoneNumber}` : ''}</p>
          <p className="text-xs text-fg-3">Messages sent from the phone itself also appear in AscenTalk.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            if (!confirm('Disconnect this WhatsApp number?')) return;
            await api.post(`/inboxes/${inbox.id}/whatsapp/logout`);
            setState('close');
            refreshList();
          }}
        >
          Disconnect
        </Button>
      </div>
    );
  }
  const waiting = (what: string) => (
    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-fg-3">
      <Spinner className="h-3 w-3" /> Waiting for {what}. The code refreshes automatically.
    </p>
  );
  return (
    <div className="rounded-xl border border-border p-4 text-center">
      {mode === 'phone' ? (
        pairingCode ? (
          <>
            <p className="font-mono text-3xl font-semibold tracking-[0.2em]" aria-label="Pairing code">
              {pairingCode.slice(0, 4)}-{pairingCode.slice(4)}
            </p>
            <p className="mt-3 text-sm font-medium">Enter this code in WhatsApp</p>
            <p className="text-xs text-fg-3">On the phone: WhatsApp → Settings → Linked devices → Link a device → Link with phone number instead</p>
            {waiting('the code to be entered')}
          </>
        ) : (
          <form
            className="mx-auto flex max-w-sm flex-col gap-2 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              void start(phone);
            }}
          >
            <Field label="WhatsApp number, with country code">
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
          <p className="text-xs text-fg-3">On the phone: WhatsApp → Settings → Linked devices → Link a device</p>
          {waiting('scan')}
        </>
      ) : (
        <>
          <p className="text-sm text-fg-2">Generate a QR code and scan it with the WhatsApp account you want to connect.</p>
          <Button className="mt-3" onClick={() => start()} loading={busy}>
            Show QR code
          </Button>
        </>
      )}
      <div className="mt-3">
        <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setMode(mode === 'qr' ? 'phone' : 'qr')}>
          {mode === 'qr' ? 'No second screen? Link with a phone number instead' : 'Scan a QR code instead'}
        </button>
      </div>
    </div>
  );
}

function AddInboxDialog({ open, onOpenChange, providers, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; providers?: Providers; onCreated: (inbox: InboxFull) => void }) {
  const { teams } = useApp();
  const qc = useQueryClient();
  const [type, setType] = useState<ChannelType | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [emailMode, setEmailMode] = useState<'oauth' | 'password'>('oauth');
  const [loading, setLoading] = useState(false);
  const { data: numbers, error: numbersError } = useQuery({ queryKey: ['plivo-numbers'], queryFn: () => api.get<{ numbers: { number: string; alias: string | null; voice: boolean }[] }>('/voice/numbers'), enabled: open && type === 'VOICE' && Boolean(providers?.voice.configured), retry: false });
  useEffect(() => {
    if (open) {
      setType(null);
      setF({});
      setEmailMode('oauth');
    }
  }, [open]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const available: { type: ChannelType; enabled: boolean }[] = providers
    ? [
        { type: 'WHATSAPP', enabled: providers.whatsapp.enabled },
        { type: 'EMAIL', enabled: providers.email.enabled },
        { type: 'VOICE', enabled: providers.voice.enabled },
        { type: 'WEBSITE', enabled: providers.website.enabled },
        { type: 'TELEGRAM', enabled: providers.telegram.enabled },
        { type: 'FACEBOOK', enabled: providers.facebook.enabled },
        { type: 'INSTAGRAM', enabled: providers.instagram.enabled },
      ]
    : [];

  const create = async () => {
    if (!type) return;
    setLoading(true);
    try {
      const res = await api.post<{ inbox: InboxFull }>('/inboxes', { ...f, name: f.name?.trim() || CHANNEL_LABEL[type], channelType: type, teamId: f.teamId || null });
      qc.invalidateQueries({ queryKey: ['inboxes'] });
      qc.invalidateQueries({ queryKey: ['bootstrap'] });
      toast.success(`${res.inbox.name} added`);
      onOpenChange(false);
      onCreated(res.inbox);
    } catch (err: any) {
      qc.invalidateQueries({ queryKey: ['inboxes'] });
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };
  const oauth = (provider: 'google' | 'microsoft') => {
    const p = new URLSearchParams();
    if (f.name) p.set('name', f.name);
    if (f.teamId) p.set('teamId', f.teamId);
    window.location.href = `/api/oauth/${provider}/start?${p}`;
  };

  const common = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Inbox name" hint="Shown to your team, e.g. “Agency WhatsApp”.">
        <Input value={f.name ?? ''} onChange={set('name')} placeholder={type ? CHANNEL_LABEL[type] : ''} autoFocus />
      </Field>
      <Field label="Team" hint="Their members see and get routed these conversations.">
        <Select value={f.teamId ?? ''} onChange={set('teamId')}>
          <option value="">Everyone with access</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
  const missing = (text: string) => <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[13px] text-warning">{text}</p>;

  let body: React.ReactNode = null;
  let canCreate = true;
  let showCreate = true;
  if (type === 'WHATSAPP') {
    canCreate = Boolean(providers?.whatsapp.configured && providers.whatsapp.reachable);
    body = (
      <>
        {!providers?.whatsapp.reachable && missing('The WhatsApp service (Evolution API) is not reachable yet. It can take a minute after startup. Check `docker compose ps`.')}
        {common}
        <p className="text-xs text-fg-3">After you create the inbox you’ll get a QR code to scan with the phone that owns the number.</p>
      </>
    );
  } else if (type === 'EMAIL') {
    const g = providers?.email.google;
    const m = providers?.email.microsoft;
    showCreate = emailMode === 'password';
    canCreate = Boolean(f.email && f.password && f.imapHost && f.smtpHost);
    body = (
      <>
        {common}
        {emailMode === 'oauth' ? (
          <div className="space-y-3">
            {g?.enabled && (
              <div className="rounded-xl border border-border p-3">
                <Button variant="outline" className="w-full" disabled={!g.configured} onClick={() => oauth('google')}>
                  Continue with Google (Gmail / Workspace)
                </Button>
                {!g.configured && (
                  <div className="mt-2 space-y-2 text-xs text-fg-3">
                    <p>Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env, with this redirect URI on the OAuth client:</p>
                    <CopyField value={g.redirectUri} />
                  </div>
                )}
              </div>
            )}
            {m?.enabled && (
              <div className="rounded-xl border border-border p-3">
                <Button variant="outline" className="w-full" disabled={!m.configured} onClick={() => oauth('microsoft')}>
                  Continue with Microsoft 365 / Outlook
                </Button>
                {!m.configured && (
                  <div className="mt-2 space-y-2 text-xs text-fg-3">
                    <p>Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to .env, with this redirect URI on the app registration:</p>
                    <CopyField value={m.redirectUri} />
                  </div>
                )}
              </div>
            )}
            {providers?.email.imapPassword.enabled && (
              <button className="text-xs font-medium text-primary hover:underline" onClick={() => setEmailMode('password')}>
                Use another provider with IMAP/SMTP and a password instead
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email address">
              <Input type="email" value={f.email ?? ''} onChange={set('email')} />
            </Field>
            <Field label="Password / app password">
              <Input type="password" value={f.password ?? ''} onChange={set('password')} autoComplete="new-password" />
            </Field>
            <Field label="IMAP host">
              <Input value={f.imapHost ?? ''} onChange={set('imapHost')} placeholder="imap.zoho.com" />
            </Field>
            <Field label="IMAP port">
              <Input value={f.imapPort ?? '993'} onChange={set('imapPort')} inputMode="numeric" />
            </Field>
            <Field label="SMTP host">
              <Input value={f.smtpHost ?? ''} onChange={set('smtpHost')} placeholder="smtp.zoho.com" />
            </Field>
            <Field label="SMTP port" hint="465 (SSL) or 587 (STARTTLS)">
              <Input value={f.smtpPort ?? '587'} onChange={set('smtpPort')} inputMode="numeric" />
            </Field>
            <button className="text-left text-xs font-medium text-primary hover:underline sm:col-span-2" onClick={() => setEmailMode('oauth')}>
              Back to Google / Microsoft sign-in
            </button>
          </div>
        )}
      </>
    );
  } else if (type === 'VOICE') {
    canCreate = Boolean(providers?.voice.configured && f.phoneNumber);
    body = (
      <>
        {!providers?.voice.configured && missing('Add PLIVO_AUTH_ID and PLIVO_AUTH_TOKEN to .env and restart to enable calling.')}
        {providers?.voice.configured && !/^https:\/\//.test(providers.publicUrl) && missing(`Plivo must reach AscenTalk from the internet. Set PUBLIC_URL to a public HTTPS address (currently ${providers.publicUrl}), or enable the tunnel.`)}
        {common}
        <Field label="Plivo number" error={numbersError ? (numbersError as Error).message : undefined} hint="Numbers you’ve rented in the Plivo console.">
          <Select value={f.phoneNumber ?? ''} onChange={set('phoneNumber')} disabled={!numbers}>
            <option value="">{numbers ? (numbers.numbers.length ? 'Choose a number…' : 'No numbers in this Plivo account') : 'Loading numbers…'}</option>
            {numbers?.numbers.filter((n) => n.voice).map((n) => (
              <option key={n.number} value={n.number}>
                {n.number} {n.alias ? `(${n.alias})` : ''}
              </option>
            ))}
          </Select>
        </Field>
      </>
    );
  } else if (type === 'WEBSITE') {
    body = (
      <>
        {common}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Website URL">
            <Input value={f.websiteUrl ?? ''} onChange={set('websiteUrl')} placeholder="https://youragency.com" />
          </Field>
          <Field label="Brand color">
            <Input type="color" value={f.widgetColor ?? '#ad5700'} onChange={set('widgetColor')} className="h-9 p-1" />
          </Field>
        </div>
        <Field label="Automatic greeting (optional)">
          <Textarea rows={2} value={f.greeting ?? ''} onChange={set('greeting')} placeholder="Thanks for reaching out! We usually reply in a few minutes." />
        </Field>
      </>
    );
  } else if (type === 'TELEGRAM') {
    canCreate = Boolean(f.botToken);
    body = (
      <>
        {common}
        <Field label="Bot token" hint="Create a bot with @BotFather in Telegram and paste its token here.">
          <Input value={f.botToken ?? ''} onChange={set('botToken')} placeholder="123456:ABC-DEF…" />
        </Field>
        {!/^https:\/\//.test(providers?.telegram.publicUrl ?? '') && <p className="text-xs text-fg-3">No public HTTPS URL is set, so AscenTalk will poll Telegram for new messages. That works fine on a local machine.</p>}
      </>
    );
  } else if (type === 'FACEBOOK' || type === 'INSTAGRAM') {
    canCreate = Boolean(f.pageId && f.pageAccessToken);
    body = (
      <>
        {!providers?.facebook.appSecretConfigured && missing('META_APP_SECRET is empty, so incoming webhooks are not signature-checked. Add it to .env for production.')}
        {common}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Facebook Page ID">
            <Input value={f.pageId ?? ''} onChange={set('pageId')} />
          </Field>
          {type === 'INSTAGRAM' && (
            <Field label="Instagram account ID (optional)" hint="Detected from the Page when left empty.">
              <Input value={f.instagramId ?? ''} onChange={set('instagramId')} />
            </Field>
          )}
        </div>
        <Field label="Page access token" hint="A long-lived Page token with pages_messaging (and instagram_manage_messages for Instagram).">
          <Textarea rows={2} value={f.pageAccessToken ?? ''} onChange={set('pageAccessToken')} />
        </Field>
        <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-xs text-fg-2">In your Meta app’s Webhooks settings, use:</p>
          <CopyField label="Callback URL" value={providers?.facebook.webhook ?? ''} />
          <CopyField label="Verify token" value={providers?.facebook.verifyToken ?? ''} />
        </div>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={type ? `Add ${CHANNEL_LABEL[type]} inbox` : 'Add an inbox'}
      description={type ? CHANNEL_HELP[type] : 'Choose the channel your clients use to reach you.'}
      size="lg"
      footer={
        type && (
          <>
            <Button variant="ghost" onClick={() => setType(null)}>
              Back
            </Button>
            {showCreate && (
              <Button onClick={create} loading={loading} disabled={!canCreate}>
                Create inbox
              </Button>
            )}
          </>
        )
      }
    >
      {!type ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {!providers && <PageLoader />}
          {available.map((a) => (
            <button
              key={a.type}
              disabled={!a.enabled}
              onClick={() => setType(a.type)}
              className="flex items-start gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChannelIcon type={a.type} withBg className="h-5 w-5" />
              <span>
                <span className="block text-sm font-semibold">{CHANNEL_LABEL[a.type]}</span>
                <span className="block text-xs text-fg-3">{a.enabled ? CHANNEL_HELP[a.type] : 'Turned off in config/features.json'}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">{body}</div>
      )}
    </Dialog>
  );
}

function EditInboxDialog({ inbox, onClose }: { inbox: InboxFull | null; onClose: () => void }) {
  const { teams, users } = useApp();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', teamId: '', greeting: '', signature: '', enabled: true, widgetColor: '#ad5700', welcomeTitle: '', welcomeTagline: '' });
  const [members, setMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!inbox) return;
    setF({
      name: inbox.name,
      teamId: inbox.teamId ?? '',
      greeting: inbox.greeting ?? '',
      signature: inbox.signature ?? '',
      enabled: inbox.enabled,
      widgetColor: inbox.config.widgetColor ?? '#ad5700',
      welcomeTitle: inbox.config.welcomeTitle ?? '',
      welcomeTagline: inbox.config.welcomeTagline ?? '',
    });
    setMembers(inbox.memberIds);
  }, [inbox]);
  if (!inbox) return null;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['inboxes'] });
    qc.invalidateQueries({ queryKey: ['bootstrap'] });
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/inboxes/${inbox.id}`, {
        name: f.name,
        teamId: f.teamId || null,
        greeting: f.greeting || null,
        signature: f.signature || null,
        enabled: f.enabled,
        memberIds: members,
        ...(inbox.channelType === 'WEBSITE' ? { config: { widgetColor: f.widgetColor, welcomeTitle: f.welcomeTitle, welcomeTagline: f.welcomeTagline } } : {}),
      });
      refresh();
      toast.success('Inbox saved');
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!confirm(`Delete “${inbox.name}” and its ${inbox.counts?.conversations ?? 0} conversations? This cannot be undone.`)) return;
    await api.del(`/inboxes/${inbox.id}`).catch((e) => toast.error(e.message));
    refresh();
    onClose();
  };
  const reconnect = async () => {
    try {
      await api.post(`/inboxes/${inbox.id}/reconnect`);
      refresh();
      toast.success('Reconnected');
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  const oauthProvider = inbox.config.provider === 'google' || inbox.config.provider === 'microsoft' ? inbox.config.provider : null;
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={
        <span className="flex items-center gap-2">
          <ChannelIcon type={inbox.channelType} withBg /> {inbox.name}
        </span>
      }
      description={`${CHANNEL_LABEL[inbox.channelType]} · ${inbox.counts?.conversations ?? 0} conversations`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-danger" onClick={remove}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {inbox.channelType === 'WHATSAPP' && <WhatsAppConnect inbox={inbox} />}
        {inbox.channelType !== 'WHATSAPP' && inbox.status !== 'connected' && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 p-3">
            <p className="min-w-0 flex-1 text-[13px] text-danger">{inbox.statusDetail ?? 'This inbox is not connected.'}</p>
            {oauthProvider ? (
              <Button size="sm" variant="outline" onClick={() => (window.location.href = `/api/oauth/${oauthProvider}/start?inboxId=${inbox.id}`)}>
                Sign in again
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={reconnect}>
                <RefreshCw className="h-4 w-4" /> Retry
              </Button>
            )}
          </div>
        )}
        {inbox.channelType === 'WEBSITE' && inbox.widgetSnippet && (
          <div className="space-y-3">
            <CopyField label="Paste this before </body> on the website" value={inbox.widgetSnippet} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Brand color">
                <Input type="color" value={f.widgetColor} onChange={(e) => setF((s) => ({ ...s, widgetColor: e.target.value }))} className="h-9 p-1" />
              </Field>
              <Field label="Welcome title">
                <Input value={f.welcomeTitle} onChange={(e) => setF((s) => ({ ...s, welcomeTitle: e.target.value }))} />
              </Field>
              <Field label="Welcome tagline">
                <Input value={f.welcomeTagline} onChange={(e) => setF((s) => ({ ...s, welcomeTagline: e.target.value }))} />
              </Field>
            </div>
            <a href={`/widget/demo?token=${inbox.token}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline">
              Open a test page with the widget
            </a>
          </div>
        )}
        {inbox.metaWebhook && (
          <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
            <p className="text-xs text-fg-2">Meta webhook settings (subscribe to “messages”):</p>
            <CopyField label="Callback URL" value={inbox.metaWebhook.callbackUrl} />
            <CopyField label="Verify token" value={inbox.metaWebhook.verifyToken} />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Inbox name">
            <Input value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} />
          </Field>
          <Field label="Team">
            <Select value={f.teamId} onChange={(e) => setF((s) => ({ ...s, teamId: e.target.value }))}>
              <option value="">Everyone with access</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {(inbox.channelType === 'WEBSITE' || inbox.channelType === 'EMAIL') && (
          <Field label={inbox.channelType === 'EMAIL' ? 'Email signature' : 'Automatic greeting'}>
            <Textarea
              rows={3}
              value={inbox.channelType === 'EMAIL' ? f.signature : f.greeting}
              onChange={(e) => setF((s) => ({ ...s, [inbox.channelType === 'EMAIL' ? 'signature' : 'greeting']: e.target.value }))}
            />
          </Field>
        )}
        <Field label="People on this inbox" hint="They see its conversations and are in the round-robin for new ones. Leave empty to use the team.">
          <UserChecklist users={users.filter((u) => u.role !== 'GUEST')} value={members} onChange={setMembers} />
        </Field>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-[13px] font-medium">Inbox enabled</p>
            <p className="text-xs text-fg-3">When off, new messages are ignored and replies are blocked.</p>
          </div>
          <Switch checked={f.enabled} onChange={(v) => setF((s) => ({ ...s, enabled: v }))} label="Inbox enabled" />
        </div>
      </div>
    </Dialog>
  );
}

function InboxesInner() {
  const { isAdmin } = useApp();
  const qc = useQueryClient();
  const search = useSearchParams();
  const router = useRouter();
  const [add, setAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['inboxes'], queryFn: () => api.get<{ inboxes: InboxFull[] }>('/inboxes'), enabled: isAdmin });
  const { data: providers } = useQuery({ queryKey: ['inbox-providers'], queryFn: () => api.get<Providers>('/inboxes/providers'), enabled: isAdmin });

  // Returning from Google / Microsoft sign-in
  useEffect(() => {
    const err = search.get('error');
    const connected = search.get('connected');
    if (err) toast.error(err);
    if (connected) {
      toast.success('Mailbox connected');
      qc.invalidateQueries({ queryKey: ['inboxes'] });
      qc.invalidateQueries({ queryKey: ['bootstrap'] });
    }
    if (err || connected) router.replace('/settings/inboxes');
  }, [search, router, qc]);

  if (!isAdmin) return <Empty title="Only admins can manage inboxes" />;
  const editing = data?.inboxes.find((i) => i.id === editId) ?? null;
  return (
    <div>
      <PageHeader
        title="Inboxes & channels"
        subtitle="Connect the places your clients talk to you. Each connected number, mailbox or page is an inbox."
        actions={
          <Button onClick={() => setAdd(true)}>
            <Plus className="h-4 w-4" /> Add inbox
          </Button>
        }
      />
      <div className="space-y-3 p-4 md:p-6">
        {isLoading && <PageLoader />}
        {data && !data.inboxes.length && (
          <Empty title="No inboxes yet" action={<Button onClick={() => setAdd(true)}>Add your first inbox</Button>}>
            Start with WhatsApp or a shared mailbox.
          </Empty>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {data?.inboxes.map((i) => {
            const st = STATUS[i.status] ?? STATUS.pending;
            return (
              <Card key={i.id} className={cn(!i.enabled && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <ChannelIcon type={i.channelType} withBg className="h-5 w-5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{i.name}</p>
                    <p className="truncate text-xs text-fg-3">
                      {CHANNEL_LABEL[i.channelType]}
                      {i.config.phoneNumber ? ` · ${i.config.phoneNumber}` : ''}
                      {i.config.email ? ` · ${i.config.email}` : ''}
                      {i.config.botUsername ? ` · @${i.config.botUsername}` : ''}
                      {i.config.pageName ? ` · ${i.config.pageName}` : ''}
                      {i.config.websiteUrl ? ` · ${String(i.config.websiteUrl).replace(/^https?:\/\//, '')}` : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge color={st.color}>{st.label}</Badge>
                      {!i.enabled && <Badge>disabled</Badge>}
                      {!i.flagEnabled && <Badge color="#dc2626">off in features.json</Badge>}
                      {i.team && <Badge color={i.team.color}>{i.team.name}</Badge>}
                      <span className="text-[11px] text-fg-3">{i.counts?.conversations ?? 0} conversations</span>
                    </div>
                    {i.statusDetail && i.status !== 'connected' && <p className="mt-1.5 line-clamp-2 text-xs text-fg-3">{i.statusDetail}</p>}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEditId(i.id)}>
                    {i.channelType === 'WHATSAPP' && i.status !== 'connected' ? 'Connect' : 'Manage'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
      <AddInboxDialog open={add} onOpenChange={setAdd} providers={providers} onCreated={(inbox) => setEditId(inbox.id)} />
      <EditInboxDialog inbox={editing} onClose={() => setEditId(null)} />
    </div>
  );
}

export default function InboxesPage() {
  return (
    <Suspense>
      <InboxesInner />
    </Suspense>
  );
}
