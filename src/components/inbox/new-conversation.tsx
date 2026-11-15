'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { CHANNEL_LABEL } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';

const STARTABLE = ['WHATSAPP', 'EMAIL', 'TELEGRAM', 'FACEBOOK', 'INSTAGRAM'];

export function NewConversationDialog({
  open,
  onOpenChange,
  onCreated,
  contact,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
  contact?: { id: string; name: string } | null;
}) {
  const { inboxes } = useApp();
  const usable = inboxes.filter((i) => STARTABLE.includes(i.channelType) && i.enabled);
  const [inboxId, setInboxId] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(contact ?? null);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (open) {
      setPicked(contact ?? null);
      setInboxId((id) => id || usable[0]?.id || '');
      setContent('');
      setSubject('');
      setQ('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact?.id]);
  const { data } = useQuery({ queryKey: ['contacts', 'picker', q], queryFn: () => api.get<{ contacts: any[] }>('/contacts', { q, take: 8 }), enabled: open && !picked && q.length >= 2 });
  const inbox = usable.find((i) => i.id === inboxId);
  const submit = async () => {
    if (!picked || !inboxId || !content.trim()) return;
    setLoading(true);
    try {
      const res = await api.post<{ conversation: { id: string } }>('/conversations', { inboxId, contactId: picked.id, content, subject: subject || null });
      onOpenChange(false);
      onCreated(res.conversation.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New conversation"
      description="Message a contact on one of your connected channels."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading} disabled={!picked || !inboxId || !content.trim()}>
            Send
          </Button>
        </>
      }
    >
      {!usable.length ? (
        <p className="text-sm text-fg-2">Connect a WhatsApp, email, Telegram or Meta inbox under Settings → Inboxes first.</p>
      ) : (
        <div className="space-y-4">
          <Field label="To">
            {picked ? (
              <div className="flex h-9 items-center justify-between rounded-lg border border-border bg-surface-2 px-3 text-sm">
                <span>{picked.name}</span>
                {!contact && (
                  <button className="text-xs text-primary" onClick={() => setPicked(null)}>
                    Change
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts by name, phone or email" autoFocus />
                {!!data?.contacts.length && (
                  <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-pop">
                    {data.contacts.map((c) => (
                      <button key={c.id} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => setPicked({ id: c.id, name: c.name })}>
                        <span className="block text-[13px] font-medium">{c.name}</span>
                        <span className="block text-xs text-fg-3">{[c.client?.name, c.phone, c.email].filter(Boolean).join(' · ')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Field>
          <Field label="Send from">
            <Select value={inboxId} onChange={(e) => setInboxId(e.target.value)}>
              {usable.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({CHANNEL_LABEL[i.channelType]}){i.status !== 'connected' ? ' · not connected' : ''}
                </option>
              ))}
            </Select>
          </Field>
          {inbox?.channelType === 'EMAIL' && (
            <Field label="Subject">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
          )}
          <Field label="Message">
            <Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
