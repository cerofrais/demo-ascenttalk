'use client';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationStatus, Priority } from '@/lib/api';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-fg-3', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex h-full min-h-40 w-full items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

export function Empty({ icon, title, children, action, className }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-fg-3">{icon}</div>}
      <p className="font-medium text-fg">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-fg-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Card({ className, children, title, actions, padded = true }: { className?: string; children: ReactNode; title?: ReactNode; actions?: ReactNode; padded?: boolean }) {
  return (
    <section className={cn('rounded-xl border border-border bg-surface shadow-card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {actions}
        </header>
      )}
      <div className={cn(padded && 'p-4')}>{children}</div>
    </section>
  );
}

export function Badge({ children, color, className, variant = 'soft' }: { children: ReactNode; color?: string; className?: string; variant?: 'soft' | 'outline' | 'solid' }) {
  const style = color
    ? variant === 'solid'
      ? { background: color, color: '#fff' }
      : variant === 'outline'
        ? { borderColor: color, color }
        : { background: `${color}1f`, color }
    : undefined;
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium',
        !color && 'bg-surface-2 text-fg-2',
        variant === 'outline' && 'border',
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

export const STATUS_COLOR: Record<ConversationStatus, string> = {
  OPEN: '#16a34a',
  PENDING: '#d97706',
  SNOOZED: '#7c3aed',
  RESOLVED: '#64748b',
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  return <Badge color={STATUS_COLOR[status]}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

export const PRIORITY_COLOR: Record<Priority, string> = { NONE: '#94a3b8', LOW: '#0ea5e9', MEDIUM: '#f59e0b', HIGH: '#f97316', URGENT: '#dc2626' };

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'NONE') return null;
  return <Badge color={PRIORITY_COLOR[priority]}>{priority.charAt(0) + priority.slice(1).toLowerCase()}</Badge>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-3">{children}</kbd>;
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1 overflow-x-auto', className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
            value === it.value ? 'bg-primary-soft text-primary' : 'text-fg-2 hover:bg-surface-2',
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span className={cn('rounded-full px-1.5 text-[11px]', value === it.value ? 'bg-primary text-primary-fg' : 'bg-surface-3 text-fg-2')}>{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} />;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'warning' | 'success' }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <p className="text-xs font-medium text-fg-3">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tone === 'danger' && 'text-danger', tone === 'warning' && 'text-warning', tone === 'success' && 'text-success')}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-fg-3">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-border bg-surface px-4 py-4 md:px-6', className)}>
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-fg-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
