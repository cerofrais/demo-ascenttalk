'use client';
import { use } from 'react';
import { ConversationView } from '@/components/inbox/conversation-view';

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ConversationView id={id} key={id} />;
}
