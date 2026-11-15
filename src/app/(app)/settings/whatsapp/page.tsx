'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/hooks/use-bootstrap';
import { Empty, PageHeader, PageLoader } from '@/components/ui/misc';
import { NumberCard, TrackingEditor, type TrackingSummary } from '@/components/settings/whatsapp-tracking';

export default function WhatsAppTrackingPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <WhatsAppTracking />
    </Suspense>
  );
}

function WhatsAppTracking() {
  const { isAdmin, inboxes, features } = useApp();
  const router = useRouter();
  const selected = useSearchParams().get('inbox');
  const mine = useQuery({ queryKey: ['whatsapp-mine'], queryFn: () => api.get<{ inboxes: TrackingSummary[] }>('/whatsapp/mine'), enabled: !isAdmin });

  if (!features.channels.WHATSAPP) return <Empty title="WhatsApp is switched off" className="py-24" />;
  if (selected) return <TrackingEditor inboxId={selected} onBack={() => router.push('/settings/whatsapp')} />;

  const ids = isAdmin ? inboxes.filter((i) => i.channelType === 'WHATSAPP').map((i) => i.id) : (mine.data?.inboxes ?? []).map((s) => s.inbox.id);
  return (
    <div>
      <PageHeader
        title="WhatsApp tracking"
        subtitle="Choose which chats and groups each WhatsApp number brings into AscenTalk. Everything else on the phone is ignored: not stored, and not reachable from AscenTalk."
      />
      <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
        {!isAdmin && mine.isLoading ? (
          <PageLoader />
        ) : ids.length === 0 ? (
          <Empty icon={<MessageCircle className="h-5 w-5" />} title={isAdmin ? 'No WhatsApp numbers yet' : 'No WhatsApp number belongs to you'}>
            {isAdmin ? 'Add one under Inboxes & channels, then come back here to choose what it tracks.' : 'Ask an admin to add your number and make you its owner.'}
          </Empty>
        ) : (
          ids.map((id) => <NumberCard key={id} inboxId={id} onOpen={() => router.push(`/settings/whatsapp?inbox=${id}`)} />)
        )}
      </div>
    </div>
  );
}
