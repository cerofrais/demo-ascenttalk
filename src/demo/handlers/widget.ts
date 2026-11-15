/**
 * The website chat widget (routes/widget.ts). These routes are used by a visitor, not by a signed-in person,
 * so they are answered without a persona.
 *
 * The API identifies the visitor by an `x-visitor-token` header. The demo's request object carries no headers,
 * so the visitor of this browser is remembered in the saved state instead (one visitor per widget).
 */
import { broadcastMessage, hooks, ingestIncoming, publicWidgetMessage } from '../core';
import { filesFrom, storeUpload } from '../files';
import { HttpError, badRequest, invalid, optional, route } from '../http';
import { presenceOf } from '../realtime';
import { db, newId, nowIso, touch, type DAttachment, type DContact, type DInbox, type DMessage } from '../store';
import { identityKey } from '../util';

const TOKEN_PREFIX = 'demo-visitor.';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const threadId = (contactId: string) => `visitor:${contactId}`;

function widgetInbox(token: string): DInbox {
  const inbox = db().inboxes.find((i) => i.token === token);
  if (!inbox || inbox.channelType !== 'WEBSITE' || !inbox.enabled) throw new HttpError(404, 'Widget not found');
  return inbox;
}

function visitorOf(inbox: DInbox): DContact {
  const s = db();
  const contact = s.contacts.find((c) => c.id === s.widgetSessions[inbox.token]);
  if (!contact) throw new HttpError(401, 'Visitor session expired');
  return contact;
}

route(
  'GET',
  '/widget/:token/config',
  ({ params }) => {
    const s = db();
    const inbox = widgetInbox(params.token);
    const cfg = inbox.config ?? {};
    const team = inbox.teamId ? s.teams.find((t) => t.id === inbox.teamId) : undefined;
    const ids = [...new Set([...inbox.memberIds, ...(team?.memberIds ?? [])])];
    const agents = (ids.length ? s.users.filter((u) => ids.includes(u.id) && u.active) : s.users.filter((u) => u.active && ['ACCOUNT_MANAGER', 'MANAGER', 'ADMIN', 'OWNER'].includes(u.role))).slice(0, 20);
    return {
      name: inbox.name,
      agency: s.workspace.name,
      color: cfg.widgetColor ?? '#4f46e5',
      welcomeTitle: cfg.welcomeTitle ?? 'Hi there 👋',
      welcomeTagline: cfg.welcomeTagline ?? 'We usually reply in a few minutes.',
      greeting: inbox.greeting,
      requireEmail: cfg.requireEmail ?? true,
      online: agents.some((a) => presenceOf(a.id) === 'ONLINE'),
      agents: agents.slice(0, 3).map((a) => ({ name: a.name.split(' ')[0], avatarUrl: a.avatarUrl })),
    };
  },
  { open: true },
);

route(
  'POST',
  '/widget/:token/session',
  ({ params, body }) => {
    const s = db();
    const inbox = widgetInbox(params.token);
    const name = optional(body, 'name') ?? undefined;
    const email = optional(body, 'email') ?? undefined;
    const visitorToken = optional(body, 'visitorToken') ?? undefined;
    if (name && name.length > 80) throw invalid('name');
    if (email && !EMAIL_RE.test(email)) throw invalid('email');

    if (visitorToken?.startsWith(TOKEN_PREFIX)) {
      const contact = s.contacts.find((c) => c.id === visitorToken.slice(TOKEN_PREFIX.length));
      if (contact && contact.identities.some((i) => i.channelType === 'WEBSITE' && i.key.startsWith(`WEBSITE:${inbox.id}:`))) {
        if ((name && contact.name.startsWith('Visitor')) || (email && !contact.email)) {
          contact.name = name || contact.name;
          contact.email = email || contact.email;
          contact.updatedAt = nowIso();
        }
        s.widgetSessions[inbox.token] = contact.id;
        touch();
        return { visitorToken, contact: { name: name || contact.name, email: email || contact.email } };
      }
    }
    const visitorId = newId('v');
    let contact = email ? s.contacts.find((c) => c.email?.toLowerCase() === email.toLowerCase()) : undefined;
    if (!contact) {
      const now = nowIso();
      contact = { id: newId('ct'), name: name?.trim() || `Visitor ${visitorId.slice(-4).toUpperCase()}`, email: email?.toLowerCase() || null, phone: null, avatarUrl: null, clientId: null, roleAtClient: null, notes: null, customAttributes: {}, identities: [], createdAt: now, updatedAt: now };
      s.contacts.push(contact);
    }
    contact.identities.push({ id: newId('ci'), channelType: 'WEBSITE', identifier: visitorId, key: identityKey('WEBSITE', inbox.id, visitorId), createdAt: nowIso() });
    s.widgetSessions[inbox.token] = contact.id;
    touch();
    return { visitorToken: `${TOKEN_PREFIX}${contact.id}`, contact: { name: contact.name, email: contact.email } };
  },
  { open: true },
);

route(
  'GET',
  '/widget/:token/messages',
  ({ params }) => {
    const s = db();
    const inbox = widgetInbox(params.token);
    const contact = visitorOf(inbox);
    const conv = s.conversations.find((c) => c.inboxId === inbox.id && c.externalThreadId === threadId(contact.id));
    if (!conv) return { messages: [] };
    const messages = s.messages
      .filter((m) => m.conversationId === conv.id && m.kind === 'MESSAGE' && !m.deletedAt)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
      .slice(0, 200);
    return { messages: messages.map(publicWidgetMessage), status: conv.status };
  },
  { open: true },
);

route(
  'POST',
  '/widget/:token/messages',
  async ({ params, body, form }) => {
    const s = db();
    const inbox = widgetInbox(params.token);
    const contact = visitorOf(inbox);
    let content: string | null = null;
    const attachments: DAttachment[] = [];
    if (form) {
      const text = form.get('content');
      if (typeof text === 'string') content = text;
      for (const file of filesFrom(form)) attachments.push(await storeUpload(file, null));
    } else {
      if (typeof body.content !== 'string' || !body.content.length || body.content.length > 5000) throw invalid('content');
      content = body.content;
    }
    if (!content?.trim() && !attachments.length) throw badRequest('Message is empty');

    const existing = s.conversations.some((c) => c.inboxId === inbox.id && c.externalThreadId === threadId(contact.id));
    let pageUrl: string | null = null;
    try {
      pageUrl = document.referrer || null;
    } catch {
      /* no document */
    }
    const res = ingestIncoming({
      inbox,
      externalThreadId: threadId(contact.id),
      threadContact: contact,
      content: content?.trim() || null,
      senderName: contact.name,
      meta: { website: { pageUrl, userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null } },
      attachments,
    });
    // Greeting (auto-reply) on the very first message.
    if (!existing && inbox.greeting) {
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
    hooks.visitorMessage?.(res.conversation.id, res.message.id);
    return { message: publicWidgetMessage(res.message) };
  },
  { open: true },
);
