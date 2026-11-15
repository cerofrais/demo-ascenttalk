import type { ReactNode } from 'react';
import { BuiltByAscent, Logo } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <div className="flex justify-end p-3">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-4">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface shadow-pop md:grid-cols-2">
          {/* brand panel: Ascent charcoal in both themes */}
          <div className="relative hidden flex-col justify-between overflow-hidden bg-[#202124] p-8 text-white md:flex">
            <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#f7941e]/15 blur-3xl" />
            <Logo onDark className="text-lg" markClassName="h-9 w-9" />
            <div className="relative">
              <p className="text-2xl leading-snug font-semibold">Every client conversation and team chat in one place.</p>
              <ul className="mt-6 space-y-2.5 text-sm text-[#c6c7cc]">
                {['WhatsApp, email, calls, Instagram, Messenger, Telegram and web chat', 'Team channels, DMs and private notes on every conversation', 'Live oversight for managers'].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#f7941e]" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <p className="relative text-xs text-[#9a9ba0]">Built for agencies.</p>
          </div>
          <div className="p-6 sm:p-10">
            <Logo className="mb-6 text-lg md:hidden" />
            {children}
          </div>
        </div>
      </div>
      <footer className="flex justify-center px-4 pb-4">
        <BuiltByAscent />
      </footer>
    </div>
  );
}
