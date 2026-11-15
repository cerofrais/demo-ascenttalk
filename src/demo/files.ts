/**
 * Uploaded files. There is no object storage in the demo: small uploads are kept in the saved state as data:
 * URLs (so they survive a reload), larger ones only as a blob: URL for the current page.
 *
 * The UI appends `&dl=1` to attachment URLs for its download links (the API's signed URLs carry a query
 * string). To keep those links working, every URL handed out here either has a query string already (static
 * sample files) or ends in a `#fragment`, which browsers ignore when resolving blob: and data: URLs.
 */
import type { Attachment } from '@/lib/api';
import { assetUrl } from './content';
import { badRequest } from './http';
import { KEEP_UPLOAD_BYTES, db, newId, nowIso, touch, type DAttachment } from './store';
import { attachmentKind, safeFileName } from './util';

/** attachment id → blob: URL created on this page. */
const blobUrls = new Map<string, string>();

const EXPIRED_URL = assetUrl('upload-expired.svg');

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  try {
    const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: m[1] || 'application/octet-stream' });
  } catch {
    return null;
  }
}

function objectUrl(blob: Blob): string | null {
  try {
    return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

/** Files posted under `field` in a multipart body (the API reads them with @fastify/multipart). */
export function filesFrom(form: FormData | null, field?: string): File[] {
  if (!form) return [];
  const out: File[] = [];
  form.forEach((value, key) => {
    if ((!field || key === field) && typeof value !== 'string') out.push(value as File);
  });
  return out;
}

async function toDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return `data:${file.type || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`;
}

/** POST /uploads: one unattached Attachment row per file, owned by the uploader until it is sent. */
export async function storeUpload(file: File, uploadedById: string | null): Promise<DAttachment> {
  const mimeType = file.type || 'application/octet-stream';
  const row: DAttachment = {
    id: newId('att'),
    fileName: safeFileName(file.name || 'upload'),
    mimeType,
    size: file.size,
    kind: attachmentKind(mimeType),
    uploadedById,
    messageId: null,
    chatMessageId: null,
    createdAt: nowIso(),
  };
  if (file.size <= KEEP_UPLOAD_BYTES) row.dataUrl = await toDataUrl(file);
  const url = objectUrl(file);
  if (url) blobUrls.set(row.id, url);
  else if (!row.dataUrl) throw badRequest('This browser cannot keep a file of this size in the demo');
  db().attachments.push(row);
  touch();
  return row;
}

/** A URL the browser can load for this attachment right now. */
export function attachmentUrl(a: DAttachment): string {
  if (a.url) return a.url;
  let blob = blobUrls.get(a.id);
  if (!blob && a.dataUrl) {
    // kept from an earlier page view (or made in another tab): revive it as a blob so links can open it
    const revived = dataUrlToBlob(a.dataUrl);
    const url = revived ? objectUrl(revived) : null;
    if (url) {
      blobUrls.set(a.id, url);
      blob = url;
    } else return `${a.dataUrl}#file`;
  }
  return blob ? `${blob}#file` : EXPIRED_URL;
}

export function serializeAttachment(a: DAttachment): Attachment {
  return { id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size, kind: a.kind, url: attachmentUrl(a), createdAt: a.createdAt };
}

/** claimUploads(): the caller's own uploads that are not attached to anything yet. */
export function claimUploads(attachmentIds: unknown, userId: string): DAttachment[] {
  if (!Array.isArray(attachmentIds) || !attachmentIds.length) return [];
  return db().attachments.filter((a) => attachmentIds.includes(a.id) && a.uploadedById === userId && !a.messageId && !a.chatMessageId);
}

/** Avatars and logos are plain image URLs on the record: a data: URL when small, else a blob: URL for this page. */
export async function imageUrlFor(file: File): Promise<string> {
  if (file.size <= KEEP_UPLOAD_BYTES) return toDataUrl(file);
  const url = objectUrl(file);
  if (!url) throw badRequest('This image is too large to keep in the demo');
  return url;
}

export function forgetBlobUrls(): void {
  blobUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  });
  blobUrls.clear();
}
