'use client';
import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { DEMO_MODE } from '@/lib/demo';

/** A blank "client website" page to try the widget on. */
function Demo() {
  const token = useSearchParams().get('token');
  useEffect(() => {
    // The launcher script is served by the API; a demo build embeds the chat frame directly instead.
    if (!token || DEMO_MODE) return;
    const s = document.createElement('script');
    s.src = '/widget.js';
    s.async = true;
    s.setAttribute('data-token', token);
    document.body.appendChild(s);
    return () => {
      s.remove();
      document.getElementById('ascentalk-widget')?.remove();
      (window as any).__ascentalkWidget = false;
    };
  }, [token]);
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm font-medium text-primary">Widget test page</p>
      <h1 className="mt-2 text-3xl font-semibold">Your client’s website</h1>
      <p className="mt-3 text-fg-2">This page stands in for a real website. The chat bubble in the corner is the AscenTalk widget. Messages you send here appear in the inbox, and replies come back in real time.</p>
      {!token && <p className="mt-6 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">Add ?token=… from a Website inbox to load the widget.</p>}
      {DEMO_MODE && token && (
        <iframe
          title="Chat widget"
          src={`/widget/frame?token=${encodeURIComponent(token)}`}
          className="fixed right-4 bottom-4 h-[min(560px,calc(100dvh-2rem))] w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-border bg-white shadow-pop"
        />
      )}
    </main>
  );
}

export default function WidgetDemoPage() {
  return (
    <Suspense>
      <Demo />
    </Suspense>
  );
}
