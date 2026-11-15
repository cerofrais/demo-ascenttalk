import { MessagesSquare } from 'lucide-react';
import { Empty } from '@/components/ui/misc';

export default function InboxHome() {
  return (
    <div className="flex h-full items-center justify-center bg-bg">
      <Empty icon={<MessagesSquare className="h-5 w-5" />} title="Select a conversation">
        WhatsApp, email, calls, web chat, Telegram and Meta messages from your clients all land here.
      </Empty>
    </div>
  );
}
