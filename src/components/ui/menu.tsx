'use client';
import * as DM from '@radix-ui/react-dropdown-menu';
import * as P from '@radix-ui/react-popover';
import * as T from '@radix-ui/react-tooltip';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export function MenuContent({ children, align = 'end', className, sideOffset = 6 }: { children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string; sideOffset?: number }) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={sideOffset}
        className={cn('z-50 max-h-[70vh] min-w-48 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-pop', className)}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

export function MenuItem({ children, onSelect, danger, icon, checked, disabled }: { children: ReactNode; onSelect?: () => void; danger?: boolean; icon?: ReactNode; checked?: boolean; disabled?: boolean }) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2',
        danger ? 'text-danger' : 'text-fg',
      )}
    >
      {icon && <span className="flex h-4 w-4 items-center justify-center text-fg-3">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {checked && <Check className="h-3.5 w-3.5 text-primary" />}
    </DM.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">{children}</DM.Label>;
}

export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-border" />;
}

export function Popover({ trigger, children, align = 'start', open, onOpenChange, className, side }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' | 'center'; open?: boolean; onOpenChange?: (v: boolean) => void; className?: string; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content align={align} side={side} sideOffset={6} className={cn('z-50 rounded-xl border border-border bg-surface p-2 shadow-pop', className)}>
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <T.Root delayDuration={300}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={4} className="z-50 rounded-md bg-fg px-2 py-1 text-xs text-bg shadow-pop">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export const TooltipProvider = T.Provider;
