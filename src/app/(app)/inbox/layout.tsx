'use client';
import { Suspense, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { ConversationList } from '@/components/inbox/conversation-list';
import { cn } from '@/lib/utils';

/** Two-pane inbox: list + conversation. On phones each pane is its own screen. */
export default function InboxLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id?: string }>();
  const open = Boolean(params.id);
  return (
    <div className="flex h-full">
      <div className={cn('h-full w-full shrink-0 border-r border-border lg:block lg:w-[340px]', open && 'hidden')}>
        <Suspense>
          <ConversationList />
        </Suspense>
      </div>
      <div className={cn('h-full min-w-0 flex-1', !open && 'hidden lg:block')}>{children}</div>
    </div>
  );
}
