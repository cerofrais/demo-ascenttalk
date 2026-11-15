/**
 * Response shapes. Each function mirrors a serializer in the API (lib/serialize.ts and the route files) and is
 * typed with the interface the web app reads it through, so a drift between the two fails the type check.
 */
import type { CallInfo, ChatChannel, ChatMessage, Conversation, InboxBrief, Me, Message, Presence, UserBrief } from '@/lib/api';
import { serializeAttachment } from './files';
import { presenceOf } from './realtime';
import { db, type DCall, type DChannel, type DChannelMember, type DChatMessage, type DClient, type DConversation, type DInbox, type DMessage, type DUser, type DemoState } from './store';

/**
 * serializeUserBrief(). The API selects different columns in different places, so title and department are
 * only filled where the real route loads them: 'basic' = id/name/email/role, 'titled' adds the title.
 */
export function userBrief(user: DUser | null | undefined, detail: 'basic' | 'titled' | 'full' = 'basic'): (UserBrief & { email: string; role: DUser['role']; title: string | null; department: string | null }) | null {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    title: detail === 'basic' ? null : user.title,
    department: detail === 'full' ? user.department : null,
    avatarUrl: user.avatarUrl,
  };
}

const findUser = (id: string | null | undefined, s: DemoState = db()) => (id ? s.users.find((u) => u.id === id) : undefined);

export function teamsOf(userId: string, s: DemoState = db()): { id: string; name: string; color: string }[] {
  return s.teams.filter((t) => t.memberIds.includes(userId)).map((t) => ({ id: t.id, name: t.name, color: t.color }));
}

/** serializeMe() in routes/users.ts */
export function serializeMe(user: DUser): Me & { createdAt: string } {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    title: user.title,
    department: user.department,
    skills: user.skills,
    phone: user.phone,
    timezone: user.timezone,
    statusText: user.statusText,
    callMode: user.callMode,
    avatarUrl: user.avatarUrl,
    notificationPrefs: user.notificationPrefs,
    teams: teamsOf(user.id),
    createdAt: user.createdAt,
  };
}

export interface DirectoryUser extends UserBrief {
  email: string;
  role: DUser['role'];
  title: string | null;
  department: string | null;
  skills: string[];
  phone: string | null;
  timezone: string;
  statusText: string | null;
  active: boolean;
  callMode: 'SOFTPHONE' | 'MOBILE';
  lastSeenAt: string | null;
  invited: boolean;
  sso: boolean;
  teams: { id: string; name: string; color: string }[];
  presence: Presence;
  onCall: boolean;
  createdAt: string;
}

/** serializeUser() in routes/users.ts: a row of the people directory. */
export function serializeUser(user: DUser, withPresence = true): DirectoryUser {
  return {
    ...userBrief(user, 'full')!,
    skills: user.skills,
    phone: user.phone,
    timezone: user.timezone,
    statusText: user.statusText,
    active: user.active,
    callMode: user.callMode,
    lastSeenAt: user.lastSeenAt,
    invited: user.invited,
    sso: false,
    teams: teamsOf(user.id),
    presence: withPresence ? presenceOf(user.id) : 'OFFLINE',
    onCall: false,
    createdAt: user.createdAt,
  };
}

export function serializeCall(call: DCall, userDetail: 'basic' | 'full' = 'basic'): CallInfo {
  const s = db();
  const contact = call.contactId ? s.contacts.find((c) => c.id === call.contactId) : undefined;
  const client = call.clientId ? s.clients.find((c) => c.id === call.clientId) : undefined;
  const inbox = call.inboxId ? s.inboxes.find((i) => i.id === call.inboxId) : undefined;
  return {
    id: call.id,
    direction: call.direction,
    status: call.status,
    mode: call.mode,
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    startedAt: call.startedAt,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt,
    durationSec: call.durationSec,
    hangupCause: call.hangupCause,
    recordingUrl: call.recordingUrl,
    voicemailUrl: call.voicemailUrl,
    user: userBrief(findUser(call.userId, s), userDetail),
    contact: contact ? { id: contact.id, name: contact.name, phone: contact.phone } : null,
    client: client ? { id: client.id, name: client.name } : null,
    inbox: inbox ? { id: inbox.id, name: inbox.name } : null,
    conversationId: call.conversationId,
    userId: call.userId,
  };
}

export function serializeMessage(m: DMessage): Message {
  const s = db();
  const sender = findUser(m.senderUserId, s);
  const senderContact = m.senderContactId ? s.contacts.find((c) => c.id === m.senderContactId) : undefined;
  const replyTo = m.replyToId ? s.messages.find((x) => x.id === m.replyToId) : undefined;
  const call = m.callId ? s.calls.find((k) => k.id === m.callId) : undefined;
  return {
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction,
    kind: m.kind,
    content: m.deletedAt ? null : m.content,
    contentHtml: m.deletedAt ? null : m.contentHtml,
    senderName: m.senderName ?? sender?.name ?? senderContact?.name ?? null,
    senderUser: userBrief(sender),
    senderContactId: m.senderContactId,
    status: m.status,
    error: m.error,
    externalId: m.externalId,
    replyTo: replyTo ? { id: replyTo.id, content: replyTo.content?.slice(0, 200) ?? null, senderName: replyTo.senderName ?? null } : null,
    mentions: m.mentions,
    meta: m.meta ?? {},
    call: call ? serializeCall(call) : null,
    attachments: m.attachmentIds.map((id) => s.attachments.find((a) => a.id === id)).filter((a) => a !== undefined).map(serializeAttachment),
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
  };
}

/** Incoming messages the user has not read yet (the unreadCounts query in routes/conversations.ts). */
export function unreadFor(userId: string, c: DConversation, s: DemoState = db()): number {
  const since = s.reads[`${c.id}:${userId}`] ?? s.readDefault;
  if (c.lastIncomingAt && c.lastIncomingAt <= since) return 0;
  let n = 0;
  for (const m of s.messages) if (m.conversationId === c.id && m.direction === 'INCOMING' && m.createdAt > since) n++;
  return n;
}

export function serializeConversation(c: DConversation, extra: { unread?: number } = {}): Conversation {
  const s = db();
  const inbox = s.inboxes.find((i) => i.id === c.inboxId);
  const contact = c.contactId ? s.contacts.find((x) => x.id === c.contactId) : undefined;
  const client = c.clientId ? s.clients.find((x) => x.id === c.clientId) : undefined;
  const team = c.teamId ? s.teams.find((t) => t.id === c.teamId) : undefined;
  return {
    id: c.id,
    displayId: c.displayId,
    status: c.status,
    priority: c.priority,
    isGroup: c.isGroup,
    groupName: c.groupName,
    subject: c.subject,
    snoozedUntil: c.snoozedUntil,
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    lastIncomingAt: c.lastIncomingAt,
    lastOutgoingAt: c.lastOutgoingAt,
    waitingSince: c.waitingSince,
    firstResponseAt: c.firstResponseAt,
    resolvedAt: c.resolvedAt,
    createdAt: c.createdAt,
    participantIds: c.participantIds,
    meta: c.meta ?? {},
    inbox: inbox ? { id: inbox.id, name: inbox.name, channelType: inbox.channelType, status: inbox.status } : null,
    channelType: inbox?.channelType ?? null,
    contact: contact ? { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone, avatarUrl: contact.avatarUrl, clientId: contact.clientId } : null,
    client: client ? { id: client.id, name: client.name, status: client.status, logoUrl: client.logoUrl, accountManagerId: client.accountManagerId, teamId: client.teamId } : null,
    assignee: userBrief(findUser(c.assigneeId, s)),
    team: team ? { id: team.id, name: team.name, color: team.color } : null,
    labels: c.labelIds.map((id) => s.labels.find((l) => l.id === id)).filter((l) => l !== undefined).map((l) => ({ ...l })),
    unread: extra.unread ?? 0,
  };
}

/** serializeChatMessage() in routes/chat.ts */
export function serializeChatMessage(m: DChatMessage): ChatMessage {
  const s = db();
  const grouped = new Map<string, string[]>();
  for (const r of m.reactions) grouped.set(r.emoji, [...(grouped.get(r.emoji) ?? []), r.userId]);
  return {
    id: m.id,
    channelId: m.channelId,
    user: userBrief(findUser(m.userId, s), 'titled'),
    content: m.deletedAt ? '' : m.content,
    parentId: m.parentId,
    replyCount: m.replyCount,
    lastReplyAt: m.lastReplyAt,
    mentions: m.mentions,
    meta: m.meta ?? {},
    attachments: m.deletedAt ? [] : m.attachmentIds.map((id) => s.attachments.find((a) => a.id === id)).filter((a) => a !== undefined).map(serializeAttachment),
    reactions: [...grouped.entries()].map(([emoji, userIds]) => ({ emoji, userIds, count: userIds.length })),
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    createdAt: m.createdAt,
  };
}

/** Top-level messages from other people since the member last read the channel (channelUnread in the API). */
export function channelUnread(ch: DChannel, member: DChannelMember | undefined, s: DemoState = db()): number {
  if (!member) return 0;
  let n = 0;
  for (const m of s.chatMessages) {
    if (m.channelId === ch.id && !m.parentId && !m.deletedAt && m.createdAt > member.lastReadAt && m.userId !== member.userId) n++;
  }
  return n;
}

/** serializeChannel() in routes/chat.ts. `withMembers: false` is the browse list, which loads no members. */
export function serializeChannel(ch: DChannel, me: string, opts: { membership?: DChannelMember; unread?: number; withMembers?: boolean } = {}): ChatChannel {
  const s = db();
  const members = opts.withMembers === false ? [] : ch.members.map((m) => findUser(m.userId, s)).filter((u) => u !== undefined);
  const others = members.filter((u) => u.id !== me);
  const isDm = ch.kind === 'DM' || ch.kind === 'GROUP_DM';
  const client = ch.clientId ? s.clients.find((c) => c.id === ch.clientId) : undefined;
  return {
    id: ch.id,
    kind: ch.kind,
    // the API sends null for an unnamed channel; in practice only DMs are unnamed and they get a computed name
    name: isDm ? others.map((u) => u.name).join(', ') || 'Just you' : (ch.name ?? ''),
    topic: ch.topic,
    description: ch.description,
    archived: ch.archived,
    client: client ? { id: client.id, name: client.name } : null,
    clientId: ch.clientId,
    members: members.map((u) => userBrief(u, 'titled')!),
    memberCount: ch.members.length,
    isMember: Boolean(opts.membership) || members.some((u) => u.id === me),
    muted: opts.membership?.muted ?? false,
    lastReadAt: opts.membership?.lastReadAt ?? null,
    unread: opts.unread ?? 0,
    lastMessageAt: ch.lastMessageAt,
    createdAt: ch.createdAt,
  };
}

export interface ClientRecord {
  id: string;
  name: string;
  logoUrl: string | null;
  industry: string | null;
  website: string | null;
  status: DClient['status'];
  tags: string[];
  driveFolderUrl: string | null;
  notes: string | null;
  customAttributes: Record<string, unknown>;
  accountManager: UserBrief | null;
  team: { id: string; name: string; color: string } | null;
  counts: { contacts: number; conversations: number };
  openConversations?: number;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** serializeClient() in routes/clients.ts */
export function serializeClient(c: DClient, extra: { openConversations?: number; lastActivityAt?: string | null } = {}): ClientRecord {
  const s = db();
  const team = c.teamId ? s.teams.find((t) => t.id === c.teamId) : undefined;
  return {
    id: c.id,
    name: c.name,
    logoUrl: c.logoUrl,
    industry: c.industry,
    website: c.website,
    status: c.status,
    tags: c.tags,
    driveFolderUrl: c.driveFolderUrl,
    notes: c.notes,
    customAttributes: c.customAttributes,
    accountManager: userBrief(findUser(c.accountManagerId, s)),
    team: team ? { id: team.id, name: team.name, color: team.color } : null,
    counts: { contacts: s.contacts.filter((x) => x.clientId === c.id).length, conversations: s.conversations.filter((x) => x.clientId === c.id).length },
    openConversations: extra.openConversations,
    lastActivityAt: extra.lastActivityAt ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function inboxBrief(i: DInbox): InboxBrief {
  return { id: i.id, name: i.name, channelType: i.channelType, status: i.status, statusDetail: i.statusDetail, enabled: i.enabled, teamId: i.teamId, phoneNumber: i.config?.phoneNumber ?? null, email: i.config?.email ?? null };
}

export const META_VERIFY_TOKEN = 'ascentalk-meta-verify';

export function origin(): string {
  try {
    return window.location.origin;
  } catch {
    return 'https://demo.ascentalk.example';
  }
}

/** serializeInbox() in routes/inboxes.ts. Only admins get the token and the widget snippet. */
export function serializeInbox(i: DInbox, withSecrets: boolean) {
  const s = db();
  const team = i.teamId ? s.teams.find((t) => t.id === i.teamId) : undefined;
  return {
    id: i.id,
    name: i.name,
    channelType: i.channelType,
    status: i.status,
    statusDetail: i.statusDetail,
    enabled: i.enabled,
    config: { ...i.config },
    greeting: i.greeting,
    signature: i.signature,
    team: team ? { id: team.id, name: team.name, color: team.color } : null,
    teamId: i.teamId,
    memberIds: i.memberIds,
    token: withSecrets ? i.token : undefined,
    widgetSnippet: i.channelType === 'WEBSITE' && withSecrets ? `<script src="${origin()}/widget.js" data-token="${i.token}" async></script>` : undefined,
    metaWebhook: withSecrets && (i.channelType === 'FACEBOOK' || i.channelType === 'INSTAGRAM') ? { callbackUrl: `${origin()}/webhooks/meta`, verifyToken: META_VERIFY_TOKEN } : undefined,
    flagEnabled: true,
    counts: { conversations: s.conversations.filter((c) => c.inboxId === i.id).length },
    createdAt: i.createdAt,
  };
}
