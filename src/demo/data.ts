/**
 * Builds the demo data set from the scripts in content.ts. Every timestamp is relative to `baseTime` (the
 * moment of the visitor's first load), so the demo always looks current; the result is then persisted.
 */
import type { ChannelType } from '@/lib/api';
import { DEMO_AGENCY, PERSONAS } from './personas';
import {
  AUDIT,
  CALLS,
  CALL_AUDIO_URL,
  CANNED,
  CHANNELS,
  CLIENTS,
  CONTACTS,
  CONVERSATIONS,
  D,
  DRIVE_TITLES,
  EXTRA_ACTIVITY,
  FILES,
  H,
  INBOXES,
  LABELS,
  NOTIFICATIONS,
  OTHER_USERS,
  TEAMS,
  USER_EXTRAS,
  assetUrl,
  type MsgSeed,
  type UserSeed,
} from './content';
import type {
  DActivity,
  DAttachment,
  DCall,
  DChannel,
  DChatMessage,
  DContact,
  DConversation,
  DIdentity,
  DMessage,
  DUser,
  DemoState,
} from './store';
import { callLabel, driveMetaFor, identityKey, mulberry32, preview, textToHtml } from './util';

export const DATA_VERSION = 1;

const VOICE_LINE = '+12025550110';
/** Seeded activity older than this is left out of the oversight feed. */
const ACTIVITY_WINDOW_MIN = 4 * D;

export function generateState(baseTime: number): DemoState {
  const rand = mulberry32(0x0a5c3e27);
  const at = (minAgo: number) => new Date(baseTime - Math.round(minAgo * 60_000)).toISOString();

  // ── People ────────────────────────────────────────────────────────────────
  const seeds: UserSeed[] = [
    ...PERSONAS.map((p) => ({ id: p.id, name: p.name, email: p.email, role: p.role, title: p.title, ...USER_EXTRAS[p.id] })),
    ...OTHER_USERS,
  ];
  const users: DUser[] = seeds.map((s, i) => ({
    id: s.id,
    email: s.email,
    name: s.name,
    role: s.role,
    title: s.title,
    department: s.department,
    skills: s.skills,
    phone: s.phone,
    timezone: 'Asia/Kolkata',
    avatarUrl: null,
    statusText: s.statusText ?? null,
    lastSeenAt: at(s.lastSeen ?? 14 * H + i * 7),
    active: true,
    callMode: s.callMode ?? 'SOFTPHONE',
    invited: false,
    notificationPrefs: {},
    presence: s.presence,
    createdAt: at(6 * D + 5 * H - i),
  }));
  const userName = (id: string | null | undefined) => users.find((u) => u.id === id)?.name ?? 'Someone';

  const teams = TEAMS.map((t) => ({ ...t, createdAt: at(6 * D + 4 * H) }));

  const clients = CLIENTS.map((c) => ({
    id: c.id,
    name: c.name,
    logoUrl: null,
    industry: c.industry,
    website: c.website,
    status: c.status,
    accountManagerId: c.am,
    teamId: c.team,
    tags: c.tags,
    driveFolderUrl: c.folder,
    notes: c.notes,
    customAttributes: {},
    createdAt: at(c.since * D + 3 * H),
    updatedAt: at(Math.min(c.since * D, 24 * H + c.since)),
  }));
  const driveLinks = CLIENTS.flatMap((c) => c.links.map((l) => ({ clientId: c.id, ...l })))
    .sort((a, b) => b.at - a.at)
    .map((l, i) => ({ id: `dl-${String(i + 1).padStart(2, '0')}`, clientId: l.clientId, url: l.url, title: l.title, fileType: l.type, pinned: true, createdById: l.by, createdAt: at(l.at) }));

  let identitySeq = 0;
  const identity = (channelType: ChannelType, scope: string, identifier: string, createdAt: string): DIdentity => ({
    id: `ci-${String(++identitySeq).padStart(3, '0')}`,
    channelType,
    identifier,
    key: identityKey(channelType, scope, identifier),
    createdAt,
  });
  const contacts: DContact[] = CONTACTS.map((c, i) => {
    const client = CLIENTS.find((x) => x.id === c.client);
    const createdAt = at(client ? Math.max(client.since * D - i * 30, 7 * D) : 7 * D);
    return {
      id: c.id,
      name: c.name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      avatarUrl: null,
      clientId: c.client,
      roleAtClient: c.role ?? null,
      notes: c.notes ?? null,
      customAttributes: {},
      identities: [
        ...(c.phone ? [identity('WHATSAPP', 'global', c.phone, createdAt), identity('VOICE', 'global', c.phone, createdAt)] : []),
        ...(c.email ? [identity('EMAIL', 'global', c.email, createdAt)] : []),
      ],
      createdAt,
      updatedAt: createdAt,
    };
  });
  const contact = (id: string | null | undefined) => contacts.find((c) => c.id === id);

  const inboxes = INBOXES.map((i) => ({
    id: i.id,
    name: i.name,
    channelType: i.channelType,
    config: { ...i.config } as Record<string, any>,
    externalId: i.externalId,
    token: i.token,
    status: 'connected',
    statusDetail: null,
    teamId: i.team,
    greeting: i.greeting ?? null,
    signature: i.signature ?? null,
    enabled: true,
    memberIds: i.members,
    createdAt: at(i.since * D),
  }));

  // ── Calls ─────────────────────────────────────────────────────────────────
  const calls: DCall[] = CALLS.map((k) => {
    const person = contact(k.contact)!;
    const client = clients.find((c) => c.id === person.clientId);
    const start = baseTime - k.at * 60_000;
    const answered = k.status === 'COMPLETED' ? start + 9_000 : null;
    const sec = k.status === 'COMPLETED' ? (k.sec ?? 120) : 0;
    const end = answered ? answered + sec * 1000 : start + (k.status === 'VOICEMAIL' ? 52_000 : 27_000);
    return {
      id: k.id,
      inboxId: 'ib-voice',
      conversationId: null,
      messageId: null,
      contactId: person.id,
      clientId: person.clientId,
      userId: k.user,
      direction: k.dir,
      status: k.status,
      mode: k.mode ?? 'SOFTPHONE',
      fromNumber: k.dir === 'INBOUND' ? person.phone : VOICE_LINE,
      toNumber: k.dir === 'INBOUND' ? VOICE_LINE : person.phone,
      startedAt: new Date(start).toISOString(),
      answeredAt: answered ? new Date(answered).toISOString() : null,
      endedAt: new Date(end).toISOString(),
      durationSec: sec,
      recordingUrl: k.recording ? CALL_AUDIO_URL : null,
      voicemailUrl: k.status === 'VOICEMAIL' ? CALL_AUDIO_URL : null,
      hangupCause: k.status === 'COMPLETED' ? 'NORMAL_CLEARING' : k.status === 'BUSY' ? 'USER_BUSY' : 'NO_ANSWER',
      meta: k.dir === 'INBOUND' ? { ringing: [...new Set([client?.accountManagerId, 'u-priya', 'u-arjun', 'u-neha'].filter(Boolean))] } : {},
    };
  });

  // ── Client conversations ──────────────────────────────────────────────────
  const conversations: DConversation[] = [];
  const messages: DMessage[] = [];
  const attachments: DAttachment[] = [];
  const activity: (Omit<DActivity, 'id'> & { sort: number })[] = [];
  const convIdByKey: Record<string, string> = {};
  let attSeq = 0;

  const attach = (keys: string[] | undefined, owner: { messageId?: string; chatMessageId?: string }, uploadedById: string | null, createdAt: string): string[] =>
    (keys ?? []).map((key) => {
      const f = FILES[key];
      const id = `att-${String(++attSeq).padStart(3, '0')}`;
      attachments.push({ id, fileName: f.fileName, mimeType: f.mimeType, size: f.size, kind: f.kind, url: assetUrl(f.file), uploadedById, messageId: owner.messageId ?? null, chatMessageId: owner.chatMessageId ?? null, createdAt });
      return id;
    });

  const firstAt = (msgs: MsgSeed[]) => Math.max(...msgs.map((m) => m.at));
  const ordered = [...CONVERSATIONS].sort((a, b) => firstAt(b.msgs) - firstAt(a.msgs));

  ordered.forEach((seed, index) => {
    const displayId = 1001 + index;
    const id = `c-${displayId}`;
    convIdByKey[seed.key] = id;
    const inbox = inboxes.find((i) => i.id === seed.inbox)!;
    const person = contact(seed.contact);
    const clientId = seed.client !== undefined ? seed.client : (person?.clientId ?? null);
    const who = seed.group ?? person?.name ?? 'Contact';
    const channel = inbox.channelType;
    const seedMsgs = [...seed.msgs].sort((a, b) => b.at - a.at);
    const recent = (minAgo: number) => minAgo <= ACTIVITY_WINDOW_MIN;

    let lastMessageAt: string | null = null;
    let lastPreview: string | null = null;
    let lastIncomingAt: string | null = null;
    let lastOutgoingAt: string | null = null;
    let waitingSince: string | null = null;
    let firstResponseAt: string | null = null;
    let resolvedAt: string | null = null;
    let updatedAt = at(seedMsgs[0].at);
    let emailCount = 0;
    const participants: string[] = [];

    seedMsgs.forEach((m, i) => {
      const mid = `m-${displayId}-${String(i + 1).padStart(2, '0')}`;
      const createdAt = at(m.at);
      const base: DMessage = {
        id: mid,
        conversationId: id,
        direction: 'OUTGOING',
        kind: 'MESSAGE',
        senderUserId: null,
        senderContactId: null,
        senderName: null,
        content: m.text ?? null,
        contentHtml: null,
        externalId: `demo-${mid}`,
        replyToId: null,
        status: 'SENT',
        error: null,
        mentions: [],
        meta: {},
        attachmentIds: [],
        callId: null,
        createdAt,
        editedAt: null,
        deletedAt: null,
      };
      const drive = driveMetaFor(m.text, DRIVE_TITLES);
      if (drive.length) base.meta.driveLinks = drive;
      const emailMeta = (extra: Record<string, unknown>) => {
        if (channel !== 'EMAIL') return;
        const first = emailCount === 0;
        emailCount += 1;
        base.meta.email = { subject: first ? seed.subject : `Re: ${seed.subject}`, ...extra };
      };

      if (m.k === 'in') {
        const sender = contact(m.who)!;
        base.direction = 'INCOMING';
        base.senderContactId = sender.id;
        base.senderName = sender.name;
        base.status = 'RECEIVED';
        base.attachmentIds = attach(m.files, { messageId: mid }, null, createdAt);
        emailMeta({ from: `${sender.name} <${sender.email}>`, to: [inbox.config.email], ...(m.cc ? { cc: m.cc } : {}) });
        if (channel === 'EMAIL' && m.text) base.contentHtml = textToHtml(m.text);
        if (channel === 'WEBSITE') base.meta.website = { pageUrl: 'https://orbitmedia.example/', userAgent: null };
        lastMessageAt = createdAt;
        lastPreview = preview(m.text, base.attachmentIds.map(() => ({ kind: FILES[m.files![0]].kind })));
        lastIncomingAt = createdAt;
        waitingSince ??= createdAt;
        if (recent(m.at)) {
          activity.push({ sort: m.at, type: 'message.incoming', actorUserId: null, conversationId: id, clientId, inboxId: inbox.id, channelType: channel, summary: `${sender.name}${seed.group ? ` in ${who}` : ''}: ${lastPreview}`, data: { messageId: mid, isNew: i === 0 }, createdAt });
        }
      } else if (m.k === 'out') {
        base.senderUserId = m.who ?? null;
        base.senderName = userName(m.who);
        base.attachmentIds = attach(m.files, { messageId: mid }, m.who ?? null, createdAt);
        base.status = m.status ?? (channel === 'EMAIL' || channel === 'WEBSITE' ? 'SENT' : 'READ');
        base.error = m.error ?? null;
        emailMeta({ to: person?.email ? [person.email] : [] });
        lastMessageAt = createdAt;
        lastPreview = preview(m.text, base.attachmentIds.map(() => ({ kind: FILES[m.files![0]].kind })));
        lastOutgoingAt = createdAt;
        if (lastIncomingAt && !firstResponseAt) firstResponseAt = createdAt;
        waitingSince = null;
        if (recent(m.at)) {
          activity.push({ sort: m.at, type: 'message.outgoing', actorUserId: m.who ?? null, conversationId: id, clientId, inboxId: inbox.id, channelType: channel, summary: `${userName(m.who)} replied to ${who} via ${inbox.name}: ${lastPreview}`, data: {}, createdAt });
          if (m.status === 'FAILED') {
            activity.push({ sort: m.at - 0.5, type: 'message.failed', actorUserId: null, conversationId: id, clientId, inboxId: inbox.id, channelType: channel, summary: `Message to ${who} via ${inbox.name} failed: ${m.error}`, data: {}, createdAt: at(m.at - 0.5) });
          }
        }
      } else if (m.k === 'greet') {
        base.senderName = inbox.name;
        lastMessageAt = createdAt;
        lastPreview = preview(m.text);
      } else if (m.k === 'note') {
        base.kind = 'NOTE';
        base.senderUserId = m.who ?? null;
        base.senderName = userName(m.who);
        base.mentions = m.mentions ?? [];
        for (const u of base.mentions) if (!participants.includes(u)) participants.push(u);
      } else if (m.k === 'act') {
        base.kind = 'ACTIVITY';
        base.senderUserId = m.who ?? null;
        base.content = `${userName(m.who)} ${m.text}`;
        base.externalId = null;
        updatedAt = createdAt;
        if (m.text?.includes('resolved')) resolvedAt = createdAt;
        if (recent(m.at)) {
          activity.push({ sort: m.at, type: 'conversation.updated', actorUserId: m.who ?? null, conversationId: id, clientId, inboxId: inbox.id, channelType: channel, summary: `${base.content} (${who} #${displayId})`, data: {}, createdAt });
        }
      } else {
        const call = calls.find((k) => k.id === m.who)!;
        call.conversationId = id;
        call.messageId = mid;
        base.kind = 'CALL';
        base.callId = call.id;
        base.content = callLabel(call);
        base.externalId = `call:${call.id}`;
        if (call.direction === 'INBOUND') {
          base.direction = 'INCOMING';
          base.senderContactId = person?.id ?? null;
          base.senderName = person?.name ?? null;
          base.status = 'RECEIVED';
          lastIncomingAt = createdAt;
        } else {
          base.senderUserId = call.userId;
          base.senderName = userName(call.userId);
        }
        lastMessageAt = createdAt;
        lastPreview = `📞 ${base.content}`;
        // A missed call or voicemail leaves the client waiting; a completed call settles it.
        if (call.status === 'MISSED' || call.status === 'VOICEMAIL') waitingSince ??= createdAt;
        else if (call.status === 'COMPLETED') waitingSince = null;
      }
      messages.push(base);
    });

    const status = seed.status ?? 'OPEN';
    if (status === 'RESOLVED') {
      waitingSince = null;
      resolvedAt ??= lastMessageAt;
    }
    const createdAt = at(seedMsgs[0].at);
    const thread =
      seed.group != null
        ? channel === 'WHATSAPP'
          ? `1203630000000${displayId}@g.us`
          : `-100${displayId}0001`
        : channel === 'WHATSAPP'
          ? `${(person?.phone ?? '').replace(/\D/g, '')}@s.whatsapp.net`
          : channel === 'EMAIL'
            ? `<thread-${displayId}@orbitmedia.example>`
            : channel === 'WEBSITE'
              ? `visitor:${person?.id}`
              : channel === 'VOICE'
                ? (person?.phone ?? `anon-${displayId}`)
                : `${channel.toLowerCase()}-${person?.id}`;
    // Channel-scoped handles (Telegram chat, Instagram or Messenger user, website visitor), so the contact can be messaged there again.
    if (person && ['TELEGRAM', 'FACEBOOK', 'INSTAGRAM', 'WEBSITE'].includes(channel) && !person.identities.some((x) => x.key === identityKey(channel, inbox.id, thread))) {
      person.identities.push(identity(channel, inbox.id, thread, createdAt));
    }
    conversations.push({
      id,
      displayId,
      inboxId: inbox.id,
      contactId: person?.id ?? null,
      clientId,
      externalThreadId: thread,
      isGroup: seed.group != null,
      groupName: seed.group ?? null,
      subject: seed.subject ?? null,
      status,
      snoozedUntil: status === 'SNOOZED' ? new Date(baseTime + (seed.snoozeFor ?? 18 * H) * 60_000).toISOString() : null,
      priority: seed.priority ?? 'NONE',
      assigneeId: seed.assignee ?? null,
      teamId: seed.team ?? null,
      lastMessageAt: lastMessageAt ?? createdAt,
      lastMessagePreview: lastPreview,
      lastIncomingAt,
      lastOutgoingAt,
      waitingSince,
      firstResponseAt,
      resolvedAt: status === 'RESOLVED' ? resolvedAt : null,
      participantIds: participants,
      meta: {},
      labelIds: seed.labels ?? [],
      createdAt,
      updatedAt: updatedAt > (lastMessageAt ?? '') ? updatedAt : (lastMessageAt ?? createdAt),
    });
  });

  // Calls and the remaining feed entries
  CALLS.forEach((k) => {
    if (k.at > ACTIVITY_WINDOW_MIN) return;
    const call = calls.find((c) => c.id === k.id)!;
    const person = contact(k.contact)!;
    const endMin = k.at - (Date.parse(call.endedAt!) - Date.parse(call.startedAt)) / 60_000;
    activity.push({ sort: endMin, type: `call.${k.status.toLowerCase()}`, actorUserId: k.user, conversationId: call.conversationId, clientId: call.clientId, inboxId: 'ib-voice', channelType: 'VOICE', summary: `${callLabel(call)} ${k.dir === 'INBOUND' ? 'from' : 'to'} ${person.name}`, data: { callId: k.id, durationSec: call.durationSec }, createdAt: call.endedAt! });
  });
  EXTRA_ACTIVITY.forEach((e) => activity.push({ sort: e.at, type: e.type, actorUserId: e.by, conversationId: null, clientId: e.client ?? null, inboxId: null, channelType: null, summary: e.summary, data: {}, createdAt: at(e.at) }));
  const activityRows: DActivity[] = activity
    .sort((a, b) => b.sort - a.sort)
    .map(({ sort: _sort, ...e }, i) => ({ id: `ev-${String(i + 1).padStart(3, '0')}`, ...e }));

  // ── Team chat ─────────────────────────────────────────────────────────────
  const channels: DChannel[] = [];
  const chatMessages: DChatMessage[] = [];
  let chatSeq = 0;
  const chatId = () => `cm-${String(++chatSeq).padStart(3, '0')}`;
  const defaultRead = 110;

  CHANNELS.forEach((ch) => {
    const createdAt = at(ch.since * D + 2 * H);
    const isDm = ch.kind === 'DM' || ch.kind === 'GROUP_DM';
    const rows: { at: number; row: DChatMessage }[] = [];
    const lastOwn: Record<string, number> = {};
    const add = (minAgo: number, by: string | null, text: string, parentId: string | null, extra: Partial<DChatMessage> = {}, files?: string[]) => {
      const id = chatId();
      const created = at(minAgo);
      const drive = driveMetaFor(text, DRIVE_TITLES);
      const row: DChatMessage = {
        id,
        channelId: ch.id,
        userId: by,
        content: text,
        parentId,
        replyCount: 0,
        lastReplyAt: null,
        mentions: [],
        meta: drive.length ? { driveLinks: drive } : {},
        attachmentIds: [],
        reactions: [],
        editedAt: null,
        deletedAt: null,
        createdAt: created,
        ...extra,
      };
      row.attachmentIds = attach(files, { chatMessageId: id }, by, created);
      rows.push({ at: minAgo, row });
      if (by) lastOwn[by] = Math.min(lastOwn[by] ?? Infinity, minAgo);
      return row;
    };
    if (!isDm) add(ch.since * D + 2 * H, null, `${userName(ch.by)} created #${ch.name}`, null, { meta: { system: true } });
    for (const m of ch.msgs) {
      const parent = add(m.at, m.by, m.text, null, { mentions: m.mentions ?? [], reactions: Object.entries(m.reactions ?? {}).flatMap(([emoji, ids]) => ids.map((userId) => ({ emoji, userId }))) }, m.files);
      for (const r of m.replies ?? []) {
        add(r.at, r.by, r.text, parent.id, {}, r.files);
        parent.replyCount += 1;
        parent.lastReplyAt = at(r.at);
      }
    }
    rows.sort((a, b) => b.at - a.at);
    const topLevel = rows.filter((r) => !r.row.parentId);
    chatMessages.push(...rows.map((r) => r.row));
    channels.push({
      id: ch.id,
      name: isDm ? null : (ch.name ?? null),
      kind: ch.kind,
      topic: ch.topic ?? null,
      description: ch.description ?? null,
      clientId: ch.client ?? null,
      dmKey: isDm ? [...ch.members].sort().join(':') : null,
      createdById: ch.by,
      archived: false,
      lastMessageAt: topLevel.length ? at(topLevel[topLevel.length - 1].at) : createdAt,
      createdAt,
      members: ch.members.map((userId) => ({
        userId,
        isAdmin: !isDm && userId === ch.by,
        // people have read up to their own last message; otherwise they last looked a couple of hours ago
        lastReadAt: at(ch.caughtUp?.includes(userId) ? 0 : Math.min(defaultRead, lastOwn[userId] ?? defaultRead)),
        muted: false,
        joinedAt: createdAt,
      })),
    });
  });

  // ── Notifications and the audit log ───────────────────────────────────────
  const notifications = [...NOTIFICATIONS]
    .sort((a, b) => b.at - a.at)
    .map((n, i) => ({
      id: `n-${String(i + 1).padStart(3, '0')}`,
      userId: n.user,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link.startsWith('conv:') ? `/inbox/${convIdByKey[n.link.slice(5)]}` : n.link,
      data: {},
      readAt: n.read ? at(Math.max(0, n.at - 12)) : null,
      createdAt: at(n.at),
    }));
  const audit = [...AUDIT]
    .sort((a, b) => b.at - a.at)
    .map((a, i) => ({
      id: `al-${String(i + 1).padStart(3, '0')}`,
      actorId: a.by,
      action: a.action,
      targetType: a.type ?? null,
      targetId: a.target ?? null,
      // 203.0.113.0/24 is reserved for documentation, so these never point at a real machine
      ip: `203.0.113.${10 + Math.floor(rand() * 200)}`,
      data: a.data ?? {},
      createdAt: at(a.at),
    }));

  return {
    version: DATA_VERSION,
    baseTime,
    seq: 1000,
    nextDisplayId: 1001 + conversations.length,
    workspace: { name: DEMO_AGENCY, timezone: 'Asia/Kolkata', logoUrl: null },
    users,
    teams,
    clients,
    contacts,
    inboxes,
    conversations,
    messages,
    attachments,
    labels: LABELS.map((l) => ({ ...l, createdAt: at(6 * D + 4 * H) })),
    canned: CANNED.map((c) => ({ id: `cr-${c.shortCode}`, shortCode: c.shortCode, title: c.title, content: c.content, createdById: c.by, createdAt: at(6 * D + 4 * H), updatedAt: at(6 * D + 4 * H) })),
    calls: calls.sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1)),
    channels,
    chatMessages,
    driveLinks,
    activity: activityRows,
    notifications,
    audit,
    reads: {},
    // Anything a client wrote in the last two and a half hours shows as unread.
    readDefault: at(150),
    manualPresence: {},
    widgetSessions: {},
  };
}

/** Looks up the id of a seeded conversation by its script key (used by tests and the simulator). */
export function seededConversationOrder(): string[] {
  const firstAt = (msgs: MsgSeed[]) => Math.max(...msgs.map((m) => m.at));
  return [...CONVERSATIONS].sort((a, b) => firstAt(b.msgs) - firstAt(a.msgs)).map((c) => c.key);
}
