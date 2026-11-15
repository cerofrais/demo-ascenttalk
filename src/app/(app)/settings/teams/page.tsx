'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Users } from 'lucide-react';
import { api, type UserBrief } from '@/lib/api';
import { useApp } from '@/hooks/use-bootstrap';
import { AvatarStack } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, Empty, PageHeader, PageLoader } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { UserChecklist } from '@/components/chat/channel-sidebar';

interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  color: string;
  lead: UserBrief | null;
  members: UserBrief[];
  clientCount: number;
  inboxCount: number;
}

export default function TeamsPage() {
  const { isManager, isAdmin, users } = useApp();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['teams'], queryFn: () => api.get<{ teams: TeamRow[] }>('/teams') });
  const [edit, setEdit] = useState<{ open: boolean; team?: TeamRow | null }>({ open: false });
  const [f, setF] = useState({ name: '', description: '', color: '#6366f1', leadId: '' });
  const [members, setMembers] = useState<string[]>([]);
  const openEdit = (team?: TeamRow) => {
    setF({ name: team?.name ?? '', description: team?.description ?? '', color: team?.color ?? '#6366f1', leadId: team?.lead?.id ?? '' });
    setMembers(team?.members.map((m) => m.id) ?? []);
    setEdit({ open: true, team: team ?? null });
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['teams'] });
    qc.invalidateQueries({ queryKey: ['bootstrap'] });
  };
  const save = async () => {
    const body = { name: f.name.trim(), description: f.description || null, color: f.color, leadId: f.leadId || null, memberIds: members };
    try {
      if (edit.team) await api.patch(`/teams/${edit.team.id}`, body);
      else await api.post('/teams', body);
      refresh();
      setEdit({ open: false });
      toast.success('Team saved');
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  const remove = async () => {
    if (!edit.team || !confirm(`Delete team “${edit.team.name}”?`)) return;
    await api.del(`/teams/${edit.team.id}`).catch((e) => toast.error(e.message));
    refresh();
    setEdit({ open: false });
  };
  return (
    <div>
      <PageHeader
        title="Teams"
        subtitle="Group people by function. Teams own inboxes and clients, and their lead oversees the team’s conversations."
        actions={
          isManager && (
            <Button onClick={() => openEdit()}>
              <Plus className="h-4 w-4" /> New team
            </Button>
          )
        }
      />
      <div className="grid gap-3 p-4 md:p-6 lg:grid-cols-2">
        {isLoading && <PageLoader />}
        {data && !data.teams.length && <Empty icon={<Users className="h-5 w-5" />} title="No teams yet" className="lg:col-span-2" />}
        {data?.teams.map((t) => (
          <Card key={t.id}>
            <div className="flex items-start gap-3">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: t.color }} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t.name}</p>
                <p className="text-xs text-fg-3">{t.description ?? 'No description'}</p>
                <p className="mt-2 text-xs text-fg-2">
                  {t.lead ? `Lead: ${t.lead.name}` : 'No lead'} · {t.clientCount} clients · {t.inboxCount} inboxes
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <AvatarStack users={t.members} max={6} size="sm" />
                  <span className="text-xs text-fg-3">{t.members.length} members</span>
                </div>
              </div>
              {isManager && (
                <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                  Edit
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      <Dialog
        open={edit.open}
        onOpenChange={(v) => setEdit((s) => ({ ...s, open: v }))}
        title={edit.team ? `Edit ${edit.team.name}` : 'New team'}
        footer={
          <>
            {edit.team && isAdmin && (
              <Button variant="ghost" className="mr-auto text-danger" onClick={remove}>
                Delete
              </Button>
            )}
            <Button onClick={save} disabled={!f.name.trim()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Team name">
              <Input value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} autoFocus />
            </Field>
            <Field label="Color">
              <Input type="color" value={f.color} onChange={(e) => setF((s) => ({ ...s, color: e.target.value }))} className="h-9 w-16 p-1" />
            </Field>
          </div>
          <Field label="Description">
            <Textarea rows={2} value={f.description} onChange={(e) => setF((s) => ({ ...s, description: e.target.value }))} />
          </Field>
          <Field label="Team lead" hint="Managers who lead a team see all of its conversations.">
            <Select value={f.leadId} onChange={(e) => setF((s) => ({ ...s, leadId: e.target.value }))}>
              <option value="">No lead</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Members">
            <UserChecklist users={users} value={members} onChange={setMembers} />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
