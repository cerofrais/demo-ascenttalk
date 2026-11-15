import { cn } from '@/lib/utils';

const ORANGE = '#f7941e';

/**
 * The AscenTalk mark: Ascent's roof-shaped "A" and orange triangle, with the block beneath it turned into
 * a speech bubble. Grey parts follow the text colour (currentColor), so it works on light and dark surfaces.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <path d="M7 34 32 9l25 25" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M32 22.5 42 32.5H22Z" fill={ORANGE} stroke={ORANGE} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M23 39h18a5 5 0 0 1 5 5v6a5 5 0 0 1-5 5h-9.6l-6.6 5.5a.8.8 0 0 1-1.3-.6V55H23a5 5 0 0 1-5-5v-6a5 5 0 0 1 5-5Z" fill="currentColor" />
    </svg>
  );
}

/** Mark plus wordmark. `onDark` is for surfaces that stay dark in both themes (sidebar, brand panel). */
export function Logo({ className, markClassName, onDark }: { className?: string; markClassName?: string; onDark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', onDark ? 'text-white' : 'text-fg', className)}>
      <LogoMark className={cn('h-8 w-8 shrink-0', onDark ? 'text-white' : 'text-brand-grey', markClassName)} />
      <span>
        Ascen<span className={onDark ? 'text-[#f7941e]' : 'text-primary'}>Talk</span>
      </span>
    </span>
  );
}

/** Ascent's own mark (roof "A", orange triangle, block), simplified for small sizes. */
export function AscentMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 934 687" className={className} aria-hidden focusable="false">
      <path d="M72 462 457 72l401 390" fill="none" stroke="currentColor" strokeWidth="56" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M216 355h482" fill="none" stroke="currentColor" strokeWidth="60" />
      <path d="M457 186 554 284H360Z" fill={ORANGE} stroke={ORANGE} strokeWidth="14" strokeLinejoin="round" />
      <rect x="373" y="413" width="182" height="192" rx="22" fill="currentColor" />
    </svg>
  );
}

export const ASCENT_URL = 'https://ascent-i-tech.com';

/** The "Built by Ascent" credit shown in footers. */
export function BuiltByAscent({ className, onDark }: { className?: string; onDark?: boolean }) {
  return (
    <a
      href={ASCENT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-1.5 text-[11px] transition-colors', onDark ? 'text-sidebar-fg hover:text-white' : 'text-fg-3 hover:text-fg', className)}
    >
      <AscentMark className={cn('h-3.5 w-[19px]', onDark ? 'text-sidebar-fg' : 'text-brand-grey')} />
      <span>
        Built by <span className="font-semibold">Ascent</span>
      </span>
    </a>
  );
}
