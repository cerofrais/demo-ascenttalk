'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import { DEMO_MODE, createDemoSocket } from '@/lib/demo';
import { Paperclip, SendHorizontal, X } from 'lucide-react';

interface WidgetConfig {
  name: string;
  agency: string;
  color: string;
  welcomeTitle: string;
  welcomeTagline: string;
  requireEmail: boolean;
  online: boolean;
  agents: { name: string; avatarUrl: string | null }[];
}
interface WMessage {
  id: string;
  direction: 'INCOMING' | 'OUTGOING';
  content: string | null;
  senderName: string | null;
  attachments: { id: string; fileName: string; url: string; kind: string }[];
  createdAt: string;
}

function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function Frame() {
  const token = useSearchParams().get('token') ?? '';
  const storageKey = `ascentalk-visitor-${token}`;
  const [cfg, setCfg] = useState<WidgetConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visitor, setVisitor] = useState<string | null>(null);
  const [messages, setMessages] = useState<WMessage[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const socket = useRef<Socket | null>(null);
  const openRef = useRef(false);
  const unread = useRef(0);

  const base = `/api/widget/${token}`;
  const call = useCallback(
    async (path: string, init?: RequestInit, vt?: string | null) => {
      const res = await fetch(`${base}${path}`, { ...init, headers: { ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(vt ? { 'x-visitor-token': vt } : {}) } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error ?? 'Request failed'), { status: res.status });
      return data;
    },
    [base],
  );

  useEffect(() => {
    if (!token) return setError('Missing widget token');
    call('/config')
      .then((c: WidgetConfig) => {
        setCfg(c);
        window.parent?.postMessage({ type: 'ascentalk:color', color: c.color }, '*');
      })
      .catch(() => setError('This chat is not available right now.'));
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setVisitor(saved);
    } catch {
      /* storage blocked: session lasts for this page view */
    }
  }, [token, call, storageKey]);

  // Load history + connect realtime once we have a visitor session.
  useEffect(() => {
    if (!visitor) return;
    let cancelled = false;
    call('/messages', undefined, visitor)
      .then((d: { messages: WMessage[] }) => !cancelled && setMessages(d.messages))
      .catch((e: any) => {
        if (e.status === 401) {
          try {
            localStorage.removeItem(storageKey);
          } catch {
            /* ignore */
          }
          setVisitor(null);
        }
      });
    // demo builds have no socket server: the in-browser mock backend delivers the same events
    const s: Socket = DEMO_MODE
      ? (createDemoSocket() as unknown as Socket)
      : io(window.location.origin, { path: '/socket.io', auth: { visitorToken: visitor }, transports: ['websocket', 'polling'] });
    socket.current = s;
    s.on('widget.message', (m: WMessage) => {
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
      setTyping(null);
      if (m.direction === 'OUTGOING' && !openRef.current) {
        unread.current += 1;
        window.parent?.postMessage({ type: 'ascentalk:unread', count: unread.current }, '*');
      }
    });
    s.on('widget.typing', (p: { name: string }) => {
      setTyping(p.name);
      setTimeout(() => setTyping(null), 3500);
    });
    return () => {
      cancelled = true;
      s.disconnect();
    };
  }, [visitor, call, storageKey]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'ascentalk:open') {
        openRef.current = true;
        unread.current = 0;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  useEffect(() => {
    // scrollIntoView returns a Promise in newer browsers; an effect must not return it
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, typing]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await call('/session', { method: 'POST', body: JSON.stringify({ name, email }) });
      try {
        localStorage.setItem(storageKey, d.visitorToken);
      } catch {
        /* ignore */
      }
      setVisitor(d.visitorToken);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const send = async (file?: File) => {
    const content = text.trim();
    if ((!content && !file) || busy) return;
    setBusy(true);
    try {
      let body: BodyInit;
      if (file) {
        const fd = new FormData();
        if (content) fd.append('content', content);
        fd.append('file', file, file.name);
        body = fd;
      } else body = JSON.stringify({ content });
      const d = await call('/messages', { method: 'POST', body }, visitor);
      if (d.message) setMessages((list) => (list.some((x) => x.id === d.message.id) ? list : [...list, d.message]));
      setText('');
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(null), 4000);
    } finally {
      setBusy(false);
    }
  };

  const color = cfg?.color ?? '#45464b';
  if (error && !cfg) return <div className="flex h-dvh items-center justify-center p-6 text-center text-sm text-gray-500">{error}</div>;
  if (!cfg) return <div className="h-dvh bg-white" />;

  return (
    <div className="flex h-dvh flex-col bg-white text-[14px] text-gray-900">
      <header className="px-4 pt-4 pb-5 text-white" style={{ background: color }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-semibold">{cfg.welcomeTitle}</p>
            <p className="text-[13px] opacity-90">{cfg.welcomeTagline}</p>
          </div>
          <button onClick={() => window.parent?.postMessage({ type: 'ascentalk:close' }, '*')} className="rounded-full p-1 hover:bg-white/15" aria-label="Close chat">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs opacity-90">
          <span className={`h-2 w-2 rounded-full ${cfg.online ? 'bg-green-300' : 'bg-white/50'}`} />
          {cfg.online ? `${cfg.agency} is online` : `${cfg.agency} will reply as soon as possible`}
        </p>
      </header>

      {!visitor ? (
        <form onSubmit={start} className="flex flex-1 flex-col gap-3 p-4">
          <p className="text-[13px] text-gray-600">Tell us who you are so we can follow up.</p>
          <label className="block text-[13px] font-medium">
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 outline-none focus:border-gray-500" />
          </label>
          <label className="block text-[13px] font-medium">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required={cfg.requireEmail} className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 outline-none focus:border-gray-500" />
          </label>
          <button type="submit" disabled={busy} className="mt-1 h-10 rounded-lg font-semibold text-white disabled:opacity-60" style={{ background: color }}>
            Start chat
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      ) : (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto bg-gray-50 p-3">
            {!messages.length && <p className="pt-8 text-center text-[13px] text-gray-400">Send us a message to get started.</p>}
            {messages.map((m) => {
              const mine = m.direction === 'INCOMING';
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[82%]">
                    {!mine && m.senderName && <p className="mb-0.5 px-1 text-[11px] text-gray-500">{m.senderName}</p>}
                    <div className={`rounded-2xl px-3 py-2 break-words whitespace-pre-wrap ${mine ? 'rounded-br-md text-white' : 'rounded-bl-md border border-gray-200 bg-white'}`} style={mine ? { background: color } : undefined}>
                      {m.content && linkify(m.content)}
                      {m.attachments.map((a) =>
                        a.kind === 'IMAGE' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={a.id} src={a.url} alt={a.fileName} className="mt-1 max-h-48 rounded-lg" />
                        ) : (
                          <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="mt-1 block underline">
                            📎 {a.fileName}
                          </a>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {typing && <p className="px-1 text-xs text-gray-400 italic">{typing} is typing…</p>}
            <div ref={end} />
          </div>
          {error && <p className="bg-red-50 px-3 py-1 text-xs text-red-600">{error}</p>}
          <div className="flex items-end gap-2 border-t border-gray-200 p-2">
            <input ref={fileInput} type="file" hidden onChange={(e) => e.target.files?.[0] && send(e.target.files[0]).then(() => (e.target.value = ''))} />
            <button onClick={() => fileInput.current?.click()} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Attach a file">
              <Paperclip className="h-5 w-5" />
            </button>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                socket.current?.emit('widget.typing');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="Type a message…"
              className="max-h-28 min-h-10 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-gray-500"
            />
            <button onClick={() => send()} disabled={busy || !text.trim()} className="rounded-lg p-2.5 text-white disabled:opacity-50" style={{ background: color }} aria-label="Send">
              <SendHorizontal className="h-5 w-5" />
            </button>
          </div>
        </>
      )}
      <p className="pb-1.5 text-center text-[10px] text-gray-400">Powered by AscenTalk</p>
    </div>
  );
}

export default function WidgetFramePage() {
  return (
    <Suspense>
      <Frame />
    </Suspense>
  );
}
