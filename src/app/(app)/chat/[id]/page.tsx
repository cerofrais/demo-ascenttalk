'use client';
import { Suspense, use } from 'react';
import { ChannelView } from '@/components/chat/channel-view';

export default function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <ChannelView id={id} key={id} />
    </Suspense>
  );
}
