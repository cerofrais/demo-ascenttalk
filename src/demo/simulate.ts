/**
 * A little life, so the demo does not feel like a set of screenshots:
 *  - a reply sent to a client is delivered and read, the client "types" and answers a few seconds later;
 *  - every couple of minutes a new visitor starts a website chat (at most three per page load);
 *  - a teammate sometimes answers in a channel or DM the visitor just posted in;
 *  - a real person writing in the website widget gets an answer from the agency.
 *
 * Nothing here runs while the tab is hidden, and every timer looks its records up again by id when it fires,
 * because the state object can be replaced in between (another tab saved, or the demo was reset).
 */
import type { ChannelType } from '@/lib/api';
import { viewerFor } from './access';
import { broadcastMessage, hooks, ingestIncoming, sendAgentMessage } from './core';
import { postChatMessage, toggleReaction } from './handlers/chat';
import { conversationRooms, currentViewer, emit, rooms } from './realtime';
import { db, newId, nowIso, scaled, touch, type DContact, type DConversation, type DMessage } from './store';
import { identityKey, textToHtml } from './util';

// ─── Timing ──────────────────────────────────────────────────────────────────

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/** Runs `fn` now, or as soon as the tab is looked at again. */
function whenVisible(fn: () => void): void {
  if (!hidden() || typeof document.addEventListener !== 'function') return fn();
  const onChange = () => {
    if (hidden()) return;
    document.removeEventListener('visibilitychange', onChange);
    fn();
  };
  document.addEventListener('visibilitychange', onChange);
}

function later(ms: number, fn: () => void): void {
  setTimeout(() => whenVisible(fn), scaled(ms));
}

const between = (min: number, max: number) => min + Math.random() * (max - min);
const chance = (p: number) => Math.random() < p;

/** Picks from a pool without saying the same thing twice in a row in the same place. */
const lastPick = new Map<string, number>();
function pick<T>(key: string, pool: T[]): T {
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && lastPick.get(key) === i) i = (i + 1) % pool.length;
  lastPick.set(key, i);
  return pool[i];
}

// ─── What clients say back ───────────────────────────────────────────────────

const REPLIES: Partial<Record<ChannelType, string[]>> = {
  WHATSAPP: [
    'Thanks, that works for us. Please go ahead.',
    'Got it. Let me check with my team and confirm by this evening.',
    'Perfect, thank you for the quick turnaround!',
    'Looks good. Can you also share the timeline once it is locked?',
    'Noted. One small thing: can we keep the logo a little bigger in the final version?',
    'Thanks! I will share this with our founder and get back to you.',
  ],
  EMAIL: [
    'Hi,\n\nThanks for the update. This works for us, please go ahead.\n\nI will confirm the remaining details by tomorrow.\n\nBest regards,\n{first}',
    'Hi,\n\nReceived, thank you. I have shared it with our finance team and will come back once they have reviewed it.\n\nRegards,\n{first}',
    'Hello,\n\nThanks for getting back so quickly. Could you also send across the revised timeline when it is ready?\n\nThanks,\n{first}',
  ],
  WEBSITE: [
    'That helps, thank you! Could someone call me tomorrow morning?',
    'Great. What would a starter package cost for a small business?',
    'Thanks! I will fill in the brief and send it over today.',
    'Perfect. Is there a minimum contract period?',
  ],
  TELEGRAM: ['Thanks, noted!', 'Works for me. Send the final version when it is ready.', 'Great, appreciate the quick reply.', 'Understood. I will confirm the dates by tomorrow.'],
  FACEBOOK: ['Thank you so much! Sending my details now.', 'Great, that is what I wanted to know.', 'Thanks for the quick answer!'],
  INSTAGRAM: ['Thank you so much! Sending my details now.', 'Great, that is what I wanted to know.', 'Thanks! Is there an email I can send my portfolio to?'],
};

const GROUP_REPLIES = [
  'Thanks team, this looks good from our side.',
  'Sharing this internally now. Will come back with consolidated feedback.',
  'Great, please proceed. Loop me in on the final files.',
  'Noted, thank you. Can we review it together on the next call?',
];

/** conversation id → a client reply is already on its way */
const replyPending = new Set<string>();

/** A website chat whose other end is a person typing in the widget of this browser, not a made-up contact. */
function isRealVisitor(conv: DConversation): boolean {
  const s = db();
  const inbox = s.inboxes.find((i) => i.id === conv.inboxId);
  return Boolean(inbox && inbox.channelType === 'WEBSITE' && conv.contactId && s.widgetSessions[inbox.token] === conv.contactId && conv.externalThreadId === `visitor:${conv.contactId}`);
}

function setStatus(messageId: string, status: DMessage['status'], error: string | null = null): { message: DMessage; conversation: DConversation } | null {
  const s = db();
  const message = s.messages.find((m) => m.id === messageId);
  const conversation = message && s.conversations.find((c) => c.id === message.conversationId);
  if (!message || !conversation || message.deletedAt) return null;
  // never step backwards (a retry or another tab may have moved it on already)
  const order = ['PENDING', 'SENT', 'DELIVERED', 'READ'];
  if (status !== 'FAILED' && order.indexOf(message.status) >= order.indexOf(status)) return null;
  if (message.status === 'FAILED' && status !== 'SENT') return null;
  message.status = status;
  message.error = error;
  if (status === 'SENT' && !message.externalId) message.externalId = `sim:${newId('x')}`;
  touch();
  return { message, conversation };
}

/** The outbound queue and the provider's delivery receipts. */
function deliver(messageId: string, conversationId: string): void {
  const s = db();
  const conv = s.conversations.find((c) => c.id === conversationId);
  const inbox = conv && s.inboxes.find((i) => i.id === conv.inboxId);
  if (!conv || !inbox) return;
  const website = inbox.channelType === 'WEBSITE';

  if (!website && inbox.status !== 'connected') {
    later(900, () => {
      if (setStatus(messageId, 'FAILED', `${inbox.name} is not connected. Reconnect it in Settings, then retry.`)) broadcastMessage(conversationId, messageId, 'message.updated');
    });
    return;
  }
  const receipt = (status: 'DELIVERED' | 'READ') => () => {
    const hit = setStatus(messageId, status);
    if (hit) emit(conversationRooms(hit.conversation), 'message.status', { conversationId, messageId, status });
  };
  if (!website) {
    later(550, () => {
      if (setStatus(messageId, 'SENT')) broadcastMessage(conversationId, messageId, 'message.updated');
    });
  }
  // Email has no delivery receipts: it stays on "sent".
  if (inbox.channelType === 'EMAIL') return;
  later(website ? 700 : 1400, receipt('DELIVERED'));
  later(website ? 1900 : 2700, receipt('READ'));
}

function clientReply(conversationId: string): void {
  const s = db();
  const first = s.conversations.find((c) => c.id === conversationId);
  if (!first || first.status === 'RESOLVED' || replyPending.has(conversationId) || isRealVisitor(first)) return;
  const firstInbox = s.inboxes.find((i) => i.id === first.inboxId);
  if (!firstInbox || firstInbox.status !== 'connected' || !REPLIES[firstInbox.channelType]) return;

  replyPending.add(conversationId);
  const delay = between(5000, 9000);

  /** Looks everything up again: the conversation may have been resolved, reassigned or deleted meanwhile. */
  const current = () => {
    const state = db();
    const conv = state.conversations.find((c) => c.id === conversationId);
    const inbox = conv && state.inboxes.find((i) => i.id === conv.inboxId);
    if (!conv || !inbox || conv.status === 'RESOLVED' || !inbox.enabled || inbox.status !== 'connected') return null;
    const threadContact = conv.contactId ? (state.contacts.find((c) => c.id === conv.contactId) ?? null) : null;
    let sender: DContact | null = threadContact;
    if (conv.isGroup) {
      // in a group, someone from the client side answers: the person who wrote last, or anyone from the client
      const lastIncoming = [...state.messages].reverse().find((m) => m.conversationId === conv.id && m.direction === 'INCOMING' && m.senderContactId);
      sender = state.contacts.find((c) => c.id === lastIncoming?.senderContactId) ?? state.contacts.find((c) => conv.clientId !== null && c.clientId === conv.clientId) ?? threadContact;
    }
    return { conv, inbox, threadContact, sender };
  };

  later(delay - 2300, () => {
    const now = current();
    if (!now) return;
    const payload = now.inbox.channelType === 'WEBSITE' ? { scope: 'conversation', id: conversationId, contact: true } : { scope: 'conversation', id: conversationId, userId: 'contact', name: now.sender?.name ?? now.conv.groupName ?? 'Contact' };
    emit(rooms.conversation(conversationId), 'typing', payload);
  });
  later(delay, () => {
    replyPending.delete(conversationId);
    const now = current();
    if (!now) return;
    const { conv, inbox, threadContact, sender } = now;
    const pool = conv.isGroup ? GROUP_REPLIES : REPLIES[inbox.channelType]!;
    const firstName = (sender?.name ?? 'Team').split(' ')[0];
    const content = pick(conversationId, pool).replace('{first}', firstName);
    const email = inbox.channelType === 'EMAIL';
    ingestIncoming({
      inbox,
      externalThreadId: conv.externalThreadId ?? `sim:${conv.id}`,
      conversationId: conv.id,
      threadContact,
      sender,
      senderName: sender?.name ?? null,
      content,
      contentHtml: email ? textToHtml(content) : null,
      meta: email ? { email: { subject: conv.subject ? `Re: ${conv.subject.replace(/^(re:\s*)+/i, '')}` : null, from: sender?.email ?? null, to: [inbox.config?.email ?? null].filter(Boolean), cc: [] } } : undefined,
    });
  });
}

// ─── New website visitors ────────────────────────────────────────────────────

const VISITORS = [
  { name: 'Kiran Bose', email: 'kiran@saffronbakehouse.example', page: '/services/social-media', text: 'Hi! We run three bakery outlets and want help with social media and local ads. Do you work with small food brands?' },
  { name: 'Tara Nair', email: 'tara@bluekitestudio.example', page: '/work', text: 'Hello, I am looking for a quote for a product launch video, around 45 seconds. Who should I speak to?' },
  { name: 'Rohit Sen', email: 'rohit@peppercornhotels.example', page: '/services/performance', text: 'Do you handle performance marketing for boutique hotels? We want more direct bookings before the winter season.' },
  { name: 'Maya Pinto', email: 'maya@littlefernbooks.example', page: '/pricing', text: 'Hi, we publish books for children. Can you share your pricing for a three month content retainer?' },
  { name: 'Aman Khurana', email: 'aman@northgatecycles.example', page: '/work/fitness', text: 'Hey, I saw your work for a fitness brand. Could you do something similar for our cycle stores?' },
];

const MAX_VISITORS_PER_PAGE = 3;
let visitorsSent = 0;

function newVisitor(): boolean {
  const s = db();
  const inbox = s.inboxes.find((i) => i.id === 'ib-web' && i.enabled && i.status === 'connected') ?? s.inboxes.find((i) => i.channelType === 'WEBSITE' && i.enabled && i.status === 'connected');
  const seed = VISITORS.find((v) => !s.contacts.some((c) => c.email === v.email));
  if (!inbox || !seed) return false;
  const now = nowIso();
  const visitorId = newId('v');
  const contact: DContact = { id: newId('ct'), name: seed.name, email: seed.email, phone: null, avatarUrl: null, clientId: null, roleAtClient: null, notes: null, customAttributes: {}, identities: [], createdAt: now, updatedAt: now };
  contact.identities.push({ id: newId('ci'), channelType: 'WEBSITE', identifier: visitorId, key: identityKey('WEBSITE', inbox.id, visitorId), createdAt: now });
  s.contacts.push(contact);
  const website = typeof inbox.config?.websiteUrl === 'string' ? inbox.config.websiteUrl.replace(/\/$/, '') : 'https://orbitmedia.example';
  const res = ingestIncoming({ inbox, externalThreadId: `visitor:${contact.id}`, threadContact: contact, content: seed.text, senderName: contact.name, meta: { website: { pageUrl: `${website}${seed.page}`, userAgent: null } } });
  if (inbox.greeting) {
    const greet: DMessage = {
      id: newId('m'),
      conversationId: res.conversation.id,
      direction: 'OUTGOING',
      kind: 'MESSAGE',
      senderUserId: null,
      senderContactId: null,
      senderName: inbox.name,
      content: inbox.greeting,
      contentHtml: null,
      externalId: null,
      replyToId: null,
      status: 'SENT',
      error: null,
      mentions: [],
      meta: {},
      attachmentIds: [],
      callId: null,
      createdAt: new Date(Date.parse(res.message.createdAt) + 1).toISOString(),
      editedAt: null,
      deletedAt: null,
    };
    s.messages.push(greet);
    touch();
    broadcastMessage(res.conversation.id, greet.id);
  }
  return true;
}

function scheduleVisitor(): void {
  if (visitorsSent >= MAX_VISITORS_PER_PAGE) return;
  later(between(120_000, 180_000), () => {
    // only where someone is signed in: the widget frame itself runs this code too, without a persona
    if (currentViewer() && newVisitor()) visitorsSent++;
    scheduleVisitor();
  });
}

// ─── Teammates in team chat ──────────────────────────────────────────────────

const CHANNEL_REPLIES = [
  'On it.',
  'Sounds good, thanks for the heads up.',
  'Give me ten minutes, just wrapping up a call.',
  'Agreed. Let us lock it and move on.',
  'Noted. I will pick this up right after lunch.',
  'Makes sense to me. Shout if you need a second pair of eyes.',
  'Thanks! Adding it to my list for today.',
];
const DM_REPLIES = ['Sure, give me five minutes.', 'Yes, works for me.', 'Got it, thanks for letting me know.', 'Let me check and come back to you.', 'Done. Have a look when you get a moment.'];

/** channel id → a teammate is already answering */
const chatPending = new Set<string>();

function teammateReacts(messageId: string, channelId: string, authorId: string): void {
  const s = db();
  const channel = s.channels.find((c) => c.id === channelId);
  const posted = s.chatMessages.find((m) => m.id === messageId);
  if (!channel || !posted || channel.archived || chatPending.has(channelId)) return;
  const direct = channel.kind === 'DM' || channel.kind === 'GROUP_DM';
  const candidates = channel.members.map((m) => s.users.find((u) => u.id === m.userId)).filter((u): u is NonNullable<typeof u> => Boolean(u && u.active && u.id !== authorId && u.presence !== 'OFFLINE'));
  if (!candidates.length) return;
  // someone who was mentioned answers; otherwise a DM is usually answered and a channel post sometimes
  const mentioned = candidates.filter((u) => posted.mentions.includes(u.id));
  if (!mentioned.length && !chance(direct ? 0.85 : 0.6)) return;
  const who = (mentioned.length ? mentioned : candidates)[Math.floor(Math.random() * (mentioned.length || candidates.length))];
  const reactOnly = !mentioned.length && !direct && chance(0.3);

  chatPending.add(channelId);
  const delay = between(4000, 8000);
  const current = () => {
    const state = db();
    const ch = state.channels.find((c) => c.id === channelId);
    const original = state.chatMessages.find((m) => m.id === messageId);
    const user = state.users.find((u) => u.id === who.id && u.active);
    if (!ch || !original || original.deletedAt || !user || !ch.members.some((m) => m.userId === user.id)) return null;
    return { ch, original, user };
  };
  if (!reactOnly) {
    later(delay - 2200, () => {
      const now = current();
      if (now) emit(rooms.channel(channelId), 'typing', { scope: 'channel', id: channelId, userId: now.user.id, name: now.user.name });
    });
  }
  later(reactOnly ? delay / 2 : delay, () => {
    chatPending.delete(channelId);
    const now = current();
    if (!now) return;
    if (reactOnly) {
      if (!now.original.reactions.some((r) => r.userId === now.user.id)) toggleReaction(now.user.id, now.original, '👍');
      return;
    }
    postChatMessage({ id: now.user.id, name: now.user.name }, now.ch, { content: pick(channelId, direct ? DM_REPLIES : CHANNEL_REPLIES), parentId: now.original.parentId });
  });
}

// ─── The agency answering a real person in the website widget ────────────────

const AGENT_REPLIES = [
  'Thanks, that is helpful. I will put together a few options and share them here shortly.',
  'Got it. Would a short call tomorrow work? I can walk you through how we usually start.',
  'Happy to help with that. Could you share your website or social handle so I can take a look first?',
  'Understood. Let me check with the team and come back to you in a few minutes.',
];

const visitorPending = new Set<string>();

function agencyAnswers(conversationId: string, messageId: string): void {
  if (visitorPending.has(conversationId)) return;
  // Someone who is not one of the six demo roles, so the reply never comes "from" the person watching.
  const agentId = ['u-neha', 'u-sara', 'u-vikram'].find((id) => db().users.some((u) => u.id === id && u.active));
  if (!agentId) return;
  visitorPending.add(conversationId);
  const delay = between(4500, 7500);
  const current = () => {
    const s = db();
    const conv = s.conversations.find((c) => c.id === conversationId);
    const visitorMessage = s.messages.find((m) => m.id === messageId);
    const agent = s.users.find((u) => u.id === agentId && u.active);
    if (!conv || !visitorMessage || !agent) return null;
    // a person on the team already answered (from another tab): nothing to add
    const answered = s.messages.some((m) => m.conversationId === conv.id && m.direction === 'OUTGOING' && m.kind === 'MESSAGE' && m.senderUserId && m.createdAt > visitorMessage.createdAt);
    return answered ? null : { conv, agent, s };
  };
  later(delay - 2400, () => {
    const now = current();
    if (now?.conv.contactId) emit(rooms.visitor(now.conv.contactId), 'widget.typing', { name: now.agent.name.split(' ')[0] });
  });
  later(delay, () => {
    visitorPending.delete(conversationId);
    const now = current();
    if (!now) return;
    const { conv, agent, s } = now;
    const firstAnswer = !s.messages.some((m) => m.conversationId === conv.id && m.direction === 'OUTGOING' && m.senderUserId);
    const visitor = s.contacts.find((c) => c.id === conv.contactId);
    const hello = visitor && !visitor.name.startsWith('Visitor') ? `Hi ${visitor.name.split(' ')[0]}` : 'Hi';
    const content = firstAnswer ? `${hello}, thanks for writing in! I am ${agent.name.split(' ')[0]} from the accounts team. Could you tell me a little more about what you have in mind?` : pick(`agent:${conversationId}`, AGENT_REPLIES);
    try {
      sendAgentMessage(viewerFor(agent, s), conv.id, { content });
    } catch {
      /* the inbox was disabled meanwhile */
    }
  });
}

// ─── Wiring ──────────────────────────────────────────────────────────────────

let started = false;

/** Called on the first request of a page. */
export function startLife(): void {
  if (started) return;
  started = true;
  hooks.agentMessageSent = (message, conversation) => {
    deliver(message.id, conversation.id);
    clientReply(conversation.id);
  };
  hooks.chatMessagePosted = (messageId, channelId, userId) => {
    if (userId === currentViewer()?.id) teammateReacts(messageId, channelId, userId);
  };
  hooks.visitorMessage = agencyAnswers;
  scheduleVisitor();
}
