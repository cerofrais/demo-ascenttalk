'use client';
import { cn, colorFor, initials } from '@/lib/utils';
import type { Presence } from '@/lib/api';
import { usePresence } from '@/hooks/use-presence';

const SIZES = { xs: 'h-5 w-5 text-[9px]', sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm', xl: 'h-16 w-16 text-lg' } as const;
const DOT: Record<Presence, string> = { ONLINE: 'bg-success', AWAY: 'bg-warning', BUSY: 'bg-danger', OFFLINE: 'bg-fg-3' };

export function Avatar({
  name,
  src,
  size = 'md',
  userId,
  square,
  className,
  presence,
}: {
  name?: string | null;
  src?: string | null;
  size?: keyof typeof SIZES;
  userId?: string;
  square?: boolean;
  className?: string;
  presence?: Presence;
}) {
  const live = usePresence(userId);
  const status = presence ?? (userId ? live : undefined);
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? ''} className={cn(SIZES[size], square ? 'rounded-lg' : 'rounded-full', 'object-cover')} />
      ) : (
        <span
          className={cn(SIZES[size], square ? 'rounded-lg' : 'rounded-full', 'inline-flex items-center justify-center font-semibold text-white')}
          style={{ background: colorFor(name) }}
          aria-hidden
        >
          {initials(name)}
        </span>
      )}
      {status && (
        <span
          className={cn('absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-[var(--surface)]', DOT[status], size === 'xs' || size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5')}
          title={status.toLowerCase()}
        />
      )}
    </span>
  );
}

export function AvatarStack({ users, max = 3, size = 'xs', showMore = true }: { users: { id: string; name: string; avatarUrl: string | null }[]; max?: number; size?: 'xs' | 'sm'; showMore?: boolean }) {
  return (
    <span className="flex -space-x-1.5">
      {users.slice(0, max).map((u) => (
        <Avatar key={u.id} name={u.name} src={u.avatarUrl} size={size} className="ring-2 ring-[var(--surface)] rounded-full" />
      ))}
      {showMore && users.length > max && <span className="ml-2 text-xs text-fg-3">+{users.length - max}</span>}
    </span>
  );
}
