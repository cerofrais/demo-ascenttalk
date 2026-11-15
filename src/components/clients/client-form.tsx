'use client';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApp } from '@/hooks/use-bootstrap';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';

export interface ClientRecord {
  id: string;
  name: string;
  logoUrl: string | null;
  industry: string | null;
  website: string | null;
  status: 'LEAD' | 'ACTIVE' | 'PAUSED' | 'CHURNED';
  tags: string[];
  driveFolderUrl: string | null;
  notes: string | null;
  accountManager: { id: string; name: string; avatarUrl: string | null } | null;
  team: { id: string; name: string; color: string } | null;
  counts?: { contacts: number; conversations: number };
  openConversations?: number;
  lastActivityAt?: string | null;
}

export const CLIENT_STATUS_COLOR: Record<ClientRecord['status'], string> = { LEAD: '#0ea5e9', ACTIVE: '#16a34a', PAUSED: '#d97706', CHURNED: '#64748b' };

export function ClientFormDialog({ open, onOpenChange, client, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; client?: ClientRecord | null; onSaved?: (c: ClientRecord) => void }) {
  const { users, teams } = useApp();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', industry: '', website: '', status: 'ACTIVE', accountManagerId: '', teamId: '', tags: '', driveFolderUrl: '', notes: '' });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({
      name: client?.name ?? '',
      industry: client?.industry ?? '',
      website: client?.website ?? '',
      status: client?.status ?? 'ACTIVE',
      accountManagerId: client?.accountManager?.id ?? '',
      teamId: client?.team?.id ?? '',
      tags: client?.tags.join(', ') ?? '',
      driveFolderUrl: client?.driveFolderUrl ?? '',
      notes: client?.notes ?? '',
    });
  }, [open, client]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async () => {
    setLoading(true);
    const body = {
      name: f.name.trim(),
      industry: f.industry || null,
      website: f.website || null,
      status: f.status,
      accountManagerId: f.accountManagerId || null,
      teamId: f.teamId || null,
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      driveFolderUrl: f.driveFolderUrl || null,
      notes: f.notes || null,
    };
    try {
      const res = client ? await api.patch<{ client: ClientRecord }>(`/clients/${client.id}`, body) : await api.post<{ client: ClientRecord }>('/clients', body);
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client', res.client.id] });
      toast.success(client ? 'Client updated' : 'Client added');
      onOpenChange(false);
      onSaved?.(res.client);
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
      title={client ? `Edit ${client.name}` : 'Add client'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading} disabled={!f.name.trim()}>
            {client ? 'Save changes' : 'Add client'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client / brand name" className="sm:col-span-2">
          <Input value={f.name} onChange={set('name')} autoFocus />
        </Field>
        <Field label="Industry">
          <Input value={f.industry} onChange={set('industry')} placeholder="FMCG, Real estate…" />
        </Field>
        <Field label="Website">
          <Input value={f.website} onChange={set('website')} placeholder="https://" />
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={set('status')}>
            <option value="LEAD">Lead</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="CHURNED">Churned</option>
          </Select>
        </Field>
        <Field label="Account manager" hint="New conversations from this client are routed to them.">
          <Select value={f.accountManagerId} onChange={set('accountManagerId')}>
            <option value="">None</option>
            {users
              .filter((u) => u.role !== 'GUEST')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Team">
          <Select value={f.teamId} onChange={set('teamId')}>
            <option value="">None</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tags" hint="Comma separated">
          <Input value={f.tags} onChange={set('tags')} placeholder="retainer, performance" />
        </Field>
        <Field label="Google Drive folder" className="sm:col-span-2" hint="The client's shared folder for briefs, creatives and reports.">
          <Input value={f.driveFolderUrl} onChange={set('driveFolderUrl')} placeholder="https://drive.google.com/drive/folders/…" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={3} value={f.notes} onChange={set('notes')} />
        </Field>
      </div>
    </Dialog>
  );
}

export function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  clientId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact?: { id: string; name: string; email: string | null; phone: string | null; roleAtClient: string | null; clientId: string | null; notes: string | null } | null;
  clientId?: string;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', email: '', phone: '', roleAtClient: '', notes: '' });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (open) setF({ name: contact?.name ?? '', email: contact?.email ?? '', phone: contact?.phone ?? '', roleAtClient: contact?.roleAtClient ?? '', notes: contact?.notes ?? '' });
  }, [open, contact]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async () => {
    setLoading(true);
    const body = { name: f.name.trim(), email: f.email || null, phone: f.phone || null, roleAtClient: f.roleAtClient || null, notes: f.notes || null, ...(contact ? {} : { clientId: clientId ?? null }) };
    try {
      if (contact) await api.patch(`/contacts/${contact.id}`, body);
      else await api.post('/contacts', body);
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact'] });
      if (clientId || contact?.clientId) qc.invalidateQueries({ queryKey: ['client', clientId ?? contact?.clientId] });
      toast.success(contact ? 'Contact updated' : 'Contact added');
      onOpenChange(false);
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
      title={contact ? 'Edit contact' : 'Add contact'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading} disabled={!f.name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <Input value={f.name} onChange={set('name')} autoFocus />
        </Field>
        <Field label="Phone / WhatsApp" hint="With country code, e.g. +91 98100 00000">
          <Input value={f.phone} onChange={set('phone')} inputMode="tel" />
        </Field>
        <Field label="Email">
          <Input type="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Role at client" className="sm:col-span-2">
          <Input value={f.roleAtClient} onChange={set('roleAtClient')} placeholder="Brand Manager" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={f.notes} onChange={set('notes')} />
        </Field>
      </div>
    </Dialog>
  );
}
