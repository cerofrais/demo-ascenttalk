import { Globe, Mail, MessageSquare, Phone, Send } from 'lucide-react';
import type { ChannelType } from '@/lib/api';
import { cn } from '@/lib/utils';

export const CHANNEL_COLOR: Record<ChannelType, string> = {
  WHATSAPP: '#25D366',
  EMAIL: '#ea4335',
  VOICE: '#0ea5e9',
  WEBSITE: '#6366f1',
  TELEGRAM: '#229ED9',
  FACEBOOK: '#0866FF',
  INSTAGRAM: '#E1306C',
  SMS: '#64748b',
};

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.82 14.08c-.24.68-1.42 1.3-1.95 1.35-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.94-4.66-4.12-.13-.18-1.11-1.48-1.11-2.82 0-1.35.7-2.01.95-2.29.25-.27.54-.34.72-.34h.52c.17 0 .39-.06.61.47.24.56.79 1.94.86 2.08.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.21 1.37.27.14.43.11.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.23.61-.14.25.09 1.6.75 1.87.89.27.14.45.2.52.32.07.11.07.66-.17 1.33Z" />
    </svg>
  );
}

function MessengerGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.43 3.14 7.17.16.15.26.35.27.57l.05 1.78a.8.8 0 0 0 1.12.71l1.98-.87a.8.8 0 0 1 .53-.04c.91.25 1.88.38 2.91.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2Zm6 7.46-2.94 4.66a1.5 1.5 0 0 1-2.17.4l-2.34-1.75a.6.6 0 0 0-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63l2.94-4.66a1.5 1.5 0 0 1 2.17-.4l2.34 1.75a.6.6 0 0 0 .72 0l3.16-2.4c.42-.32.97.18.69.63Z" />
    </svg>
  );
}

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChannelIcon({ type, className, withBg }: { type: ChannelType | null | undefined; className?: string; withBg?: boolean }) {
  if (!type) return null;
  const c = cn('h-4 w-4', className);
  const icon =
    type === 'WHATSAPP' ? (
      <WhatsAppGlyph className={c} />
    ) : type === 'EMAIL' ? (
      <Mail className={c} />
    ) : type === 'VOICE' ? (
      <Phone className={c} />
    ) : type === 'WEBSITE' ? (
      <Globe className={c} />
    ) : type === 'TELEGRAM' ? (
      <Send className={c} />
    ) : type === 'FACEBOOK' ? (
      <MessengerGlyph className={c} />
    ) : type === 'INSTAGRAM' ? (
      <InstagramGlyph className={c} />
    ) : (
      <MessageSquare className={c} />
    );
  if (!withBg) return <span style={{ color: CHANNEL_COLOR[type] }} className="inline-flex">{icon}</span>;
  return (
    <span className="inline-flex items-center justify-center rounded-md p-1 text-white" style={{ background: CHANNEL_COLOR[type] }}>
      {icon}
    </span>
  );
}
