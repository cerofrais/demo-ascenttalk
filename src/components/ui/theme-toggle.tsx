'use client';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { THEME_LABEL, THEME_ORDER, useTheme, type ThemeMode } from '@/lib/theme';

export const THEME_ICON: Record<ThemeMode, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

/** Light / dark / match-device switch. `onDark` styles it for the sidebar, which is dark in both themes. */
export function ThemeToggle({ className, onDark }: { className?: string; onDark?: boolean }) {
  const { mode, setMode } = useTheme();
  return (
    <div role="group" aria-label="Theme" className={cn('inline-flex rounded-lg p-0.5', onDark ? 'bg-sidebar-active' : 'border border-border bg-surface-2', className)}>
      {THEME_ORDER.map((m) => {
        const Icon = THEME_ICON[m];
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            title={THEME_LABEL[m]}
            aria-label={`${THEME_LABEL[m]} theme`}
            aria-pressed={active}
            onClick={() => setMode(m)}
            className={cn(
              'rounded-md p-1.5 transition-colors',
              onDark
                ? active
                  ? 'bg-white/15 text-white'
                  : 'text-sidebar-fg hover:text-white'
                : active
                  ? 'bg-surface text-fg shadow-card'
                  : 'text-fg-3 hover:text-fg',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
