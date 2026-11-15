'use client';
/**
 * Demo mode: the whole app runs in the browser against generated data, with no API, database or login.
 * It is switched on at build time with NEXT_PUBLIC_DEMO_MODE=true (see docs/DEMO.md). This file is the
 * small always-loaded part; the mock backend itself (src/demo/server.ts) is only fetched in demo builds.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/** Where "sign in" lives in a demo build: the persona picker. */
export const DEMO_HOME = '/demo';

const PERSONA_KEY = 'ascentalk-demo-persona';

/**
 * The role being played is kept per tab (sessionStorage), so two tabs can be two different people side by
 * side. localStorage only remembers the last choice, to highlight it on the picker.
 */
export function getDemoPersonaId(): string | null {
  try {
    return window.sessionStorage.getItem(PERSONA_KEY);
  } catch {
    return null;
  }
}

export function getLastDemoPersonaId(): string | null {
  try {
    return window.localStorage.getItem(PERSONA_KEY);
  } catch {
    return null;
  }
}

export function setDemoPersonaId(id: string | null) {
  try {
    if (id) {
      window.sessionStorage.setItem(PERSONA_KEY, id);
      window.localStorage.setItem(PERSONA_KEY, id);
    } else window.sessionStorage.removeItem(PERSONA_KEY);
  } catch {
    /* storage unavailable: the picker simply shows again */
  }
}

// ─── Event bus shared by the fake socket and the mock backend ────────────────

type Handler = (payload: any) => void;

function emitter() {
  const map = new Map<string, Set<Handler>>();
  return {
    on(event: string, fn: Handler) {
      if (!map.has(event)) map.set(event, new Set());
      map.get(event)!.add(fn);
    },
    off(event: string, fn: Handler) {
      map.get(event)?.delete(fn);
    },
    emit(event: string, payload?: unknown) {
      // async like a real socket, so a handler never runs inside the request that caused it
      setTimeout(() => map.get(event)?.forEach((fn) => fn(payload)), 0);
    },
  };
}

export const demoBus = {
  /** Mock backend → browser, the same events the API sends over Socket.IO. */
  toClient: emitter(),
  /** Browser → mock backend ("typing", "conversation.view", "channel.join", "presence.set"). */
  toServer: emitter(),
};

/** Stands in for the Socket.IO client: same on/off/emit surface, backed by the in-page bus. */
export function createDemoSocket() {
  const socket = {
    connected: true,
    id: 'demo',
    on(event: string, fn: Handler) {
      if (event === 'connect') setTimeout(() => fn(undefined), 0);
      else demoBus.toClient.on(event, fn);
      return socket;
    },
    off(event: string, fn: Handler) {
      demoBus.toClient.off(event, fn);
      return socket;
    },
    emit(event: string, payload?: unknown) {
      demoBus.toServer.emit(event, payload);
      return socket;
    },
    connect: () => socket,
    disconnect: () => socket,
  };
  return socket;
}

// ─── fetch interceptor ───────────────────────────────────────────────────────

let installed = false;

/** Answers every same-origin /api/* request from the in-browser mock backend. Everything else is untouched. */
export function installDemoFetch() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    let body: unknown = init?.body ?? null;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        /* leave as text */
      }
    }
    const { handleDemoRequest } = await import('@/demo/server');
    const res = await handleDemoRequest({ method, path: url.pathname.slice('/api'.length), query: url.searchParams, body });
    const empty = res.status === 204 || res.body === undefined;
    return new Response(empty ? null : JSON.stringify(res.body), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  };
}
