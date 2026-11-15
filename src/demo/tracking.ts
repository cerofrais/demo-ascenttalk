/**
 * WhatsApp tracking rules for the demo, shared by the mock's endpoints (handlers/whatsapp-tracking.ts) and its
 * send and start-conversation paths (core.ts). Mirrors apps/api/src/channels/whatsapp-sync*.ts.
 * Every number here is fictional (+1 202 555 01xx).
 */
import type { ChatPolicy, GroupPolicy } from '@/components/settings/whatsapp-tracking';
import { isAdmin, type Viewer } from './access';
import { forbidden } from './http';
import { db, type DInbox, type DemoState } from './store';

export interface DTracking {
  chats: ChatPolicy;
  groups: GroupPolicy;
  allow: string[];
  block: string[];
  /** Chats that wrote while not tracked: name and time only. */
  skipped: Record<string, { name: string | null; at: string }>;
}

export const H = 3600_000;

/** The personal side of the demo phone: chats an agency should never see unless the owner says so. */
export const PERSONAL_CHATS: { n: number; name: string; wrote?: number }[] = [
  { n: 170, name: 'Mum', wrote: 2 },
  { n: 171, name: 'Ravi (cousin)' },
  { n: 172, name: 'Neha', wrote: 26 },
  { n: 173, name: 'Building plumber' },
  { n: 174, name: 'Dr. Iyer clinic' },
  { n: 175, name: 'Kabir from college' },
  { n: 176, name: 'Saanvi Rao', wrote: 5 },
  { n: 177, name: 'Car service centre' },
];
export const PERSONAL_GROUPS: { id: string; name: string; size: number; community?: boolean; wrote?: number }[] = [
  { id: '120363999900000001@g.us', name: 'Family', size: 14, wrote: 1 },
  { id: '120363999900000002@g.us', name: 'Weekend cricket', size: 22 },
  { id: '120363999900000003@g.us', name: 'Lakeview Residents', size: 212, community: true, wrote: 3 },
  { id: '120363999900000004@g.us', name: 'College batch 2014', size: 87 },
  { id: '120363999900000005@g.us', name: 'Agency founders circle', size: 41, wrote: 30 },
];

export const phoneJid = (phone: string | null | undefined) => {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? `${digits}@s.whatsapp.net` : null;
};
export const jidPhone = (jid: string) => (jid.endsWith('@s.whatsapp.net') ? `+${jid.split('@')[0]}` : null);
export const isGroupJid = (jid: string) => /^[\w.-]+@g\.us$/.test(jid);
export const isChatJid = (jid: string) => /^\d{6,20}@s\.whatsapp\.net$/.test(jid) || /^[\w.-]+@lid$/.test(jid);
export const normalize = (jid: unknown): string | null => {
  if (typeof jid !== 'string') return null;
  const at = jid.lastIndexOf('@');
  if (at < 1) return null;
  const clean = `${jid.slice(0, at).split(':')[0]}${jid.slice(at)}`;
  return isGroupJid(clean) || isChatJid(clean) ? clean : null;
};

export function groupConversations(s: DemoState, inbox: DInbox) {
  return s.conversations.filter((c) => c.inboxId === inbox.id && c.isGroup && c.externalThreadId);
}

/** The demo number starts out set up the way an agency would: client contacts, and its client groups. */
export function initialTracking(s: DemoState, inbox: DInbox): DTracking {
  // every chat already in the inbox stays tracked, so the demo starts with nothing "outside"
  const allow = s.conversations.filter((c) => c.inboxId === inbox.id && c.externalThreadId).map((c) => c.externalThreadId!);
  const skipped: DTracking['skipped'] = {};
  for (const p of PERSONAL_CHATS) if (p.wrote) skipped[`120255501${p.n - 100}@s.whatsapp.net`] = { name: p.name, at: new Date(s.baseTime - p.wrote * H).toISOString() };
  for (const g of PERSONAL_GROUPS) if (g.wrote) skipped[g.id] = { name: null, at: new Date(s.baseTime - g.wrote * H).toISOString() };
  return { chats: 'clients', groups: 'approved', allow: [...new Set(allow)], block: [], skipped };
}

export function trackingFor(inbox: DInbox, s: DemoState = db()): DTracking {
  s.whatsappTracking ??= {};
  return (s.whatsappTracking[inbox.id] ??= initialTracking(s, inbox));
}

export const ownerId = (inbox: DInbox): string | null => (typeof inbox.config?.ownerId === 'string' && inbox.config.ownerId) || null;
export const canManage = (me: Viewer, inbox: DInbox) => (ownerId(inbox) ? ownerId(inbox) === me.id : isAdmin(me));

export function isClientJid(s: DemoState, jid: string): boolean {
  const phone = jidPhone(jid);
  return Boolean(phone && s.contacts.some((c) => c.clientId && c.phone && c.phone.replace(/[^\d+]/g, '') === phone));
}

export function decide(t: DTracking, jid: string): 'yes' | 'no' | 'clients' {
  if (t.block.includes(jid)) return 'no';
  if (t.allow.includes(jid)) return 'yes';
  const policy = isGroupJid(jid) ? t.groups : t.chats;
  return policy === 'all' ? 'yes' : policy === 'clients' ? 'clients' : 'no';
}

/** Mirrors whatsappSyncAllows in the API. */
export function demoTracks(inbox: DInbox, jid: string | null, s: DemoState = db()): boolean {
  if (inbox.channelType !== 'WHATSAPP') return true;
  const id = normalize(jid);
  if (!id) return false;
  const d = decide(trackingFor(inbox, s), id);
  return d === 'yes' || (d === 'clients' && isClientJid(s, id));
}

export const NOT_TRACKED = 'Not sent: this chat is not one this WhatsApp number tracks. Approve it under Settings, WhatsApp tracking, then send again.';

/**
 * Mirrors approveForNewConversation: starting a chat approves it, if the person starting it decides for the
 * number. Returns true when it approved something (the caller records it in the audit log).
 */
export function approveForNewConversation(me: Viewer, inbox: DInbox, threadId: string): boolean {
  if (inbox.channelType !== 'WHATSAPP' || demoTracks(inbox, threadId)) return false;
  if (!canManage(me, inbox)) {
    const owner = db().users.find((u) => u.id === ownerId(inbox));
    throw forbidden(`${inbox.name} only talks to approved chats, and this number is not approved yet. Ask ${owner?.name ?? 'an admin'} to approve it.`);
  }
  const t = trackingFor(inbox);
  const jid = normalize(threadId)!;
  t.allow = [...new Set([...t.allow, jid])];
  t.block = t.block.filter((j) => j !== jid);
  return true;
}
