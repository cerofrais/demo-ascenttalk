'use client';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const w = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
        <D.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-hidden rounded-t-2xl border border-border bg-surface shadow-pop',
            'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
            w,
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <D.Title className="text-base font-semibold text-fg">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-sm text-fg-3">{description}</D.Description> : <D.Description className="sr-only">{String(title)}</D.Description>}
            </div>
            <D.Close className="rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="h-4 w-4" />
            </D.Close>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border bg-surface-2/50 px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Drawer({ open, onOpenChange, title, children, side = 'right', className }: { open: boolean; onOpenChange: (v: boolean) => void; title: ReactNode; children: ReactNode; side?: 'right' | 'left'; className?: string }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <D.Content className={cn('fixed top-0 bottom-0 z-50 flex w-full max-w-md flex-col border-border bg-surface shadow-pop', side === 'right' ? 'right-0 border-l' : 'left-0 border-r', className)}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <D.Title className="text-sm font-semibold">{title}</D.Title>
            <D.Description className="sr-only">{String(title)}</D.Description>
            <D.Close className="rounded-md p-1 text-fg-3 hover:bg-surface-2" aria-label="Close">
              <X className="h-4 w-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
