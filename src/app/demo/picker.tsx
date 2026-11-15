'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Briefcase, ChevronRight, Crown, Eye, Info, Palette, RotateCcw, Settings, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLastDemoPersonaId, setDemoPersonaId } from '@/lib/demo';
import { disconnectSocket } from '@/lib/socket';
import { DEMO_AGENCY, PERSONAS, type DemoPersona } from '@/demo/personas';
import { ASCENT_URL, BuiltByAscent, LogoMark } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const ICON: Record<DemoPersona['icon'], typeof Crown> = { crown: Crown, settings: Settings, eye: Eye, briefcase: Briefcase, palette: Palette, video: Video };

export function DemoPicker() {
  const router = useRouter();
  const qc = useQueryClient();
  const [current, setCurrent] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setCurrent(getLastDemoPersonaId());
    // a link that needs a real server (OAuth, file download) lands here with ?unavailable=1
    setUnavailable(new URLSearchParams(window.location.search).has('unavailable'));
  }, []);

  const enter = (p: DemoPersona) => {
    setDemoPersonaId(p.id);
    disconnectSocket();
    qc.clear();
    router.push(p.landing);
  };

  const reset = async () => {
    setResetting(true);
    try {
      const { resetDemoData } = await import('@/demo/server');
      resetDemoData();
      qc.clear();
      toast.success('Demo data is back to its starting point');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <div className="flex justify-end p-3">
        <ThemeToggle />
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-8">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-pop sm:p-8">
          <header className="flex flex-col items-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#202124]">
              <LogoMark className="h-9 w-9 text-white" />
            </span>
            <h1 className="mt-3 text-xl font-semibold tracking-tight">
              Ascen<span className="text-primary">Talk</span>
            </h1>
            <p className="mt-1 max-w-md text-sm text-fg-2">
              Interactive demo set in {DEMO_AGENCY}, a made-up marketing agency. No real data: every client, message and number here is generated.
            </p>
            <BuiltByAscent className="mt-2 text-xs" />
          </header>

          {unavailable && (
            <p className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-fg-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              That step needs a live server (for example connecting a real mailbox or downloading a stored file), so it is switched off in the demo.
            </p>
          )}

          <h2 className="mt-6 mb-3 text-center text-[11px] font-semibold tracking-[0.14em] text-fg-3 uppercase">Pick a role to explore the demo</h2>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {PERSONAS.map((p) => {
              const Icon = ICON[p.icon];
              const active = current === p.id;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => enter(p)}
                    className={cn(
                      'group flex h-full w-full items-start gap-3 rounded-xl border bg-surface p-3.5 text-left transition-colors hover:border-primary hover:bg-primary-soft/40',
                      active ? 'border-primary' : 'border-border',
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-fg">{p.name}</span>
                        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] leading-none font-semibold tracking-wide text-fg-2 uppercase">{p.roleLabel}</span>
                        {active && <span className="text-[10px] font-medium text-primary">last used</span>}
                      </span>
                      <span className="mt-0.5 block text-xs text-fg-3">{p.title}</span>
                      <span className="mt-1 block text-[13px] leading-snug text-fg-2">{p.blurb}</span>
                    </span>
                    <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex flex-col items-center gap-2 border-t border-border pt-4 text-center text-xs text-fg-3">
            <p>This demo runs entirely in your browser. What you do is saved only on this device, and you can switch roles at any time.</p>
            <button onClick={reset} disabled={resetting} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline disabled:opacity-60">
              <RotateCcw className="h-3.5 w-3.5" /> Reset demo data
            </button>
          </div>
        </div>
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 pb-5 text-[11px] text-fg-3">
        <span>© {new Date().getFullYear()} Ascent. All rights reserved.</span>
        <span aria-hidden>·</span>
        <span>
          A product of{' '}
          <a href={ASCENT_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-fg-2 hover:text-fg hover:underline">
            Ascent
          </a>
        </span>
      </footer>
    </div>
  );
}
