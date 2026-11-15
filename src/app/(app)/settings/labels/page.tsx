'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { api, type Label } from '@/lib/api';
import { useApp } from '@/hooks/use-bootstrap';
import { Button } from '@/components/ui/button';
import { Badge, Card, Empty, PageHeader } from '@/components/ui/misc';
import { Input } from '@/components/ui/form';

export default function LabelsPage() {
  const { isManager, isAdmin } = useApp();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['labels'], queryFn: () => api.get<{ labels: Label[] }>('/labels') });
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [description, setDescription] = useState('');
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['labels'] });
    qc.invalidateQueries({ queryKey: ['bootstrap'] });
  };
  const add = async () => {
    try {
      await api.post('/labels', { name: name.trim().toLowerCase().replace(/\s+/g, '-'), color, description: description || null });
      setName('');
      setDescription('');
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  if (!isManager) return <Empty title="Only managers and admins can edit labels" />;
  return (
    <div>
      <PageHeader title="Labels" subtitle="Tag conversations by topic so they’re easy to filter and report on." />
      <div className="max-w-3xl space-y-4 p-4 md:p-6">
        <Card title="New label">
          <div className="flex flex-wrap items-end gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="label-name" className="w-44" aria-label="Label name" />
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it’s for (optional)" className="min-w-40 flex-1" aria-label="Description" />
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 p-1" aria-label="Color" />
            <Button onClick={add} disabled={!name.trim()}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </Card>
        <Card padded={false}>
          {!data?.labels.length && <Empty title="No labels yet" />}
          <ul className="divide-y divide-border">
            {data?.labels.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                <Badge color={l.color}>{l.name}</Badge>
                <span className="min-w-0 flex-1 truncate text-xs text-fg-3">{l.description}</span>
                <input
                  type="color"
                  defaultValue={l.color}
                  aria-label={`Color for ${l.name}`}
                  className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  onBlur={async (e) => {
                    if (e.target.value !== l.color) {
                      await api.patch(`/labels/${l.id}`, { color: e.target.value });
                      refresh();
                    }
                  }}
                />
                {isAdmin && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${l.name}`}
                    onClick={async () => {
                      if (!confirm(`Delete label “${l.name}”? It is removed from all conversations.`)) return;
                      await api.del(`/labels/${l.id}`).catch((e) => toast.error(e.message));
                      refresh();
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-fg-3" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
