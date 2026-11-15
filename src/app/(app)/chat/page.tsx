'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessagesSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { Empty } from '@/components/ui/misc';

function ChatHome() {
  const search = useSearchParams();
  const router = useRouter();
  const dm = search.get('dm');
  // /chat?dm=<userId> opens (or creates) the direct message with that person.
  useEffect(() => {
    if (!dm) return;
    api.post<{ channel: { id: string } }>('/chat/dm', { userIds: [dm] }).then((r) => router.replace(`/chat/${r.channel.id}`)).catch(() => router.replace('/chat'));
  }, [dm, router]);
  return (
    <div className="flex h-full items-center justify-center bg-bg">
      <Empty icon={<MessagesSquare className="h-5 w-5" />} title="Pick a channel or teammate">
        Channels for teams and clients, direct messages and threads. All internal, never visible to clients.
      </Empty>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatHome />
    </Suspense>
  );
}
