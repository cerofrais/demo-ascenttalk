import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { differenceInMinutes, format, formatDistanceToNowStrict, isThisYear, isToday, isYesterday } from 'date-fns';
import type { ChannelType, Role } from './api';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeShort(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (differenceInMinutes(new Date(), d) < 1) return 'now';
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Yesterday';
  if (isThisYear(d)) return format(d, 'd MMM');
  return format(d, 'd MMM yy');
}

export function timeFull(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  return format(new Date(iso), 'd MMM yyyy, HH:mm');
}

export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function dayLabel(iso: string | Date): string {
  const d = new Date(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, isThisYear(d) ? 'EEEE, d MMMM' : 'd MMMM yyyy');
}

export function duration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return '–';
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60 ? `${s % 60}s` : ''}`.trim();
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

const PALETTE = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#ef4444', '#84cc16', '#06b6d4'];
export function colorFor(seed: string | null | undefined): string {
  let h = 0;
  for (const c of seed ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  ACCOUNT_MANAGER: 'Account Manager',
  MEMBER: 'Member',
  GUEST: 'Guest',
};

export const CHANNEL_LABEL: Record<ChannelType, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  VOICE: 'Phone',
  WEBSITE: 'Website chat',
  TELEGRAM: 'Telegram',
  FACEBOOK: 'Messenger',
  INSTAGRAM: 'Instagram',
  SMS: 'SMS',
};

export const isAdminRole = (r?: Role) => r === 'OWNER' || r === 'ADMIN';
export const isManagerRole = (r?: Role) => r === 'OWNER' || r === 'ADMIN' || r === 'MANAGER';

/** Replace {{contact.name}}-style variables in canned responses. */
export function fillTemplate(text: string, vars: Record<string, string | null | undefined>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

export function conversationTitle(c: { isGroup: boolean; groupName: string | null; contact: { name: string } | null; subject: string | null }) {
  return c.isGroup ? (c.groupName ?? 'Group') : (c.contact?.name ?? c.subject ?? 'Unknown');
}

const URL_RE = /(https?:\/\/[^\s<>"')]+)/g;
export function splitLinks(text: string): { text: string; url?: string }[] {
  const out: { text: string; url?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], url: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
