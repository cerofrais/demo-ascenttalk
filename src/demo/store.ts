/**
 * Demo backend state: the "database" of the in-browser mock. Everything lives in one plain object that is
 * generated on first load (see data.ts), mutated by the handlers, and saved to localStorage so a reload or a
 * persona switch keeps what the visitor did.
 */
import type { ChannelType, ConversationStatus, Presence, Priority, Role } from '@/lib/api';
import { DATA_VERSION, generateState } from './data';

export const STATE_KEY = 'ascentalk-demo-state-v1';
export const STATE_VERSION = DATA_VERSION;

/** Uploads below this size are kept as data: URLs so they survive a reload. */
export const KEEP_UPLOAD_BYTES = 400 * 1024;
/** Total size of uploaded data we try to keep in localStorage. */
const UPLOAD_BUDGET_BYTES = 2_500_000;

// ─── Records (the shape of the Prisma models, with dates as ISO strings) ─────

export interface DUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  title: string | null;
  department: string | null;
  skills: string[];
  phone: string | null;
  timezone: string;
  avatarUrl: string | null;
  statusText: string | null;
  lastSeenAt: string | null;
  active: boolean;
  callMode: 'SOFTPHONE' | 'MOBILE';
  invited: boolean;
  notificationPrefs: Record<string, unknown>;
  /** What this teammate's status looks like while the visitor is someone else. */
  presence: Presence;
  createdAt: string;
}

export interface DTeam {
  id: string;
  name: string;
  description: string | null;
  color: string;
  leadId: string | null;
  memberIds: string[];
  createdAt: string;
}

export type ClientStatus = 'LEAD' | 'ACTIVE' | 'PAUSED' | 'CHURNED';

export interface DClient {
  id: string;
  name: string;
  logoUrl: string | null;
  industry: string | null;
  website: string | null;
  status: ClientStatus;
  accountManagerId: string | null;
  teamId: string | null;
  tags: string[];
  driveFolderUrl: string | null;
  notes: string | null;
  customAttributes: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DIdentity {
  id: string;
  channelType: ChannelType;
  identifier: string;
  key: string;
  createdAt: string;
}

export interface DContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  clientId: string | null;
  roleAtClient: string | null;
  notes: string | null;
  customAttributes: Record<string, unknown>;
  identities: DIdentity[];
  createdAt: string;
  updatedAt: string;
}

export interface DInbox {
  id: string;
  name: string;
  channelType: ChannelType;
  config: Record<string, any>;
  externalId: string | null;
  token: string;
  status: string;
  statusDetail: string | null;
  teamId: string | null;
  greeting: string | null;
  signature: string | null;
  enabled: boolean;
  memberIds: string[];
  createdAt: string;
}

export interface DConversation {
  id: string;
  displayId: number;
  inboxId: string;
  contactId: string | null;
  clientId: string | null;
  externalThreadId: string | null;
  isGroup: boolean;
  groupName: string | null;
  subject: string | null;
  status: ConversationStatus;
  snoozedUntil: string | null;
  priority: Priority;
  assigneeId: string | null;
  teamId: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastIncomingAt: string | null;
  lastOutgoingAt: string | null;
  waitingSince: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  participantIds: string[];
  meta: Record<string, any>;
  labelIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type MessageStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'RECEIVED';

export interface DMessage {
  id: string;
  conversationId: string;
  direction: 'INCOMING' | 'OUTGOING';
  kind: 'MESSAGE' | 'NOTE' | 'ACTIVITY' | 'CALL';
  senderUserId: string | null;
  senderContactId: string | null;
  senderName: string | null;
  content: string | null;
  contentHtml: string | null;
  externalId: string | null;
  replyToId: string | null;
  status: MessageStatus;
  error: string | null;
  mentions: string[];
  meta: Record<string, any>;
  attachmentIds: string[];
  callId: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface DAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE';
  /** A static file shipped with the demo (public/demo-assets). */
  url?: string;
  /** An upload small enough to keep across reloads. */
  dataUrl?: string;
  uploadedById: string | null;
  messageId: string | null;
  chatMessageId: string | null;
  createdAt: string;
}

export interface DLabel {
  id: string;
  name: string;
  color: string;
  description: string | null;
  createdAt: string;
}

export interface DCanned {
  id: string;
  shortCode: string;
  title: string | null;
  content: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DCall {
  id: string;
  inboxId: string | null;
  conversationId: string | null;
  messageId: string | null;
  contactId: string | null;
  clientId: string | null;
  userId: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  mode: 'SOFTPHONE' | 'MOBILE';
  fromNumber: string | null;
  toNumber: string | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  recordingUrl: string | null;
  voicemailUrl: string | null;
  hangupCause: string | null;
  meta: Record<string, any>;
}

export interface DChannelMember {
  userId: string;
  isAdmin: boolean;
  lastReadAt: string;
  muted: boolean;
  joinedAt: string;
}

export interface DChannel {
  id: string;
  name: string | null;
  kind: 'PUBLIC' | 'PRIVATE' | 'DM' | 'GROUP_DM';
  topic: string | null;
  description: string | null;
  clientId: string | null;
  dmKey: string | null;
  createdById: string | null;
  archived: boolean;
  lastMessageAt: string;
  createdAt: string;
  members: DChannelMember[];
}

export interface DChatMessage {
  id: string;
  channelId: string;
  userId: string | null;
  content: string;
  parentId: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  mentions: string[];
  meta: Record<string, any>;
  attachmentIds: string[];
  reactions: { emoji: string; userId: string }[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface DDriveLink {
  id: string;
  clientId: string | null;
  url: string;
  title: string | null;
  fileType: string | null;
  pinned: boolean;
  createdById: string | null;
  createdAt: string;
}

export interface DActivity {
  id: string;
  type: string;
  actorUserId: string | null;
  conversationId: string | null;
  clientId: string | null;
  inboxId: string | null;
  channelType: ChannelType | null;
  summary: string;
  data: Record<string, any>;
  createdAt: string;
}

export interface DNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, any>;
  readAt: string | null;
  createdAt: string;
}

export interface DAudit {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  data: Record<string, any>;
  createdAt: string;
}

export interface DemoState {
  version: number;
  /** "Now" when the data set was generated; every seeded timestamp is relative to it. */
  baseTime: number;
  /** Counter behind new ids. */
  seq: number;
  nextDisplayId: number;
  workspace: { name: string; timezone: string; logoUrl: string | null };
  users: DUser[];
  teams: DTeam[];
  clients: DClient[];
  contacts: DContact[];
  inboxes: DInbox[];
  conversations: DConversation[];
  messages: DMessage[];
  attachments: DAttachment[];
  labels: DLabel[];
  canned: DCanned[];
  calls: DCall[];
  channels: DChannel[];
  chatMessages: DChatMessage[];
  driveLinks: DDriveLink[];
  activity: DActivity[];
  notifications: DNotification[];
  audit: DAudit[];
  /** `${conversationId}:${userId}` → when that user last read the conversation. */
  reads: Record<string, string>;
  /** Used for conversations a user has no read marker for yet. */
  readDefault: string;
  /** Statuses people picked by hand (Away / Busy). */
  manualPresence: Record<string, Presence>;
  /** Website widget: widget token → the visitor contact of this browser. */
  widgetSessions: Record<string, string>;
}

// ─── Loading and saving ──────────────────────────────────────────────────────

let state: DemoState | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function load(): DemoState | null {
  try {
    const raw = storage()?.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoState;
    if (!parsed || parsed.version !== STATE_VERSION || !Array.isArray(parsed.conversations) || !Array.isArray(parsed.users)) return null;
    // blob: URLs belong to the page that made them; an avatar or logo saved as one cannot be shown here
    for (const u of parsed.users) if (u.avatarUrl?.startsWith('blob:')) u.avatarUrl = null;
    for (const c of parsed.clients) if (c.logoUrl?.startsWith('blob:')) c.logoUrl = null;
    return parsed;
  } catch {
    return null;
  }
}

/** The state, generated on first use. */
export function db(): DemoState {
  if (!state) {
    state = load();
    if (!state) {
      state = generateState(Date.now());
      // saved at once, so a second tab or the widget frame opening right now adopts this data set
      // instead of generating its own
      saveNow();
    }
  }
  return state;
}

function snapshot(s: DemoState, keepUploads: boolean): string {
  // Newest uploads win the storage budget; older ones stay usable until the page reloads.
  let budget = UPLOAD_BUDGET_BYTES;
  const keep = new Set<string>();
  if (keepUploads) {
    for (let i = s.attachments.length - 1; i >= 0; i--) {
      const a = s.attachments[i];
      if (!a.dataUrl) continue;
      if (a.dataUrl.length <= budget) {
        budget -= a.dataUrl.length;
        keep.add(a.id);
      }
    }
  }
  return JSON.stringify(s, (key, value) => (key === 'attachments' && Array.isArray(value) ? value.map((a: DAttachment) => (a.dataUrl && !keep.has(a.id) ? { ...a, dataUrl: undefined } : a)) : value));
}

export function saveNow(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const s = state;
  const store = storage();
  if (!s || !store) return;
  try {
    store.setItem(STATE_KEY, snapshot(s, true));
  } catch {
    try {
      // Probably over quota: keep the conversations and drop the uploaded bytes.
      store.setItem(STATE_KEY, snapshot(s, false));
    } catch {
      /* storage unavailable: the demo still works until the page reloads */
    }
  }
}

let flushOnLeave = false;

/** Call after every mutation: saves a moment later, and at once if the page is being left. */
export function touch(): void {
  if (!flushOnLeave && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    flushOnLeave = true;
    // a reload or tab close inside the debounce window would otherwise lose the last change
    const flush = () => {
      if (saveTimer) saveNow();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }
  if (saveTimer) return;
  saveTimer = setTimeout(saveNow, 350);
}

/** Wipes the saved state; the next request regenerates the data set. */
export function clearState(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  state = null;
  try {
    storage()?.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}

// ─── Other tabs and the widget iframe share the same saved state ─────────────

type ExternalListener = (prev: DemoState | null, next: DemoState | null) => void;
const externalListeners = new Set<ExternalListener>();
let syncStarted = false;

/** Adopts changes saved by another tab or frame (the website widget runs in an iframe with its own copy). */
export function startStorageSync(onChange: ExternalListener): void {
  externalListeners.add(onChange);
  if (syncStarted || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  syncStarted = true;
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key !== STATE_KEY) return;
    const prev = state;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    state = e.newValue ? load() : null;
    externalListeners.forEach((fn) => fn(prev, state));
  });
}

// ─── Small helpers ───────────────────────────────────────────────────────────

export const iso = (ms: number) => new Date(ms).toISOString();
export const nowIso = () => new Date().toISOString();
export const ms = (isoString: string | null | undefined) => (isoString ? Date.parse(isoString) : 0);

/** A new id such as `m-k3f9q`: readable, unique enough across the tabs of one browser. */
export function newId(prefix: string): string {
  const s = db();
  s.seq += 1;
  return `${prefix}-${s.seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Test hook: `globalThis.__ASCENTALK_DEMO_SPEED__ = 20` makes latency and the simulated replies 20× faster. */
export function scaled(msDelay: number): number {
  const speed = Number((globalThis as any).__ASCENTALK_DEMO_SPEED__) || 1;
  return Math.max(0, Math.round(msDelay / speed));
}

export const byId = <T extends { id: string }>(list: T[], id: string | null | undefined): T | undefined => (id ? list.find((x) => x.id === id) : undefined);
