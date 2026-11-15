'use client';
import { useState } from 'react';
import { Download, File as FileIcon, FileSpreadsheet, FileText, Folder, Image as ImageIcon, Presentation, Video, X } from 'lucide-react';
import type { Attachment, DriveLinkMeta } from '@/lib/api';
import { bytes, cn, splitLinks } from '@/lib/utils';

/** Plain text with clickable links and highlighted @mentions. */
export function RichText({ text, className, mentionNames }: { text: string; className?: string; mentionNames?: string[] }) {
  const parts = splitLinks(text);
  const names = (mentionNames ?? []).filter(Boolean).sort((a, b) => b.length - a.length);
  const renderMentions = (t: string, key: number) => {
    if (!names.length || !t.includes('@')) return <span key={key}>{t}</span>;
    const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}|channel))`, 'g');
    return (
      <span key={key}>
        {t.split(re).map((seg, i) =>
          re.test(seg) || seg === '@channel' || names.some((n) => seg === `@${n}`) ? (
            <span key={i} className="rounded bg-primary-soft px-1 font-medium text-primary">
              {seg}
            </span>
          ) : (
            seg
          ),
        )}
      </span>
    );
  };
  return (
    <span className={cn('prose-msg break-words whitespace-pre-wrap', className)}>
      {parts.map((p, i) =>
        p.url ? (
          <a key={i} href={p.url} target="_blank" rel="noopener noreferrer">
            {p.text}
          </a>
        ) : (
          renderMentions(p.text, i)
        ),
      )}
    </span>
  );
}

const DRIVE_ICON: Record<string, { icon: typeof FileIcon; color: string; label: string }> = {
  folder: { icon: Folder, color: '#5f6368', label: 'Drive folder' },
  document: { icon: FileText, color: '#4285f4', label: 'Google Doc' },
  spreadsheet: { icon: FileSpreadsheet, color: '#0f9d58', label: 'Google Sheet' },
  presentation: { icon: Presentation, color: '#f4b400', label: 'Google Slides' },
  form: { icon: FileText, color: '#7248b9', label: 'Google Form' },
  pdf: { icon: FileText, color: '#ea4335', label: 'PDF on Drive' },
  image: { icon: ImageIcon, color: '#ea4335', label: 'Image on Drive' },
  video: { icon: Video, color: '#ea4335', label: 'Video on Drive' },
  file: { icon: FileIcon, color: '#5f6368', label: 'Google Drive file' },
};

export function DriveCard({ link, compact }: { link: { url: string; fileType?: string | null; title?: string | null }; compact?: boolean }) {
  const meta = DRIVE_ICON[link.fileType ?? 'file'] ?? DRIVE_ICON.file;
  const Icon = meta.icon;
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('flex max-w-sm items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-left no-underline transition-colors hover:border-border-strong', compact && 'py-1.5')}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ background: `${meta.color}1a`, color: meta.color }}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-fg">{link.title || meta.label}</span>
        <span className="block truncate text-[11px] text-fg-3">{link.title ? meta.label : 'Open in Google Drive'}</span>
      </span>
    </a>
  );
}

export function DriveLinks({ links }: { links?: DriveLinkMeta[] }) {
  if (!links?.length) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {links.map((l) => (
        <DriveCard key={l.url} link={l} />
      ))}
    </div>
  );
}

export function Attachments({ items, className }: { items: Attachment[]; className?: string }) {
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  if (!items?.length) return null;
  const images = items.filter((a) => a.kind === 'IMAGE');
  const rest = items.filter((a) => a.kind !== 'IMAGE');
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {!!images.length && (
        <div className={cn('grid gap-1', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {images.map((a) => (
            <button key={a.id} onClick={() => setLightbox(a)} className="overflow-hidden rounded-lg border border-border bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.fileName} loading="lazy" className="max-h-64 w-full max-w-xs object-cover" />
            </button>
          ))}
        </div>
      )}
      {rest.map((a) =>
        a.kind === 'AUDIO' ? (
          <audio key={a.id} controls preload="none" src={a.url} className="h-10 w-64 max-w-full" />
        ) : a.kind === 'VIDEO' ? (
          <video key={a.id} controls preload="metadata" src={a.url} className="max-h-64 max-w-xs rounded-lg border border-border" />
        ) : (
          <a key={a.id} href={`${a.url}&dl=1`} className="flex max-w-xs items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 no-underline hover:border-border-strong">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-fg-2">
              <FileIcon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-fg">{a.fileName}</span>
              <span className="block text-[11px] text-fg-3">{bytes(a.size)}</span>
            </span>
            <Download className="h-4 w-4 shrink-0 text-fg-3" />
          </a>
        ),
      )}
      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
          <a href={`${lightbox.url}&dl=1`} onClick={(e) => e.stopPropagation()} className="absolute top-4 right-16 rounded-full bg-white/10 p-2 text-white" aria-label="Download">
            <Download className="h-5 w-5" />
          </a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt={lightbox.fileName} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

export function PendingUploads({ items, onRemove }: { items: Attachment[]; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-2">
      {items.map((a) => (
        <span key={a.id} className="flex max-w-[220px] items-center gap-2 rounded-lg border border-border bg-surface-2 py-1 pr-1 pl-2 text-xs">
          {a.kind === 'IMAGE' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.url} alt="" className="h-6 w-6 rounded object-cover" />
          ) : (
            <FileIcon className="h-4 w-4 text-fg-3" />
          )}
          <span className="truncate">{a.fileName}</span>
          <button onClick={() => onRemove(a.id)} className="rounded p-0.5 text-fg-3 hover:bg-surface-3 hover:text-fg" aria-label={`Remove ${a.fileName}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
    </div>
  );
}
