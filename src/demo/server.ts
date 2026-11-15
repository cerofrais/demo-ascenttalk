/**
 * The in-browser backend of the public demo.
 *
 * A demo build has no API, database or socket server. Every /api/* request the web app makes is handed to
 * handleDemoRequest() (see installDemoFetch in lib/demo.ts), which answers it from a generated data set kept in
 * memory and in localStorage, with the same response shapes, permissions and realtime events as apps/api.
 *
 *   store.ts      the state, loading and saving          data.ts / content.ts / history.ts   the data set
 *   http.ts       the router and error helpers           access.ts                           who may see what
 *   serialize.ts  response shapes                        realtime.ts                         socket rooms and events
 *   core.ts       conversation operations                handlers/*.ts                       the endpoints
 *   simulate.ts   replies, receipts, new visitors        sync.ts                             other tabs and the widget frame
 */
import { getDemoPersonaId } from '@/lib/demo';
import { viewerFor, type Viewer } from './access';
import { forgetBlobUrls } from './files';
import { HttpError, matchRoute } from './http';
import { startRealtime } from './realtime';
import { startLife } from './simulate';
import { clearState, db, scaled, type DUser } from './store';
import { emitRefresh, startSync } from './sync';

// The endpoints. Within a file, fixed paths are registered before the `/:id` routes they could be mistaken for.
import './handlers/misc';
import './handlers/people';
import './handlers/conversations';
import './handlers/clients';
import './handlers/chat';
import './handlers/inboxes';
import './handlers/oversight';
import './handlers/reports';
import './handlers/widget';

export interface DemoRequest {
  method: string;
  /** Without the /api prefix. */
  path: string;
  query: URLSearchParams;
  /** Parsed JSON, a FormData, or null. */
  body: unknown;
}

export interface DemoResponse {
  status: number;
  body?: unknown;
}

const NO_PERSONA = 'Pick a role to explore the demo';

/** Stands in for `req.user` on the few routes that are answered without a persona. */
const NOBODY: DUser = {
  id: '',
  email: '',
  name: '',
  role: 'GUEST',
  title: null,
  department: null,
  skills: [],
  phone: null,
  timezone: 'UTC',
  avatarUrl: null,
  statusText: null,
  lastSeenAt: null,
  active: false,
  callMode: 'SOFTPHONE',
  invited: false,
  notificationPrefs: {},
  presence: 'OFFLINE',
  createdAt: new Date(0).toISOString(),
};
const NOBODY_VIEWER: Viewer = { id: '', email: '', name: '', role: 'GUEST', teamIds: [] };

let booted = false;

function boot(): void {
  if (booted) return;
  booted = true;
  startRealtime();
  startSync();
  startLife();
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isPlainObject(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(typeof FormData !== 'undefined' && v instanceof FormData);
}

export async function handleDemoRequest(req: DemoRequest): Promise<DemoResponse> {
  boot();
  // Do the work first and only then wait. A real server keeps a request it has received even if the page
  // goes away; here the "server" is the page, so a change must be in the state before any delay or a quick
  // reload would lose it. The delay still gives loading states and optimistic updates something to show.
  const response = await respond(req);
  await sleep(scaled(80 + Math.random() * 120));
  return response;
}

async function respond(req: DemoRequest): Promise<DemoResponse> {
  try {
    const method = (req.method || 'GET').toUpperCase();
    const path = `/${req.path.replace(/^\/+|\/+$/g, '')}`;
    const s = db();
    // read on every request: the persona can change without a reload, and differs per tab
    const personaId = getDemoPersonaId();
    const user = personaId ? s.users.find((u) => u.id === personaId && u.active) : undefined;

    const match = matchRoute(method, path);
    if (!user && !match?.route.open) return { status: 401, body: { error: NO_PERSONA } };
    if (!match) return { status: 404, body: { error: 'Not found' } };

    const me = user ? viewerFor(user, s) : NOBODY_VIEWER;
    if (match.route.roles && !match.route.roles.includes(me.role)) return { status: 403, body: { error: 'You do not have permission to do this' } };

    const form = typeof FormData !== 'undefined' && req.body instanceof FormData ? req.body : null;
    const result = await match.route.handler({ me, user: user ?? NOBODY, params: match.params, query: req.query ?? new URLSearchParams(), body: isPlainObject(req.body) ? req.body : {}, form });
    return { status: 200, body: result === undefined ? { ok: true } : result };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: err.details === undefined ? { error: err.message } : { error: err.message, details: err.details } };
    console.error('[demo] request failed', req.method, req.path, err);
    return { status: 500, body: { error: 'Something went wrong' } };
  }
}

/** Wipes everything the visitor did; the next request starts again from the generated data set. */
export function resetDemoData(): void {
  clearState();
  forgetBlobUrls();
  // anything still on screen in this tab fetches the fresh data
  emitRefresh();
}
