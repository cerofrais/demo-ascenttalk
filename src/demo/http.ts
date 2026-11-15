/** A very small router for the mock backend, plus the error helpers the handlers throw. */
import type { Role } from '@/lib/api';
import type { Viewer } from './access';
import type { DUser } from './store';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg);
/** A unique constraint in the database (Prisma P2002) comes back as 409. */
export const conflict = () => new HttpError(409, 'That already exists');
/** The API answers 400 "Invalid input" when a body or query fails validation. */
export const invalid = (what?: string) => new HttpError(400, 'Invalid input', what ? { field: what } : undefined);
/** For everything that would need a real provider, mailbox or password store. */
export const notInDemo = (reason: string) => new HttpError(400, `Not available in the demo: ${reason}`);

export interface Ctx {
  /** The persona making the request. On routes marked `open` this may be a placeholder. */
  me: Viewer;
  user: DUser;
  params: Record<string, string>;
  query: URLSearchParams;
  /** Parsed JSON body (an empty object when there is none or it is a FormData). */
  body: Record<string, any>;
  /** The FormData of an upload, if any. */
  form: FormData | null;
}

export type Handler = (ctx: Ctx) => unknown | Promise<unknown>;

interface RouteOptions {
  /** Answered without a persona (the public config, and the website widget, which is used by visitors). */
  open?: boolean;
  /** requireRole(...): anyone else gets 403. */
  roles?: Role[];
}

interface Route extends RouteOptions {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

const routes: Route[] = [];

/** Registers `GET /conversations/:id/messages` style routes. Earlier registrations win. */
export function route(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, handler: Handler, options: RouteOptions = {}): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    `^${path
      .split('/')
      .map((part) => {
        if (!part.startsWith(':')) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        keys.push(part.slice(1));
        return '([^/]+)';
      })
      .join('/')}/?$`,
  );
  routes.push({ method, pattern, keys, handler, ...options });
}

export function matchRoute(method: string, path: string): { route: Route; params: Record<string, string> } | null {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.pattern.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => {
      try {
        params[k] = decodeURIComponent(m[i + 1]);
      } catch {
        params[k] = m[i + 1];
      }
    });
    return { route: r, params };
  }
  return null;
}

// ─── Reading input the way the API's zod schemas do ──────────────────────────

export const qstr = (q: URLSearchParams, key: string): string | undefined => {
  const v = q.get(key);
  return v === null || v === '' ? undefined : v;
};

export function qenum<T extends string>(q: URLSearchParams, key: string, allowed: readonly T[], fallback: T): T;
export function qenum<T extends string>(q: URLSearchParams, key: string, allowed: readonly T[]): T | undefined;
export function qenum<T extends string>(q: URLSearchParams, key: string, allowed: readonly T[], fallback?: T): T | undefined {
  const v = qstr(q, key);
  if (v === undefined) return fallback;
  if (!allowed.includes(v as T)) throw invalid(key);
  return v as T;
}

export function qnum(q: URLSearchParams, key: string, fallback: number, min: number, max: number): number {
  const v = qstr(q, key);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw invalid(key);
  return n;
}

export const isStr = (v: unknown): v is string => typeof v === 'string';
export const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

/** A required non-empty string. */
export function need(body: Record<string, any>, key: string): string {
  const v = body[key];
  if (!isStr(v) || !v.trim()) throw invalid(key);
  return v;
}

/** `string | null | undefined` fields: returns undefined when the key is absent. */
export function optional(body: Record<string, any>, key: string): string | null | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (!isStr(v)) throw invalid(key);
  return v;
}

export function optionalList(body: Record<string, any>, key: string): string[] | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (!isStrArray(v)) throw invalid(key);
  return v;
}
