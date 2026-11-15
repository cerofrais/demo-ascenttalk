'use client';
import { DEMO_HOME, DEMO_MODE } from './demo';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function qs(query?: Query) {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`/api${path}${qs(query)}`, {
    method,
    credentials: 'include',
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      const here = window.location.pathname + window.location.search;
      if (DEMO_MODE) {
        // no login in a demo build: go back to the persona picker
        if (!window.location.pathname.startsWith(DEMO_HOME)) window.location.href = DEMO_HOME;
      } else if (!window.location.pathname.startsWith('/login')) window.location.href = `/login?next=${encodeURIComponent(here)}`;
    }
    throw new ApiError(res.status, (data as any)?.error ?? res.statusText, (data as any)?.details);
  }
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

export const api = {
  get: <T = any>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T = any>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T = any>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  put: <T = any>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T = any>(path: string) => request<T>('DELETE', path),
  upload: async (files: File[] | FileList) => {
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append('file', f, f.name);
    return request<{ attachments: Attachment[] }>('POST', '/uploads', fd);
  },
};

// ─── Shared types (mirror API serializers) ────────────────────────────────────

export type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'ACCOUNT_MANAGER' | 'MEMBER' | 'GUEST';
export type ChannelType = 'WHATSAPP' | 'EMAIL' | 'VOICE' | 'WEBSITE' | 'TELEGRAM' | 'FACEBOOK' | 'INSTAGRAM' | 'SMS';
export type ConversationStatus = 'OPEN' | 'PENDING' | 'SNOOZED' | 'RESOLVED';
export type Priority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type Presence = 'ONLINE' | 'AWAY' | 'BUSY' | 'OFFLINE';

export interface UserBrief {
  id: string;
  name: string;
  email?: string;
  role?: Role;
  title?: string | null;
  department?: string | null;
  avatarUrl: string | null;
}

export interface Me extends UserBrief {
  email: string;
  role: Role;
  skills: string[];
  phone: string | null;
  timezone: string;
  statusText: string | null;
  callMode: 'SOFTPHONE' | 'MOBILE';
  teams: { id: string; name: string; color: string }[];
  notificationPrefs: Record<string, unknown>;
}

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE';
  url: string;
  createdAt?: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  description?: string | null;
}

export interface DriveLinkMeta {
  url: string;
  fileId: string | null;
  fileType: string;
  title: string | null;
}

export interface Conversation {
  id: string;
  displayId: number;
  status: ConversationStatus;
  priority: Priority;
  isGroup: boolean;
  groupName: string | null;
  subject: string | null;
  snoozedUntil: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastIncomingAt: string | null;
  lastOutgoingAt: string | null;
  waitingSince: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  participantIds: string[];
  meta: Record<string, any>;
  inbox: { id: string; name: string; channelType: ChannelType; status: string } | null;
  channelType: ChannelType | null;
  contact: { id: string; name: string; email: string | null; phone: string | null; avatarUrl: string | null; clientId: string | null } | null;
  client: { id: string; name: string; status: string; logoUrl: string | null; accountManagerId: string | null; teamId: string | null } | null;
  assignee: UserBrief | null;
  team: { id: string; name: string; color: string } | null;
  labels: Label[];
  unread: number;
}

export interface CallInfo {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  mode: 'SOFTPHONE' | 'MOBILE';
  fromNumber: string | null;
  toNumber: string | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  hangupCause: string | null;
  recordingUrl: string | null;
  voicemailUrl: string | null;
  user: UserBrief | null;
  contact: { id: string; name: string; phone: string | null } | null;
  client: { id: string; name: string } | null;
  inbox: { id: string; name: string } | null;
  conversationId: string | null;
  userId: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'INCOMING' | 'OUTGOING';
  kind: 'MESSAGE' | 'NOTE' | 'ACTIVITY' | 'CALL';
  content: string | null;
  contentHtml: string | null;
  senderName: string | null;
  senderUser: UserBrief | null;
  senderContactId: string | null;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'RECEIVED';
  error: string | null;
  externalId: string | null;
  replyTo: { id: string; content: string | null; senderName: string | null } | null;
  mentions: string[];
  meta: Record<string, any> & { driveLinks?: DriveLinkMeta[] };
  call: CallInfo | null;
  attachments: Attachment[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface InboxBrief {
  id: string;
  name: string;
  channelType: ChannelType;
  status: string;
  statusDetail: string | null;
  enabled: boolean;
  teamId: string | null;
  phoneNumber: string | null;
  email: string | null;
}

export interface ChatChannel {
  id: string;
  kind: 'PUBLIC' | 'PRIVATE' | 'DM' | 'GROUP_DM';
  name: string;
  topic: string | null;
  description: string | null;
  archived: boolean;
  client: { id: string; name: string } | null;
  clientId: string | null;
  members: UserBrief[];
  memberCount: number;
  isMember: boolean;
  muted: boolean;
  lastReadAt: string | null;
  unread: number;
  lastMessageAt: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  user: UserBrief | null;
  content: string;
  parentId: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  mentions: string[];
  meta: Record<string, any> & { driveLinks?: DriveLinkMeta[]; system?: boolean };
  attachments: Attachment[];
  reactions: { emoji: string; userIds: string[]; count: number }[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface Features {
  internalChat: boolean;
  dms: boolean;
  groupDms: boolean;
  threads: boolean;
  reactions: boolean;
  clientLinkedChannels: boolean;
  inbox: boolean;
  privateNotes: boolean;
  labels: boolean;
  cannedResponses: boolean;
  priority: boolean;
  snooze: boolean;
  channels: Record<ChannelType, boolean>;
  voice: { enabled: boolean; softphone: boolean; mobileBridge: boolean; recording: boolean };
  clients: boolean;
  driveLinks: boolean;
  oversight: boolean;
  activityFeed: boolean;
  workload: boolean;
  internalVisibility: 'none' | 'channels' | 'all';
  reports: boolean;
  files: boolean;
  drivePreviews: boolean;
  search: boolean;
  notifications: boolean;
  browserNotifications: boolean;
  sound: boolean;
  auditLog: boolean;
  ai: boolean;
  raw: Record<string, any>;
}

export interface Bootstrap {
  me: Me;
  workspace: { name: string; timezone: string; logoUrl: string | null };
  appName: string;
  features: Features;
  inboxes: InboxBrief[];
  labels: Label[];
  teams: { id: string; name: string; color: string }[];
  users: UserBrief[];
  integrations?: Record<string, boolean | string>;
}
