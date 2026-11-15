/** Small pure helpers shared by the data generator and the request handlers (mirrors of the API's lib/ helpers). */
import type { ChannelType, DriveLinkMeta } from '@/lib/api';

/** Deterministic pseudo-random numbers in [0, 1), so the generated data set is identical on every first load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same text the API stores as a conversation's last message preview. */
export function preview(text: string | null | undefined, attachments: { kind: string }[] = [], kind = 'MESSAGE'): string {
  if (kind === 'CALL') return '📞 Call';
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (t) return t.slice(0, 140);
  const a = attachments[0];
  if (!a) return '';
  return ({ IMAGE: '📷 Photo', VIDEO: '🎬 Video', AUDIO: '🎤 Audio', FILE: '📎 File' } as Record<string, string>)[a.kind] ?? '📎 Attachment';
}

const DRIVE_RE = /https?:\/\/(?:drive|docs)\.google\.com\/[^\s<>"')]+/gi;

export function extractDriveLinks(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...new Set(text.match(DRIVE_RE) ?? [])].slice(0, 5);
}

export function parseDriveUrl(url: string): { url: string; fileId: string | null; fileType: string } {
  let fileType = 'file';
  if (/\/folders\//.test(url)) fileType = 'folder';
  else if (/\/document\//.test(url)) fileType = 'document';
  else if (/\/spreadsheets\//.test(url)) fileType = 'spreadsheet';
  else if (/\/presentation\//.test(url)) fileType = 'presentation';
  else if (/\/forms\//.test(url)) fileType = 'form';
  const m = url.match(/\/(?:d|folders)\/([a-zA-Z0-9_-]{10,})/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return { url, fileId: m?.[1] ?? null, fileType };
}

/** Drive link cards for a message. Titles are only known for the links that ship with the demo data. */
export function driveMetaFor(text: string | null | undefined, titles: Record<string, string> = {}): DriveLinkMeta[] {
  return extractDriveLinks(text).map((url) => ({ ...parseDriveUrl(url), title: titles[url] ?? null }));
}

export function callLabel(c: { direction: string; status: string; durationSec: number | null }): string {
  const dir = c.direction === 'INBOUND' ? 'Incoming' : 'Outgoing';
  const dur = c.durationSec ? ` · ${Math.floor(c.durationSec / 60)}m ${c.durationSec % 60}s` : '';
  const map: Record<string, string> = {
    MISSED: 'Missed call',
    VOICEMAIL: 'Voicemail',
    NO_ANSWER: `${dir} call · no answer`,
    BUSY: `${dir} call · busy`,
    FAILED: `${dir} call · failed`,
    RINGING: `${dir} call · ringing`,
    IN_PROGRESS: `${dir} call · in progress`,
    QUEUED: `${dir} call`,
  };
  return map[c.status] ?? `${dir} call${dur}`;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  if (digits.length < 6) return null;
  return `+${digits}`;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  return /.+@.+\..+/.test(e) ? e : null;
}

export const identityKey = (type: ChannelType, scope: string, identifier: string) => `${type}:${scope}:${identifier}`;

export function attachmentKind(mime: string): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  return 'FILE';
}

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim();
  return (cleaned || 'file').slice(0, 180);
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Plain text → the simple HTML an email client would have sent. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</p>`)
    .join('');
}

export const includesText = (haystack: string | null | undefined, needle: string) => (haystack ?? '').toLowerCase().includes(needle.toLowerCase());

/** Local midnight of the day a timestamp falls on. */
export function startOfDay(msTime: number): number {
  const d = new Date(msTime);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
