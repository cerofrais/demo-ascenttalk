'use client';
import { AlertCircle, Check, CheckCheck, Clock, CornerUpLeft, Lock, PhoneIncoming, PhoneMissed, PhoneOutgoing, RotateCw, Share2, Trash2, Voicemail } from 'lucide-react';
import type { ChannelType, Message } from '@/lib/api';
import { cn, duration, timeFull, timeShort } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Tooltip } from '@/components/ui/menu';
import { Attachments, DriveLinks, RichText } from '@/components/messages/content';

function StatusTick({ status }: { status: Message['status'] }) {
  if (status === 'PENDING') return <Clock className="h-3 w-3" />;
  if (status === 'SENT') return <Check className="h-3 w-3" />;
  if (status === 'DELIVERED') return <CheckCheck className="h-3 w-3" />;
  if (status === 'READ') return <CheckCheck className="h-3 w-3 text-sky-300" />;
  if (status === 'FAILED') return <AlertCircle className="h-3 w-3 text-danger" />;
  return null;
}

function CallCard({ m }: { m: Message }) {
  const call = m.call;
  const missed = call && ['MISSED', 'NO_ANSWER', 'BUSY', 'FAILED'].includes(call.status);
  const Icon = call?.status === 'VOICEMAIL' ? Voicemail : missed ? PhoneMissed : m.direction === 'INCOMING' ? PhoneIncoming : PhoneOutgoing;
  return (
    <div className="mx-auto my-2 w-full max-w-md rounded-xl border border-border bg-surface px-3 py-2.5 shadow-card">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-full', missed ? 'bg-danger/10 text-danger' : 'bg-sky-500/10 text-sky-600')}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{m.content ?? 'Call'}</p>
          <p className="truncate text-xs text-fg-3">
            {call?.user ? `${call.user.name} · ` : ''}
            {call?.durationSec ? `${duration(call.durationSec)} · ` : ''}
            {call?.mode === 'MOBILE' ? 'via mobile · ' : ''}
            {timeFull(m.createdAt)}
          </p>
        </div>
      </div>
      {call?.recordingUrl && <audio controls preload="none" src={call.recordingUrl} className="mt-2 h-9 w-full" />}
      {call?.voicemailUrl && <audio controls preload="none" src={call.voicemailUrl} className="mt-2 h-9 w-full" />}
    </div>
  );
}

export function MessageBubble({
  m,
  channelType,
  isGroup,
  showSender,
  mentionNames,
  onReply,
  onRetry,
  onDelete,
  onShare,
  canDelete,
}: {
  m: Message;
  channelType: ChannelType | null;
  isGroup: boolean;
  showSender: boolean;
  mentionNames: string[];
  onReply?: (m: Message) => void;
  onRetry?: (m: Message) => void;
  onDelete?: (m: Message) => void;
  onShare?: (m: Message) => void;
  canDelete?: boolean;
}) {
  if (m.kind === 'ACTIVITY') {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-surface-2 px-3 py-1 text-center text-[11px] text-fg-3">
          {m.content} · {timeShort(m.createdAt)}
        </span>
      </div>
    );
  }
  if (m.kind === 'CALL') return <CallCard m={m} />;

  const out = m.direction === 'OUTGOING';
  const note = m.kind === 'NOTE';
  const deleted = Boolean(m.deletedAt);
  const isEmail = channelType === 'EMAIL' && !note;
  const email = m.meta?.email as { subject?: string; from?: string; to?: string[]; cc?: string[] } | undefined;

  return (
    <div className={cn('group flex gap-2 px-3 py-1 md:px-5', out ? 'flex-row-reverse' : 'flex-row')}>
      <div className="w-7 shrink-0 self-end">
        {showSender && (out ? <Avatar name={m.senderUser?.name ?? m.senderName} src={m.senderUser?.avatarUrl} size="sm" /> : <Avatar name={m.senderName} size="sm" />)}
      </div>
      <div className={cn('flex max-w-[85%] min-w-0 flex-col md:max-w-[70%]', out ? 'items-end' : 'items-start')}>
        {showSender && (note || isGroup || out) && (
          <span className="mb-0.5 flex items-center gap-1 px-1 text-[11px] text-fg-3">
            {note && <Lock className="h-3 w-3" />}
            {m.senderName ?? m.senderUser?.name ?? 'Unknown'}
            {note && ' · private note'}
          </span>
        )}
        <div
          className={cn(
            'relative max-w-full rounded-2xl px-3 py-2 text-sm shadow-card',
            note
              ? 'border border-note-border bg-note text-fg'
              : out
                ? 'bg-bubble-out text-bubble-out-fg [&_.prose-msg_a]:text-inherit'
                : 'border border-border bg-surface text-fg',
            out ? 'rounded-br-md' : 'rounded-bl-md',
            isEmail && 'w-full',
          )}
        >
          {m.replyTo && (
            <div className={cn('mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs', out && !note ? 'border-white/60 bg-white/15' : 'border-primary bg-surface-2')}>
              <p className="font-medium">{m.replyTo.senderName ?? 'Message'}</p>
              <p className="line-clamp-2 opacity-80">{m.replyTo.content}</p>
            </div>
          )}
          {isEmail && email?.subject && <p className="mb-1 text-[13px] font-semibold">{email.subject}</p>}
          {isEmail && (email?.to?.length || email?.cc?.length) ? (
            <p className={cn('mb-1.5 text-[11px]', out ? 'opacity-80' : 'text-fg-3')}>
              {email?.from && !out ? `From ${email.from} · ` : ''}
              {email?.to?.length ? `To ${email.to.join(', ')}` : ''}
              {email?.cc?.length ? ` · Cc ${email.cc.join(', ')}` : ''}
            </p>
          ) : null}
          {deleted ? (
            <span className="text-fg-3 italic">This note was deleted</span>
          ) : (
            <>
              {m.content && <RichText text={m.content} mentionNames={note ? mentionNames : undefined} />}
              {isEmail && m.contentHtml && !out && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-primary">Show original formatting</summary>
                  <div className="email-html mt-2 max-h-[480px] overflow-auto rounded-lg border border-border bg-white p-3 text-[13px] text-black" dangerouslySetInnerHTML={{ __html: m.contentHtml }} />
                </details>
              )}
              {!!m.attachments.length && <Attachments items={m.attachments} className={cn(m.content && 'mt-2')} />}
              <DriveLinks links={m.meta?.driveLinks} />
            </>
          )}
          <span className={cn('mt-1 flex items-center justify-end gap-1 text-[10px]', out && !note ? 'text-white/75' : 'text-fg-3')}>
            <Tooltip content={timeFull(m.createdAt)}>
              <span>{timeShort(m.createdAt)}</span>
            </Tooltip>
            {out && !note && <StatusTick status={m.status} />}
          </span>
        </div>
        {m.status === 'FAILED' && (
          <div className="mt-1 flex items-center gap-2 px-1 text-xs text-danger">
            <span className="max-w-xs truncate">{m.error ?? 'Failed to send'}</span>
            {onRetry && (
              <button onClick={() => onRetry(m)} className="inline-flex items-center gap-1 font-medium underline">
                <RotateCw className="h-3 w-3" /> Retry
              </button>
            )}
          </div>
        )}
      </div>
      {!deleted && (
        <div className="flex items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {onReply && !note && (
            <Tooltip content="Reply">
              <button onClick={() => onReply(m)} className="rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Reply">
                <CornerUpLeft className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          )}
          {onShare && !note && (
            <Tooltip content="Share to team channel">
              <button onClick={() => onShare(m)} className="rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Share to team">
                <Share2 className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          )}
          {note && canDelete && onDelete && (
            <Tooltip content="Delete note">
              <button onClick={() => onDelete(m)} className="rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-danger" aria-label="Delete note">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}
