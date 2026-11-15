'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/menu';
import { ApiError } from '@/lib/api';
import { DEMO_MODE, installDemoFetch } from '@/lib/demo';

// Demo builds have no backend: answer /api/* in the browser. Must be in place before the first query runs.
if (DEMO_MODE) installDemoFetch();

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: (count, err) => !(err instanceof ApiError && [401, 403, 404].includes(err.status)) && count < 2,
          },
        },
      }),
  );
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production' && !DEMO_MODE) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
