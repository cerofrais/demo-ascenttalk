'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Mic, Paperclip, SendHorizontal, Smile, Square, X } from 'lucide-react';
import { api, type Attachment, type UserBrief } from '@/lib/api';
import { cn, fillTemplate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, Tooltip } from '@/components/ui/menu';
import { PendingUploads } from './content';

const EMOJI = '😀 😂 😊 😍 🙏 👍 👏 🙌 🔥 🎉 ✅ ❌ ❤️ 💯 🤝 👀 🤔 😅 😎 🚀 📎 📞 📅 ⏰ 💡 ⚠️ ✨ 🙂 😢 👋'.split(' ');

export interface ComposerPayload {
  content: string;
  attachmentIds: string[];
  mentions: string[];
}

interface Props {
  placeholder?: string;
  onSend: (p: ComposerPayload) => Promise<unknown>;
  mentionUsers?: UserBrief[];
  allowChannelMention?: boolean;
  canned?: boolean;
  cannedVars?: Record<string, string | null | undefined>;
  onTyping?: () => void;
  disabled?: boolean;
  disabledReason?: ReactNode;
  tone?: 'default' | 'note';
  header?: ReactNode;
  footerLeft?: ReactNode;
  allowAttachments?: boolean;
  allowVoiceNote?: boolean;
  autoFocus?: boolean;
  draftKey?: string;
  sendLabel?: string;
}

const drafts = new Map<string, string>();

export function Composer({
  placeholder = 'Write a message…',
  onSend,
  mentionUsers = [],
  allowChannelMention,
  canned,
  cannedVars,
  onTyping,
  disabled,
  disabledReason,
  tone = 'default',
  header,
  footerLeft,
  allowAttachments = true,
  allowVoiceNote,
  autoFocus,
  draftKey,
  sendLabel,
}: Props) {
  const [text, setText] = useState(() => (draftKey ? (drafts.get(draftKey) ?? '') : ''));
  const [uploads, setUploads] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState<{ type: 'mention' | 'canned'; query: string; start: number } | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const lastTyping = useRef(0);

  // Reset when switching conversation/channel.
  useEffect(() => {
    setText(draftKey ? (drafts.get(draftKey) ?? '') : '');
    setUploads([]);
    setMenu(null);
  }, [draftKey]);
  useEffect(() => {
    if (draftKey) drafts.set(draftKey, text);
  }, [text, draftKey]);
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const { data: cannedData } = useQuery({
    queryKey: ['canned-responses'],
    queryFn: () => api.get<{ cannedResponses: { id: string; shortCode: string; title: string | null; content: string }[] }>('/canned-responses'),
    enabled: Boolean(canned),
    staleTime: 5 * 60_000,
  });

  const options = useMemo(() => {
    if (!menu) return [];
    const q = menu.query.toLowerCase();
    if (menu.type === 'mention') {
      const users = mentionUsers.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 7);
      const all = allowChannelMention && 'channel'.startsWith(q) ? [{ id: 'channel', name: 'channel', avatarUrl: null, title: 'Notify everyone here' } as UserBrief] : [];
      return [...all, ...users].map((u) => ({ key: u.id, label: u.name, sub: u.title ?? null, user: u }));
    }
    return (cannedData?.cannedResponses ?? [])
      .filter((c) => c.shortCode.toLowerCase().includes(q) || (c.title ?? '').toLowerCase().includes(q))
      .slice(0, 7)
      .map((c) => ({ key: c.id, label: `/${c.shortCode}`, sub: c.content, canned: c }));
  }, [menu, mentionUsers, cannedData, allowChannelMention]);

  const onChange = (value: string, caret: number) => {
    setText(value);
    if (onTyping && Date.now() - lastTyping.current > 2500) {
      lastTyping.current = Date.now();
      onTyping();
    }
    const before = value.slice(0, caret);
    const at = before.match(/(^|\s)@([\w .-]{0,30})$/);
    if (at && (mentionUsers.length || allowChannelMention)) {
      setMenu({ type: 'mention', query: at[2], start: caret - at[2].length - 1 });
      setMenuIndex(0);
      return;
    }
    const slash = canned ? value.match(/^\/([\w-]{0,40})$/) : null;
    if (slash) {
      setMenu({ type: 'canned', query: slash[1], start: 0 });
      setMenuIndex(0);
      return;
    }
    setMenu(null);
  };

  const pick = (opt: (typeof options)[number]) => {
    if (!menu) return;
    if ('canned' in opt && opt.canned) {
      setText(fillTemplate(opt.canned.content, cannedVars ?? {}));
    } else if ('user' in opt && opt.user) {
      const caret = ta.current?.selectionStart ?? text.length;
      const next = `${text.slice(0, menu.start)}@${opt.user.name} ${text.slice(caret)}`;
      setText(next);
    }
    setMenu(null);
    requestAnimationFrame(() => ta.current?.focus());
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    try {
      const res = await api.upload(list);
      setUploads((u) => [...u, ...res.attachments]);
    } catch (err: any) {
      toast.error(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    const content = text.trim();
    if ((!content && !uploads.length) || sending || uploading || disabled) return;
    const mentions = [
      ...mentionUsers.filter((u) => content.includes(`@${u.name}`)).map((u) => u.id),
      ...(allowChannelMention && /(^|\s)@channel\b/.test(content) ? ['channel'] : []),
    ];
    setSending(true);
    try {
      await onSend({ content, attachmentIds: uploads.map((u) => u.id), mentions });
      setText('');
      setUploads([]);
      if (draftKey) drafts.delete(draftKey);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not send');
    } finally {
      setSending(false);
      requestAnimationFrame(() => ta.current?.focus());
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const type = (rec.mimeType || 'audio/webm').split(';')[0];
        const file = new File(chunks, `voice-note.${type.includes('ogg') ? 'ogg' : 'webm'}`, { type });
        void addFiles([file]);
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error('Microphone permission is needed to record a voice note');
    }
  };

  if (disabled && disabledReason) {
    return <div className="border-t border-border bg-surface-2 px-4 py-3 text-center text-sm text-fg-3">{disabledReason}</div>;
  }

  return (
    <div
      className={cn('relative border-t border-border', tone === 'note' ? 'bg-note' : 'bg-surface', dragOver && 'ring-2 ring-primary ring-inset')}
      onDragOver={(e) => {
        if (allowAttachments && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!allowAttachments) return;
        e.preventDefault();
        setDragOver(false);
        void addFiles(e.dataTransfer.files);
      }}
    >
      {header}
      {menu && options.length > 0 && (
        <div className="absolute right-3 bottom-full left-3 z-20 mb-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-pop">
          {options.map((o, i) => (
            <button
              key={o.key}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setMenuIndex(i)}
              className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left', i === menuIndex && 'bg-surface-2')}
            >
              {'user' in o && o.user && o.user.id !== 'channel' && <Avatar name={o.user.name} src={o.user.avatarUrl} size="xs" />}
              <span className="shrink-0 text-[13px] font-medium">{'user' in o && o.user ? `@${o.label}` : o.label}</span>
              {o.sub && <span className="truncate text-xs text-fg-3">{o.sub}</span>}
            </button>
          ))}
        </div>
      )}
      <PendingUploads items={uploads} onRemove={(id) => setUploads((u) => u.filter((x) => x.id !== id))} />
      <textarea
        ref={ta}
        value={text}
        rows={1}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
        onPaste={(e) => {
          if (allowAttachments && e.clipboardData.files.length) {
            e.preventDefault();
            void addFiles(e.clipboardData.files);
          }
        }}
        onKeyDown={(e) => {
          if (menu && options.length) {
            if (e.key === 'ArrowDown') return e.preventDefault(), setMenuIndex((i) => (i + 1) % options.length);
            if (e.key === 'ArrowUp') return e.preventDefault(), setMenuIndex((i) => (i - 1 + options.length) % options.length);
            if (e.key === 'Enter' || e.key === 'Tab') return e.preventDefault(), pick(options[menuIndex]);
            if (e.key === 'Escape') return e.preventDefault(), setMenu(null);
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            // On touch devices Enter inserts a newline; the send button sends.
            if (window.matchMedia('(pointer: coarse)').matches) return;
            e.preventDefault();
            void send();
          }
        }}
        className="block max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm outline-none placeholder:text-fg-3"
      />
      <div className="flex items-center gap-1 px-2 pb-2">
        {allowAttachments && (
          <>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files).then(() => (e.target.value = ''))} />
            <Tooltip content="Attach files">
              <Button variant="ghost" size="icon-sm" onClick={() => fileInput.current?.click()} loading={uploading} aria-label="Attach files">
                {!uploading && <Paperclip className="h-4 w-4" />}
              </Button>
            </Tooltip>
          </>
        )}
        <Popover
          side="top"
          className="w-64"
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Emoji">
              <Smile className="h-4 w-4" />
            </Button>
          }
        >
          <div className="grid grid-cols-10 gap-0.5">
            {EMOJI.map((e) => (
              <button key={e} className="rounded p-0.5 text-lg hover:bg-surface-2" onClick={() => setText((t) => t + e)}>
                {e}
              </button>
            ))}
          </div>
        </Popover>
        {allowVoiceNote && allowAttachments && (
          <Tooltip content={recording ? 'Stop recording' : 'Record voice note'}>
            <Button variant={recording ? 'danger' : 'ghost'} size="icon-sm" onClick={toggleRecording} aria-label="Voice note">
              {recording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
            </Button>
          </Tooltip>
        )}
        <div className="min-w-0 flex-1 truncate px-1 text-[11px] text-fg-3">{footerLeft}</div>
        {text && (
          <Button variant="ghost" size="icon-sm" onClick={() => setText('')} aria-label="Clear">
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button size="sm" onClick={send} loading={sending} disabled={(!text.trim() && !uploads.length) || uploading} variant={tone === 'note' ? 'secondary' : 'primary'} className={cn(tone === 'note' && 'border-note-border')}>
          {!sending && <SendHorizontal className="h-4 w-4" />}
          <span className="hidden sm:inline">{sendLabel ?? 'Send'}</span>
        </Button>
      </div>
    </div>
  );
}
