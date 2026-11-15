import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'AscenTalk', template: '%s · AscenTalk' },
  description: 'One place for every client conversation and team chat.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'AscenTalk', statusBarStyle: 'default' },
  icons: { icon: '/icons/favicon.svg', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#121315' },
  ],
};

// Applies the saved/system theme before paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('ascentalk-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
