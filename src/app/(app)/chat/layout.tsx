'use client';
import type { ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { ChannelSidebar } from '@/components/chat/channel-sidebar';
import { useApp } from '@/hooks/use-bootstrap';
import { Empty } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

export default function ChatLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id?: string }>();
  const { features } = useApp();
  const open = Boolean(params.id);
  if (!features.internalChat) return <Empty title="Team chat is disabled">Enable `internal_chat` in config/features.json.</Empty>;
  return (
    <div className="flex h-full">
      <div className={cn('h-full w-full shrink-0 border-r border-border lg:block lg:w-[260px]', open && 'hidden')}>
        <ChannelSidebar />
      </div>
      <div className={cn('h-full min-w-0 flex-1', !open && 'hidden lg:block')}>{children}</div>
    </div>
  );
}
