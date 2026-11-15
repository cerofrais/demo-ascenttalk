'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Delete, Mic, MicOff, Phone, PhoneIncoming, PhoneOff, Smartphone, X, Grip } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, duration } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { useSocketEvent } from '@/hooks/use-realtime';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Dialog } from '@/components/ui/dialog';

interface VoiceConfig {
  enabled: boolean;
  configured: boolean;
  callMode: 'SOFTPHONE' | 'MOBILE';
  phone: string | null;
  softphone: boolean;
  mobileBridge: boolean;
  endpoint: { username: string; password: string } | null;
  lines: { id: string; name: string; phoneNumber: string | null; status: string }[];
  error: string | null;
}

type CallState = 'connecting' | 'ringing' | 'in-progress' | 'incoming' | 'bridging';

interface ActiveCall {
  callId?: string;
  number: string;
  name?: string | null;
  direction: 'in' | 'out';
  state: CallState;
  startedAt?: number;
  muted: boolean;
  mode: 'SOFTPHONE' | 'MOBILE';
  conversationId?: string | null;
  clientName?: string | null;
  plivoCallUuid?: string;
}

interface DialOptions {
  name?: string | null;
  contactId?: string | null;
  conversationId?: string | null;
  inboxId?: string | null;
}

interface DialerCtx {
  available: boolean;
  status: 'off' | 'connecting' | 'ready' | 'error' | 'mobile';
  call: (to: string, opts?: DialOptions) => Promise<void>;
  openKeypad: () => void;
  active: ActiveCall | null;
}

const Ctx = createContext<DialerCtx>({ available: false, status: 'off', call: async () => undefined, openKeypad: () => undefined, active: null });
export const useDialer = () => useContext(Ctx);

export function DialerProvider({ children }: { children: ReactNode }) {
  const { features } = useApp();
  const enabled = features.voice.enabled;
  const { data: cfg } = useQuery({ queryKey: ['voice-config'], queryFn: () => api.get<VoiceConfig>('/voice/config'), enabled, staleTime: 5 * 60_000 });
  const plivoRef = useRef<any>(null);
  const [status, setStatus] = useState<DialerCtx['status']>('off');
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [keypad, setKeypad] = useState(false);
  const activeRef = useRef<ActiveCall | null>(null);
  activeRef.current = active;

  // Register the browser softphone with Plivo.
  useEffect(() => {
    if (!cfg?.enabled || !cfg.configured || !cfg.lines.length) return setStatus('off');
    if (cfg.callMode === 'MOBILE') return setStatus('mobile');
    if (!cfg.endpoint) return setStatus(cfg.error ? 'error' : 'off');
    let cancelled = false;
    setStatus('connecting');
    import('plivo-browser-sdk').then(({ default: Plivo }) => {
      if (cancelled) return;
      const sdk: any = new (Plivo as any)({ debug: 'ERROR', permOnClick: true, enableTracking: false, closeProtection: true, allowMultipleIncomingCalls: false });
      plivoRef.current = sdk;
      const c = sdk.client;
      c.on('onLogin', () => setStatus('ready'));
      c.on('onLoginFailed', (cause: string) => {
        setStatus('error');
        console.warn('Plivo login failed', cause);
      });
      c.on('onLogout', () => setStatus('off'));
      c.on('onCallRemoteRinging', () => setActive((a) => (a ? { ...a, state: 'ringing' } : a)));
      c.on('onCallAnswered', (info: any) => setActive((a) => (a ? { ...a, state: 'in-progress', startedAt: Date.now(), plivoCallUuid: info?.callUUID } : a)));
      const end = () => setActive(null);
      c.on('onCallTerminated', end);
      c.on('onCallFailed', (cause: string) => {
        if (activeRef.current) toast.error(`Call failed: ${cause}`);
        end();
      });
      c.on('onIncomingCallCanceled', end);
      c.on('onIncomingCallIgnored', end);
      c.on('onIncomingCall', (callerName: string, _headers: any, callInfo: any) => {
        const num = String(callerName ?? '').replace(/^sip:/, '').split('@')[0];
        setActive((a) => ({
          ...(a ?? {}),
          number: num,
          name: a?.name ?? null,
          direction: 'in',
          state: 'incoming',
          muted: false,
          mode: 'SOFTPHONE',
          plivoCallUuid: callInfo?.callUUID,
          callId: a?.callId,
          conversationId: a?.conversationId,
          clientName: a?.clientName,
        }));
      });
      c.login(cfg.endpoint!.username, cfg.endpoint!.password);
    }).catch((err) => {
      console.warn('softphone unavailable', err);
      setStatus('error');
    });
    return () => {
      cancelled = true;
      try {
        plivoRef.current?.client?.logout();
      } catch {
        /* ignore */
      }
      plivoRef.current = null;
    };
  }, [cfg]);

  // Server-side context for incoming calls (client name, conversation).
  useSocketEvent<any>('call.incoming', (p) => {
    setActive((a) => ({
      ...(a ?? { direction: 'in', state: 'incoming', muted: false, mode: cfg?.callMode ?? 'SOFTPHONE' }),
      number: p.from,
      name: p.contact?.name,
      callId: p.callId,
      conversationId: p.conversationId,
      clientName: p.client?.name,
    } as ActiveCall));
    if (cfg?.callMode === 'MOBILE') toast.info(`Incoming call from ${p.contact?.name ?? p.from}. Ringing your mobile.`);
  });
  useSocketEvent<any>('call.answered_elsewhere', (p) => {
    const cur = activeRef.current;
    if (cur && cur.callId === p.callId && cur.state === 'incoming') setActive(null);
  });
  useSocketEvent<any>('call.updated', (call) => {
    const a = activeRef.current;
    if (!a || a.callId !== call.id || a.mode !== 'MOBILE') return;
    if (call.endedAt) setActive(null);
    else if (call.status === 'IN_PROGRESS') setActive({ ...a, state: 'in-progress', startedAt: a.startedAt ?? Date.now() });
  });

  const call = useCallback(
    async (to: string, opts: DialOptions = {}) => {
      if (!cfg?.configured) return void toast.error('Calling is not configured. Ask an admin to add Plivo credentials.');
      if (!cfg.lines.length) return void toast.error('No phone line yet. Add a Plivo number under Settings → Inboxes.');
      if (activeRef.current) return void toast.error('You are already on a call');
      try {
        const res = await api.post<{ callId: string; mode: 'SOFTPHONE' | 'MOBILE'; to: string; conversationId: string }>('/voice/calls', {
          to,
          contactId: opts.contactId,
          conversationId: opts.conversationId,
          inboxId: opts.inboxId,
        });
        const base: ActiveCall = { callId: res.callId, number: res.to, name: opts.name, direction: 'out', muted: false, mode: res.mode, conversationId: res.conversationId, state: 'connecting' };
        if (res.mode === 'MOBILE') {
          setActive({ ...base, state: 'bridging' });
          toast.success('Calling your mobile. Pick up to be connected.');
          return;
        }
        if (status !== 'ready' || !plivoRef.current) throw new Error('Softphone is not connected yet');
        setActive(base);
        plivoRef.current.client.call(res.to.replace(/^\+/, ''), { 'X-PH-Callid': res.callId });
      } catch (err: any) {
        setActive(null);
        toast.error(err.message ?? 'Could not start the call');
      }
    },
    [cfg, status],
  );

  const answer = () => {
    const a = activeRef.current;
    if (!a || !plivoRef.current) return;
    plivoRef.current.client.answer(a.plivoCallUuid, 'reject');
    setActive({ ...a, state: 'in-progress', startedAt: Date.now() });
  };
  const reject = () => {
    const a = activeRef.current;
    if (a?.plivoCallUuid) plivoRef.current?.client.reject(a.plivoCallUuid);
    setActive(null);
  };
  const hangup = async () => {
    const a = activeRef.current;
    try {
      plivoRef.current?.client.hangup();
    } catch {
      /* ignore */
    }
    if (a?.callId) await api.post(`/voice/calls/${a.callId}/hangup`).catch(() => undefined);
    setActive(null);
  };
  const toggleMute = () => {
    const a = activeRef.current;
    if (!a) return;
    if (a.muted) plivoRef.current?.client.unmute();
    else plivoRef.current?.client.mute();
    setActive({ ...a, muted: !a.muted });
  };
  const dtmf = (d: string) => plivoRef.current?.client.sendDtmf(d);

  const available = Boolean(enabled && cfg?.configured && cfg.lines.length);
  return (
    <Ctx.Provider value={{ available, status, call, openKeypad: () => setKeypad(true), active }}>
      {children}
      {active && <CallPanel call={active} onAnswer={answer} onReject={reject} onHangup={hangup} onMute={toggleMute} onDtmf={dtmf} />}
      <KeypadDialog open={keypad} onOpenChange={setKeypad} cfg={cfg} status={status} onCall={(n, inboxId) => call(n, { inboxId })} />
    </Ctx.Provider>
  );
}

function useTicker(start?: number) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!start) return;
    const i = setInterval(() => setT((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [start]);
  return start ? Math.floor((Date.now() - start) / 1000) : 0;
}

function CallPanel({ call, onAnswer, onReject, onHangup, onMute, onDtmf }: { call: ActiveCall; onAnswer: () => void; onReject: () => void; onHangup: () => void; onMute: () => void; onDtmf: (d: string) => void }) {
  const elapsed = useTicker(call.startedAt);
  const [pad, setPad] = useState(false);
  const label =
    call.state === 'incoming' ? 'Incoming call' : call.state === 'ringing' ? 'Ringing…' : call.state === 'bridging' ? 'Calling your mobile…' : call.state === 'connecting' ? 'Connecting…' : duration(elapsed);
  return (
    <div className="fixed right-3 bottom-20 z-[60] w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-border bg-surface shadow-pop md:right-6 md:bottom-6">
      <div className={cn('flex items-center gap-3 px-4 py-3 text-white', call.state === 'incoming' ? 'bg-success' : 'bg-[#202124]')}>
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-full bg-white/15', call.state === 'incoming' && 'ring-pulse')}>
          {call.mode === 'MOBILE' ? <Smartphone className="h-5 w-5" /> : call.direction === 'in' ? <PhoneIncoming className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{call.name || call.number}</p>
          <p className="truncate text-xs opacity-80">
            {call.clientName ? `${call.clientName} · ` : ''}
            {call.name ? `${call.number} · ` : ''}
            {label}
          </p>
        </div>
      </div>
      {pad && call.state === 'in-progress' && (
        <div className="grid grid-cols-3 gap-1 border-b border-border p-2">
          {'123456789*0#'.split('').map((d) => (
            <button key={d} onClick={() => onDtmf(d)} className="rounded-lg py-2 text-lg font-medium hover:bg-surface-2">
              {d}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        {call.conversationId ? (
          <Link href={`/inbox/${call.conversationId}`} className="text-xs font-medium text-primary hover:underline">
            Open conversation
          </Link>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {call.state === 'incoming' ? (
            call.mode === 'MOBILE' ? (
              <Button size="icon" variant="ghost" onClick={onReject} aria-label="Dismiss">
                <X className="h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button size="icon" variant="danger" className="rounded-full" onClick={onReject} aria-label="Decline">
                  <PhoneOff className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="success" className="rounded-full" onClick={onAnswer} aria-label="Answer">
                  <Phone className="h-4 w-4" />
                </Button>
              </>
            )
          ) : (
            <>
              {call.mode === 'SOFTPHONE' && call.state === 'in-progress' && (
                <>
                  <Button size="icon" variant="ghost" onClick={() => setPad((p) => !p)} aria-label="Keypad">
                    <Grip className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant={call.muted ? 'secondary' : 'ghost'} onClick={onMute} aria-label={call.muted ? 'Unmute' : 'Mute'}>
                    {call.muted ? <MicOff className="h-4 w-4 text-danger" /> : <Mic className="h-4 w-4" />}
                  </Button>
                </>
              )}
              <Button size="icon" variant="danger" className="rounded-full" onClick={onHangup} aria-label="Hang up">
                <PhoneOff className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function KeypadDialog({ open, onOpenChange, cfg, status, onCall }: { open: boolean; onOpenChange: (v: boolean) => void; cfg?: VoiceConfig; status: DialerCtx['status']; onCall: (n: string, inboxId?: string) => void }) {
  const [num, setNum] = useState('');
  const [line, setLine] = useState('');
  useEffect(() => {
    if (cfg?.lines[0] && !line) setLine(cfg.lines[0].id);
  }, [cfg, line]);
  const statusText =
    status === 'ready' ? 'Softphone connected' : status === 'connecting' ? 'Connecting softphone…' : status === 'mobile' ? `Calls ring your mobile ${cfg?.phone ?? ''}` : status === 'error' ? 'Softphone could not connect' : 'Calling unavailable';
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Make a call" description={statusText} size="sm">
      {!cfg?.configured ? (
        <p className="text-sm text-fg-2">Calling needs Plivo credentials (PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN in .env) and a phone line under Settings → Inboxes.</p>
      ) : (
        <div className="space-y-3">
          {cfg.lines.length > 1 && (
            <Select value={line} onChange={(e) => setLine(e.target.value)}>
              {cfg.lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} {l.phoneNumber ? `(${l.phoneNumber})` : ''}
                </option>
              ))}
            </Select>
          )}
          <div className="flex gap-2">
            <Input value={num} onChange={(e) => setNum(e.target.value)} placeholder="+91 98xxx xxxxx" className="text-lg tracking-wide" autoFocus />
            <Button variant="ghost" size="icon" onClick={() => setNum((n) => n.slice(0, -1))} aria-label="Delete">
              <Delete className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {'123456789+0#'.split('').map((d) => (
              <button key={d} onClick={() => setNum((n) => n + d)} className="rounded-xl py-3 text-xl font-medium hover:bg-surface-2">
                {d}
              </button>
            ))}
          </div>
          <Button
            className="w-full"
            variant="success"
            disabled={num.replace(/\D/g, '').length < 6}
            onClick={() => {
              onCall(num, line || undefined);
              onOpenChange(false);
              setNum('');
            }}
          >
            <Phone className="h-4 w-4" /> Call
          </Button>
        </div>
      )}
    </Dialog>
  );
}
