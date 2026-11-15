'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, LogOut, MessageSquare, Search, ShieldCheck, ShieldOff, Unlock, UserPlus } from 'lucide-react';
import { api, type Presence, type Role } from '@/lib/api';
import { ROLE_LABEL, cn, timeAgo } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge, PageHeader, PageLoader, Spinner } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Switch } from '@/components/ui/form';
import { CopyField } from '@/components/settings/copy-field';
import { useIdentity, type SignInSettings, type UserIdentity, type UserSignIn } from '@/components/settings/identity';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  department: string | null;
  avatarUrl: string | null;
  skills: string[];
  phone: string | null;
  active: boolean;
  invited: boolean;
  presence: Presence;
  onCall: boolean;
  lastSeenAt: string | null;
  teams: { id: string; name: string; color: string }[];
}

/** A password AscenTalk generated, shown to the admin exactly once. */
interface Handover {
  name: string;
  email: string;
  password: string;
}

const ROLES: Role[] = ['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNT_MANAGER', 'MEMBER', 'GUEST'];
const ROLE_HELP: Record<Role, string> = {
  OWNER: 'Full control, including other admins.',
  ADMIN: 'Manages people, inboxes and settings. Sees all communication.',
  MANAGER: 'Sees everything for their teams and clients. Reassigns and reports.',
  ACCOUNT_MANAGER: 'Owns clients and handles their conversations.',
  MEMBER: 'Team chat, plus conversations they are assigned or mentioned on.',
  GUEST: 'Freelancer. Only the channels and conversations they are added to.',
};

export default function PeoplePage() {
  const { isAdmin, me, teams, features } = useApp();
  const qc = useQueryClient();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState<UserRow | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [handover, setHandover] = useState<Handover | null>(null);
  const identity = useIdentity(isAdmin);
  const sso = identity.sso;
  const { data, isLoading } = useQuery({ queryKey: ['users', q, isAdmin], queryFn: () => api.get<{ users: UserRow[] }>('/users', { q, includeInactive: isAdmin || undefined }) });
  const { data: overview } = useQuery({
    queryKey: ['identity', 'overview'],
    queryFn: () => api.get<{ users: Record<string, UserSignIn> }>('/identity/overview'),
    enabled: sso && identity.ready,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['bootstrap'] });
    qc.invalidateQueries({ queryKey: ['identity', 'overview'] });
  };
  return (
    <div>
      <PageHeader
        title="People"
        subtitle={sso ? 'Everyone at the agency: their role, their teams and how they sign in.' : 'Everyone at the agency, their role and how to reach them.'}
        actions={
          isAdmin && (
            <Button onClick={() => setAdd(true)} disabled={sso && !identity.ready}>
              <UserPlus className="h-4 w-4" /> {sso ? 'Add person' : 'Invite'}
            </Button>
          )
        }
      />
      {isAdmin && sso && !identity.ready && (
        <p className="border-b border-border bg-warning/10 px-4 py-2 text-[13px] text-fg-2 md:px-6" role="status">
          The sign-in service (Keycloak) is not reachable yet, so accounts cannot be changed right now. {identity.error ? `Last error: ${identity.error}` : ''}
        </p>
      )}
      <div className="border-b border-border bg-surface px-4 py-2 md:px-6">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, title or skill" className="h-8 w-full rounded-lg border border-border bg-surface-2 pl-8 text-[13px] outline-none focus:border-primary" />
        </div>
      </div>
      {isLoading && <PageLoader />}
      <ul className="divide-y divide-border bg-surface">
        {data?.users.map((u) => {
          const signIn = overview?.users[u.id];
          return (
            <li key={u.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3 md:px-6', !u.active && 'opacity-50')}>
              <Avatar name={u.name} src={u.avatarUrl} userId={u.id} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">
                  {u.name} {u.id === me.id && <span className="font-normal text-fg-3">(you)</span>}
                </p>
                <p className="truncate text-xs text-fg-3">
                  {[u.title, u.department].filter(Boolean).join(' · ') || u.email}
                  {u.onCall ? ' · on a call' : u.presence === 'OFFLINE' && u.lastSeenAt ? ` · seen ${timeAgo(u.lastSeenAt)}` : ''}
                </p>
                {!!u.skills.length && <p className="mt-0.5 truncate text-[11px] text-fg-3">{u.skills.join(' · ')}</p>}
              </div>
              <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                {u.teams.map((t) => (
                  <Badge key={t.id} color={t.color}>
                    {t.name}
                  </Badge>
                ))}
              </div>
              {/* role badge follows the theme's accent; guests stay neutral */}
              <Badge className={u.role === 'GUEST' ? undefined : 'bg-primary-soft text-primary'}>{ROLE_LABEL[u.role]}</Badge>
              {signIn?.twoFactor && (
                <Badge color="#16a34a">
                  <ShieldCheck className="h-3 w-3" /> 2-step
                </Badge>
              )}
              {signIn?.mustChangePassword && <Badge color="#d97706">temporary password</Badge>}
              {signIn && !signIn.linked && <Badge color="#dc2626">no sign-in account</Badge>}
              {u.invited && !sso && <Badge color="#d97706">invited</Badge>}
              {!u.active && <Badge>deactivated</Badge>}
              {features.internalChat && features.dms && u.id !== me.id && u.active && !u.invited && (
                <Button size="icon-sm" variant="ghost" onClick={() => router.push(`/chat?dm=${u.id}`)} aria-label={`Message ${u.name}`}>
                  <MessageSquare className="h-4 w-4" />
                </Button>
              )}
              {isAdmin && (
                <Button size="xs" variant="outline" onClick={() => setEdit(u)}>
                  {sso ? 'Manage' : 'Edit'}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {sso ? (
        <AddPersonDialog open={add} onOpenChange={setAdd} teams={teams} onAdded={refresh} onHandover={setHandover} />
      ) : (
        <InviteDialog open={add} onOpenChange={setAdd} onInvited={(url) => (refresh(), setInviteUrl(url))} teams={teams} />
      )}
      <EditUserDialog user={edit} sso={sso} onClose={() => setEdit(null)} onSaved={refresh} onInviteUrl={setInviteUrl} onHandover={setHandover} />
      <Dialog open={Boolean(inviteUrl)} onOpenChange={(v) => !v && setInviteUrl(null)} title="Invite link" description="Share this link with your teammate. It expires in 7 days." size="md">
        {inviteUrl && <CopyField value={inviteUrl} />}
        <p className="mt-2 text-xs text-fg-3">If system email (SMTP) is configured, the invite was also emailed.</p>
      </Dialog>
      <Dialog
        open={Boolean(handover)}
        onOpenChange={(v) => !v && setHandover(null)}
        title="Temporary password"
        description={handover ? `Give this to ${handover.name}. It is shown only once.` : undefined}
        size="md"
        footer={<Button onClick={() => setHandover(null)}>Done</Button>}
      >
        {handover && (
          <div className="space-y-3">
            <CopyField label="Email" value={handover.email} />
            <CopyField label="Temporary password" value={handover.password} />
            <p className="text-xs text-fg-3">They will be asked to choose their own password the first time they sign in.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/** Role, job title and team: shared by "Invite" and "Add person". */
function PersonFields({ f, setF, teams }: { f: PersonForm; setF: (fn: (s: PersonForm) => PersonForm) => void; teams: { id: string; name: string }[] }) {
  const { me } = useApp();
  return (
    <>
      <Field label="Name">
        <Input value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} autoFocus />
      </Field>
      <Field label="Work email">
        <Input type="email" value={f.email} onChange={(e) => setF((s) => ({ ...s, email: e.target.value }))} />
      </Field>
      <Field label="Role" hint={ROLE_HELP[f.role]} className="sm:col-span-2">
        <Select value={f.role} onChange={(e) => setF((s) => ({ ...s, role: e.target.value as Role }))}>
          {ROLES.filter((r) => r !== 'OWNER' || me.role === 'OWNER').map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Job title">
        <Input value={f.title} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} />
      </Field>
      <Field label="Team">
        <Select value={f.teamId} onChange={(e) => setF((s) => ({ ...s, teamId: e.target.value }))}>
          <option value="">No team</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

interface PersonForm {
  name: string;
  email: string;
  role: Role;
  title: string;
  department: string;
  teamId: string;
}
const EMPTY_PERSON: PersonForm = { name: '', email: '', role: 'MEMBER', title: '', department: '', teamId: '' };
const personPayload = (f: PersonForm) => ({ name: f.name, email: f.email, role: f.role, title: f.title || undefined, department: f.department || undefined, teamIds: f.teamId ? [f.teamId] : [] });
const personValid = (f: PersonForm) => Boolean(f.name.trim()) && /.+@.+\..+/.test(f.email);

function InviteDialog({ open, onOpenChange, onInvited, teams }: { open: boolean; onOpenChange: (v: boolean) => void; onInvited: (url: string) => void; teams: { id: string; name: string }[] }) {
  const [f, setF] = useState<PersonForm>(EMPTY_PERSON);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ inviteUrl: string }>('/users/invite', personPayload(f));
      onOpenChange(false);
      setF(EMPTY_PERSON);
      onInvited(res.inviteUrl);
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
      title="Invite a teammate"
      footer={
        <Button onClick={submit} loading={loading} disabled={!personValid(f)}>
          Create invite
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <PersonFields f={f} setF={setF} teams={teams} />
      </div>
    </Dialog>
  );
}

/** Keycloak sign-in: the account is created right away, with a temporary password or an emailed set-up link. */
function AddPersonDialog({ open, onOpenChange, teams, onAdded, onHandover }: { open: boolean; onOpenChange: (v: boolean) => void; teams: { id: string; name: string }[]; onAdded: () => void; onHandover: (h: Handover) => void }) {
  const [f, setF] = useState<PersonForm>(EMPTY_PERSON);
  const [delivery, setDelivery] = useState<'temporary_password' | 'email'>('temporary_password');
  const [requireTwoFactor, setRequireTwoFactor] = useState(false);
  const [loading, setLoading] = useState(false);
  const { data: rules } = useQuery({ queryKey: ['identity', 'settings'], queryFn: () => api.get<{ settings: SignInSettings }>('/identity/settings'), enabled: open });
  const canEmail = Boolean(rules?.settings.emailConfigured);
  useEffect(() => {
    if (open && rules) setRequireTwoFactor(rules.settings.requireTwoFactorForNewUsers);
  }, [open, rules]);
  const submit = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ temporaryPassword: string | null; emailed: boolean }>('/users', { ...personPayload(f), delivery, requireTwoFactor });
      onOpenChange(false);
      onAdded();
      if (res.temporaryPassword) onHandover({ name: f.name, email: f.email, password: res.temporaryPassword });
      else toast.success(`${f.name} was added and emailed a link to set their password`);
      setF(EMPTY_PERSON);
      setDelivery('temporary_password');
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
      title="Add a person"
      description="Creates their sign-in account and their AscenTalk profile together."
      footer={
        <Button onClick={submit} loading={loading} disabled={!personValid(f)}>
          Add person
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <PersonFields f={f} setF={setF} teams={teams} />
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-[13px] font-medium">How do they get in the first time?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { id: 'temporary_password', title: 'Temporary password', text: 'You hand it over. They must change it at first sign-in.', disabled: false },
                { id: 'email', title: 'Email a set-up link', text: canEmail ? 'They choose their own password from the link.' : 'Needs outgoing email (SMTP_HOST in .env).', disabled: !canEmail },
              ] as const
            ).map((o) => (
              <label key={o.id} className={cn('flex cursor-pointer gap-2.5 rounded-lg border p-3', delivery === o.id ? 'border-primary bg-primary-soft' : 'border-border', o.disabled && 'cursor-not-allowed opacity-50')}>
                <input type="radio" name="delivery" className="mt-0.5 accent-[var(--primary)]" checked={delivery === o.id} disabled={o.disabled} onChange={() => setDelivery(o.id)} />
                <span>
                  <span className="block text-[13px] font-medium">{o.title}</span>
                  <span className="block text-xs text-fg-3">{o.text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 sm:col-span-2">
          <div>
            <p className="text-[13px] font-medium">Require two-step verification</p>
            <p className="text-xs text-fg-3">They set up an authenticator app at first sign-in.</p>
          </div>
          <Switch checked={requireTwoFactor} onChange={setRequireTwoFactor} label="Require two-step verification" />
        </div>
      </div>
    </Dialog>
  );
}

function EditUserDialog({ user, sso, onClose, onSaved, onInviteUrl, onHandover }: { user: UserRow | null; sso: boolean; onClose: () => void; onSaved: () => void; onInviteUrl: (url: string) => void; onHandover: (h: Handover) => void }) {
  const { teams, me } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  if (user && key !== user.id) {
    setKey(user.id);
    setName(user.name);
    setEmail(user.email);
    setRole(user.role);
    setTeamIds(user.teams.map((t) => t.id));
    setActive(user.active);
    setPassword('');
  }
  if (!user) return null;
  const self = user.id === me.id;
  const ownerLocked = user.role === 'OWNER' && me.role !== 'OWNER';
  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}`, {
        ...(self ? {} : { role, active }),
        teamIds,
        ...(sso && !ownerLocked ? { ...(name.trim() && name !== user.name ? { name: name.trim() } : {}), ...(email !== user.email ? { email } : {}) } : {}),
      });
      if (!sso && password) await api.post(`/users/${user.id}/reset-password`, { password });
      toast.success('Saved');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={user.name}
      description={user.email}
      size={sso ? 'lg' : 'md'}
      footer={
        <>
          {user.invited && !sso && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={async () => {
                const res = await api.post<{ inviteUrl: string }>(`/users/${user.id}/reinvite`);
                onClose();
                onInviteUrl(res.inviteUrl);
              }}
            >
              New invite link
            </Button>
          )}
          <Button onClick={save} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {sso && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={ownerLocked} />
            </Field>
            <Field label="Sign-in email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={ownerLocked} />
            </Field>
          </div>
        )}
        <Field label="Role" hint={ROLE_HELP[role]}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={self || ownerLocked}>
            {ROLES.filter((r) => me.role === 'OWNER' || r !== 'OWNER' || user.role === 'OWNER').map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="mb-1.5 text-[13px] font-medium">Teams</p>
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => {
              const on = teamIds.includes(t.id);
              return (
                <button key={t.id} onClick={() => setTeamIds(on ? teamIds.filter((x) => x !== t.id) : [...teamIds, t.id])} className={cn('rounded-full border px-3 py-1 text-xs font-medium', on ? 'border-primary bg-primary-soft text-primary' : 'border-border text-fg-2')} aria-pressed={on}>
                  {t.name}
                </button>
              );
            })}
            {!teams.length && <span className="text-xs text-fg-3">No teams yet</span>}
          </div>
        </div>
        {!self && (
          <>
            {!sso && (
              <Field label="Set a new password (optional)" hint="At least 8 characters. Signs them out everywhere.">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </Field>
            )}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-[13px] font-medium">Account active</p>
                <p className="text-xs text-fg-3">Deactivated people can’t sign in. Their history stays.</p>
              </div>
              <Switch checked={active} onChange={setActive} label="Account active" disabled={ownerLocked} />
            </div>
          </>
        )}
        {sso && !ownerLocked && <SignInPanel user={user} onHandover={onHandover} />}
      </div>
    </Dialog>
  );
}

/** Password, two-step verification, sessions and lockout for one person. Each action applies immediately. */
function SignInPanel({ user, onHandover }: { user: UserRow; onHandover: (h: Handover) => void }) {
  const qc = useQueryClient();
  const queryKey = ['identity', 'user', user.id];
  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => api.get<{ identity: UserIdentity }>(`/users/${user.id}/identity`), retry: false });
  const { data: rules } = useQuery({ queryKey: ['identity', 'settings'], queryFn: () => api.get<{ settings: SignInSettings }>('/identity/settings') });
  const [busy, setBusy] = useState<string | null>(null);
  const id = data?.identity;

  const run = async (name: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(name);
    try {
      await fn();
      if (done) toast.success(done);
      await qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['identity', 'overview'] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const row = 'flex flex-wrap items-center justify-between gap-3 px-3 py-2.5';
  return (
    <section className="rounded-lg border border-border" aria-label="Sign-in">
      <header className="border-b border-border px-3 py-2">
        <h4 className="text-[13px] font-semibold">Sign-in</h4>
      </header>
      {isLoading && (
        <p className="inline-flex items-center gap-2 px-3 py-3 text-xs text-fg-3">
          <Spinner className="h-3 w-3" /> Loading sign-in details…
        </p>
      )}
      {error && <p className="px-3 py-3 text-xs text-danger">{(error as Error).message}</p>}
      {id && (
        <div className="divide-y divide-border">
          {id.locked && (
            <div className={cn(row, 'bg-danger/10')}>
              <p className="text-[13px]">
                <span className="font-medium text-danger">Locked</span> after {id.failedAttempts} failed sign-in attempts{id.lastFailureAt ? `, last ${timeAgo(id.lastFailureAt)}` : ''}.
              </p>
              <Button size="xs" variant="outline" loading={busy === 'unlock'} onClick={() => run('unlock', () => api.post(`/users/${user.id}/unlock`), 'Account unlocked')}>
                <Unlock className="h-3.5 w-3.5" /> Unlock
              </Button>
            </div>
          )}
          <div className={row}>
            <div className="min-w-0">
              <p className="text-[13px] font-medium">Password</p>
              <p className="text-xs text-fg-3">{id.mustChangePassword ? 'Temporary: they must choose a new one at the next sign-in.' : id.hasPassword ? 'Set by the person.' : 'Not set yet.'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="xs"
                variant="outline"
                loading={busy === 'temp'}
                onClick={() =>
                  confirm(`Give ${user.name} a new temporary password? They will be signed out everywhere.`) &&
                  run('temp', async () => {
                    const res = await api.post<{ temporaryPassword: string | null }>(`/users/${user.id}/reset-password`, { delivery: 'temporary_password' });
                    if (res.temporaryPassword) onHandover({ name: user.name, email: user.email, password: res.temporaryPassword });
                  })
                }
              >
                <KeyRound className="h-3.5 w-3.5" /> New temporary password
              </Button>
              {rules?.settings.emailConfigured && (
                <Button size="xs" variant="outline" loading={busy === 'email'} onClick={() => run('email', () => api.post(`/users/${user.id}/reset-password`, { delivery: 'email' }), 'Reset link emailed')}>
                  Email reset link
                </Button>
              )}
            </div>
          </div>
          <div className={row}>
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[13px] font-medium">
                {id.twoFactor ? <ShieldCheck className="h-3.5 w-3.5 text-success" /> : <ShieldOff className="h-3.5 w-3.5 text-fg-3" />} Two-step verification
              </p>
              <p className="text-xs text-fg-3">{id.twoFactor ? 'On, with an authenticator app.' : id.twoFactorRequired ? 'Off. They will be asked to set it up at the next sign-in.' : 'Off.'}</p>
            </div>
            {id.twoFactor ? (
              <Button
                size="xs"
                variant="outline"
                loading={busy === '2fa'}
                onClick={() => confirm(`Remove ${user.name}'s authenticator? They will set up a new one at the next sign-in.`) && run('2fa', () => api.post(`/users/${user.id}/two-factor`, { reset: true }), 'Authenticator removed')}
              >
                Reset authenticator
              </Button>
            ) : (
              <label className="inline-flex items-center gap-2 text-xs text-fg-2">
                Require at next sign-in
                <Switch checked={id.twoFactorRequired} disabled={busy === '2fa'} onChange={(v) => run('2fa', () => api.post(`/users/${user.id}/two-factor`, { required: v }))} label="Require two-step verification at next sign-in" />
              </label>
            )}
          </div>
          <div className={row}>
            <div className="min-w-0">
              <p className="text-[13px] font-medium">Active sessions</p>
              <p className="text-xs text-fg-3">
                {id.sessions.length
                  ? `${id.sessions.length} signed-in ${id.sessions.length === 1 ? 'browser' : 'browsers'}, last active ${timeAgo(id.sessions.map((s) => s.lastSeenAt).sort().at(-1)!)} from ${id.sessions[0].ip}`
                  : 'Not signed in anywhere.'}
              </p>
            </div>
            <Button size="xs" variant="outline" loading={busy === 'out'} disabled={!id.sessions.length} onClick={() => run('out', () => api.post(`/users/${user.id}/sign-out`), `${user.name} was signed out everywhere`)}>
              <LogOut className="h-3.5 w-3.5" /> Sign out everywhere
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
