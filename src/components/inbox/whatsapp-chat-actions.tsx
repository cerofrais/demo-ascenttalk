'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EyeOff, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { MenuItem, MenuSeparator } from '@/components/ui/menu';

/**
 * Deleting a WhatsApp conversation, or ignoring the number (or group) behind it, from the conversation screen.
 * API: routes/whatsapp-sync.ts, /conversations/:id/whatsapp.
 */

export interface WhatsAppChatInfo {
  /** The signed-in person decides what this number tracks (its owner, or an admin when it has none). */
  canManage: boolean;
  owner: { id: string; name: string } | null;
  isGroup: boolean;
  messages: number;
  /** Still tracked: after a delete, its next message starts a new conversation. */
  tracked: boolean;
}

export interface ChatRemoval {
  conversations: number;
  messages: number;
  files: number;
  contacts: number;
}

export type ChatAction = 'delete' | 'ignore';

export function useWhatsAppChatInfo(conversationId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['conversation-whatsapp', conversationId],
    queryFn: () => api.get<WhatsAppChatInfo>(`/conversations/${conversationId}/whatsapp`),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

/** The two items for the conversation's "More actions" menu, or who to ask when the viewer cannot use them. */
export function WhatsAppChatMenuItems({ info, onChoose }: { info: WhatsAppChatInfo | undefined; onChoose: (a: ChatAction) => void }) {
  if (!info) return null;
  return (
    <>
      <MenuSeparator />
      {info.canManage ? (
        <>
          <MenuItem danger icon={<Trash2 className="h-3.5 w-3.5" />} onSelect={() => onChoose('delete')}>
            Delete conversation
          </MenuItem>
          <MenuItem danger icon={<EyeOff className="h-3.5 w-3.5" />} onSelect={() => onChoose('ignore')}>
            {info.isGroup ? 'Ignore this group' : 'Ignore this number'}
          </MenuItem>
        </>
      ) : (
        <p className="px-2.5 py-1.5 text-xs text-fg-3">
          To delete or ignore this chat, ask {info.owner?.name ?? 'an admin'}.
        </p>
      )}
    </>
  );
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function ChatActionDialog({
  action,
  conversationId,
  title,
  info,
  onClose,
  onStart,
  onDone,
}: {
  action: ChatAction | null;
  conversationId: string;
  /** The person's name or number, or the group's name. */
  title: string;
  info: WhatsAppChatInfo | undefined;
  onClose: () => void;
  /** Called just before the request, so the screen can tell its own removal from someone else's. */
  onStart: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (action) void qc.invalidateQueries({ queryKey: ['conversation-whatsapp', conversationId] });
  }, [action, conversationId, qc]);

  const group = info?.isGroup ?? false;
  const what = group ? 'group' : 'number';
  const messages = info ? plural(info.messages, 'message') : 'messages';

  const run = async () => {
    if (!action) return;
    setLoading(true);
    onStart();
    try {
      await api.post<ChatRemoval>(`/conversations/${conversationId}/whatsapp/${action}`);
      toast.success(action === 'delete' ? 'Conversation deleted' : `${title} is ignored. Nothing from this ${what} is stored any more.`);
      for (const key of [['conversations'], ['conversation-counts'], ['contacts'], ['wa-tracking'], ['notifications']]) void qc.invalidateQueries({ queryKey: key });
      onDone();
    } catch (err: any) {
      toast.error(err.message);
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={Boolean(action)}
      onOpenChange={(v) => !v && !loading && onClose()}
      title={action === 'ignore' ? `Ignore ${title}?` : 'Delete this conversation?'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={run} loading={loading}>
            {action === 'ignore' ? `Ignore ${what}` : 'Delete'}
          </Button>
        </>
      }
    >
      {action === 'ignore' ? (
        <div className="space-y-2 text-sm text-fg-2">
          <p>
            AscenTalk deletes this conversation and its {messages} for everyone, and stops storing anything this {what} sends from now on. It will not show in the
            inbox, the dashboard or reports, and nobody can write to it from AscenTalk.
          </p>
          <p>Nothing changes on the phone. To track it again, tick it under Settings → WhatsApp tracking; the deleted messages do not come back.</p>
        </div>
      ) : (
        <div className="space-y-2 text-sm text-fg-2">
          <p>
            Deletes this conversation and its {messages} and files from AscenTalk, for everyone. Nothing changes on the phone. This cannot be undone.
          </p>
          {info?.tracked && (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs">
              This {group ? 'group' : 'chat'} is still tracked, so its next message starts a new conversation. To keep it out for good, choose Ignore this {what} instead.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
