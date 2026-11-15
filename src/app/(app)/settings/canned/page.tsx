'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/hooks/use-bootstrap';
import { Button } from '@/components/ui/button';
import { Card, Empty, PageHeader } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';

interface Canned {
  id: string;
  shortCode: string;
  title: string | null;
  content: string;
}

export default function CannedPage() {
  const { features } = useApp();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['canned-responses'], queryFn: () => api.get<{ cannedResponses: Canned[] }>('/canned-responses'), enabled: features.cannedResponses });
  const [edit, setEdit] = useState<{ open: boolean; item?: Canned | null }>({ open: false });
  const [f, setF] = useState({ shortCode: '', title: '', content: '' });
  const open = (item?: Canned) => {
    setF({ shortCode: item?.shortCode ?? '', title: item?.title ?? '', content: item?.content ?? '' });
    setEdit({ open: true, item: item ?? null });
  };
  const save = async () => {
    const body = { shortCode: f.shortCode.trim(), title: f.title || null, content: f.content };
    try {
      if (edit.item) await api.patch(`/canned-responses/${edit.item.id}`, body);
      else await api.post('/canned-responses', body);
      qc.invalidateQueries({ queryKey: ['canned-responses'] });
      setEdit({ open: false });
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  if (!features.cannedResponses) return <Empty title="Canned responses are disabled" />;
  return (
    <div>
      <PageHeader
        title="Canned responses"
        subtitle="Saved replies. Type / in the reply box to use one."
        actions={
          <Button onClick={() => open()}>
            <Plus className="h-4 w-4" /> New response
          </Button>
        }
      />
      <div className="max-w-3xl p-4 md:p-6">
        <Card padded={false}>
          {!data?.cannedResponses.length && <Empty title="No saved replies yet" />}
          <ul className="divide-y divide-border">
            {data?.cannedResponses.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                <code className="mt-0.5 shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-primary">/{c.shortCode}</code>
                <div className="min-w-0 flex-1">
                  {c.title && <p className="text-[13px] font-medium">{c.title}</p>}
                  <p className="line-clamp-2 text-[13px] whitespace-pre-wrap text-fg-2">{c.content}</p>
                </div>
                <Button size="icon-sm" variant="ghost" onClick={() => open(c)} aria-label="Edit">
                  <Pencil className="h-4 w-4 text-fg-3" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Delete"
                  onClick={async () => {
                    if (!confirm(`Delete /${c.shortCode}?`)) return;
                    await api.del(`/canned-responses/${c.id}`).catch((e) => toast.error(e.message));
                    qc.invalidateQueries({ queryKey: ['canned-responses'] });
                  }}
                >
                  <Trash2 className="h-4 w-4 text-fg-3" />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Dialog
        open={edit.open}
        onOpenChange={(v) => setEdit((s) => ({ ...s, open: v }))}
        title={edit.item ? 'Edit response' : 'New canned response'}
        footer={
          <Button onClick={save} disabled={!/^[a-z0-9_-]+$/i.test(f.shortCode) || !f.content.trim()}>
            Save
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Shortcut" hint="Letters, numbers, - and _. Used as /shortcut.">
              <Input value={f.shortCode} onChange={(e) => setF((s) => ({ ...s, shortCode: e.target.value }))} placeholder="thanks" autoFocus />
            </Field>
            <Field label="Title (optional)">
              <Input value={f.title} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} />
            </Field>
          </div>
          <Field label="Message" hint="Variables: {{contact.name}}, {{client.name}}, {{agent.name}}">
            <Textarea rows={5} value={f.content} onChange={(e) => setF((s) => ({ ...s, content: e.target.value }))} />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
