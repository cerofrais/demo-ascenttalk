'use client';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getSocket } from '@/lib/socket';
import { DEMO_MODE } from '@/lib/demo';
import { api, type Presence } from '@/lib/api';
import { setPresence, setPresenceBulk } from './use-presence';
import { useApp } from './use-bootstrap';

/** Subscribe to a socket event for the lifetime of the component. */
export function useSocketEvent<T = any>(event: string, handler: (payload: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = getSocket();
    const fn = (p: T) => ref.current(p);
    s.on(event, fn);
    return () => {
      s.off(event, fn);
    };
  }, [event]);
}

export function emitSocket(event: string, payload?: unknown) {
  getSocket().emit(event, payload);
}

let audioCtx: AudioContext | null = null;
export function playPing() {
  try {
    audioCtx ??= new AudioContext();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.08);
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.3);
  } catch {
    /* audio unavailable */
  }
}

/** App-wide realtime wiring: cache invalidation, presence, notifications. */
export function RealtimeBridge() {
  const qc = useQueryClient();
  const { features, me } = useApp();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const debounceInvalidate = (key: string, queryKey: unknown[], ms = 400) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => qc.invalidateQueries({ queryKey }), ms);
  };

  useEffect(() => {
    const s = getSocket();
    const onConnect = () => {
      // refresh everything that may have changed while offline
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['chat-channels'] });
      api.get<{ users: { id: string; presence: Presence }[] }>('/users').then((r) => {
        setPresenceBulk(Object.fromEntries(r.users.map((u) => [u.id, u.presence])));
      }).catch(() => undefined);
    };
    s.on('connect', onConnect);
    if (s.connected) onConnect();
    return () => {
      s.off('connect', onConnect);
    };
  }, [qc]);

  useSocketEvent<{ userId: string; status: Presence }>('presence', (p) => setPresence(p.userId, p.status));
  useSocketEvent('conversation.updated', () => {
    debounceInvalidate('conv', ['conversations']);
    debounceInvalidate('counts', ['conversation-counts']);
  });
  useSocketEvent('inbox.updated', () => {
    debounceInvalidate('bootstrap', ['bootstrap'], 800);
    debounceInvalidate('inboxes', ['inboxes'], 500);
  });
  useSocketEvent('inbox.deleted', () => debounceInvalidate('bootstrap', ['bootstrap'], 300));
  useSocketEvent('user.updated', () => debounceInvalidate('users', ['users'], 600));
  useSocketEvent('features.updated', () => {
    qc.invalidateQueries({ queryKey: ['bootstrap'] });
    toast.info('Feature settings were updated');
  });
  useSocketEvent('chat.activity', () => debounceInvalidate('chat', ['chat-channels'], 300));
  useSocketEvent('chat.read', () => debounceInvalidate('chat', ['chat-channels'], 200));
  useSocketEvent<{ channelId: string }>('chat.channel.joined', (p) => {
    emitSocket('channel.join', p.channelId);
    debounceInvalidate('chat', ['chat-channels'], 200);
  });
  useSocketEvent('chat.channel.left', () => debounceInvalidate('chat', ['chat-channels'], 200));
  useSocketEvent('chat.channel.updated', () => debounceInvalidate('chat', ['chat-channels'], 300));
  useSocketEvent<any>('notification', (n) => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    const here = typeof window !== 'undefined' ? window.location.pathname : '';
    const visibleHere = n.link && here.startsWith(n.link.split('?')[0]) && document.visibilityState === 'visible';
    if (visibleHere) return;
    if (features.sound) playPing();
    toast(n.title, { description: n.body ?? undefined, action: n.link ? { label: 'Open', onClick: () => (window.location.href = n.link) } : undefined });
    if (features.browserNotifications && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      try {
        const notif = new Notification(n.title, { body: n.body ?? '', tag: n.id, icon: '/icons/icon-192.png' });
        notif.onclick = () => {
          window.focus();
          if (n.link) window.location.href = n.link;
        };
      } catch {
        /* ignore */
      }
    }
  });

  useEffect(() => {
    if (!DEMO_MODE && features.browserNotifications && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const t = setTimeout(() => Notification.requestPermission().catch(() => undefined), 4000);
      return () => clearTimeout(t);
    }
  }, [features.browserNotifications, me.id]);

  return null;
}
