'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookText, Inbox, ScrollText, ShieldCheck, SlidersHorizontal, Tag, User, UserCog, Users } from 'lucide-react';
import { useApp } from '@/hooks/use-bootstrap';
import { cn } from '@/lib/utils';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const { isAdmin, isManager, features } = useApp();
  const pathname = usePathname();
  const items = [
    { href: '/settings/profile', label: 'My profile', icon: User, show: true },
    { href: '/settings/inboxes', label: 'Inboxes & channels', icon: Inbox, show: isAdmin },
    { href: '/settings/people', label: 'People', icon: UserCog, show: true },
    { href: '/settings/teams', label: 'Teams', icon: Users, show: true },
    { href: '/settings/security', label: 'Sign-in & security', icon: ShieldCheck, show: isAdmin },
    { href: '/settings/labels', label: 'Labels', icon: Tag, show: features.labels && isManager },
    { href: '/settings/canned', label: 'Canned responses', icon: BookText, show: features.cannedResponses },
    { href: '/settings/features', label: 'Features & integrations', icon: SlidersHorizontal, show: isAdmin },
    { href: '/settings/audit', label: 'Audit log', icon: ScrollText, show: isAdmin && features.auditLog },
  ].filter((i) => i.show);
  return (
    <div className="flex h-full flex-col md:flex-row">
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface p-2 md:w-56 md:flex-col md:border-r md:border-b-0 md:p-3">
        <p className="hidden px-2 pb-2 text-base font-semibold md:block">Settings</p>
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium whitespace-nowrap',
              pathname.startsWith(i.href) ? 'bg-primary-soft text-primary' : 'text-fg-2 hover:bg-surface-2',
            )}
          >
            <i.icon className="h-4 w-4" />
            {i.label}
          </Link>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
