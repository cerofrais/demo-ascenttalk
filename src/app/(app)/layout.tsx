'use client';
import type { ReactNode } from 'react';
import { BootstrapProvider, useBootstrapQuery } from '@/hooks/use-bootstrap';
import { RealtimeBridge } from '@/hooks/use-realtime';
import { AppShell } from '@/components/shell/app-shell';
import { DialerProvider } from '@/components/shell/softphone';
import { PageLoader } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { data, error, refetch } = useBootstrapQuery();
  if (error && !data) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium">Could not reach AscenTalk</p>
        <p className="text-sm text-fg-3">{error.message}</p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }
  if (!data) return <div className="h-dvh"><PageLoader /></div>;
  return (
    <BootstrapProvider data={data}>
      <RealtimeBridge />
      <DialerProvider>
        <AppShell>{children}</AppShell>
      </DialerProvider>
    </BootstrapProvider>
  );
}
