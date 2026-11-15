'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Lock, Monitor, Smartphone, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { useVoiceConfig } from '@/components/shell/softphone';
import { useAuthConfig } from '@/components/settings/identity';
import { ROLE_LABEL, cn } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge, Card, PageHeader } from '@/components/ui/misc';
import { Field, Input } from '@/components/ui/form';
import { useQueryClient } from '@tanstack/react-query';

export default function ProfilePage() {
  const { me, refetch, features } = useApp();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: me.name, title: me.title ?? '', department: me.department ?? '', phone: me.phone ?? '', skills: me.skills.join(', '), statusText: me.statusText ?? '' });
  const authConfig = useAuthConfig();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setF({ name: me.name, title: me.title ?? '', department: me.department ?? '', phone: me.phone ?? '', skills: me.skills.join(', '), statusText: me.statusText ?? '' }), [me]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const { data: voice } = useVoiceConfig();
  // read after mount: the server render has no window
  const [here, setHere] = useState({ secure: true, origin: '' });
  useEffect(() => setHere({ secure: window.isSecureContext, origin: window.location.origin }), []);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/users/${me.id}`, { name: f.name, title: f.title || null, department: f.department || null, phone: f.phone || null, statusText: f.statusText || null, skills: f.skills.split(',').map((s) => s.trim()).filter(Boolean) });
      refetch();
      toast.success('Profile saved');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  const setCallMode = async (callMode: 'SOFTPHONE' | 'MOBILE') => {
    if (callMode === 'MOBILE' && !f.phone.trim()) return void toast.error('Add your mobile number above first');
    try {
      await api.patch(`/users/${me.id}`, { callMode, phone: f.phone || null });
      refetch();
      qc.invalidateQueries({ queryKey: ['voice-config'] });
      toast.success(callMode === 'MOBILE' ? 'Calls will ring your mobile' : 'Calls will use the browser softphone');
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/me/avatar', { method: 'POST', body: fd, credentials: 'include' });
    if (!res.ok) return void toast.error('Upload failed');
    refetch();
  };
  const changePassword = async () => {
    try {
      await api.post('/auth/password', pw);
      setPw({ currentPassword: '', newPassword: '' });
      toast.success('Password changed');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader title="My profile" subtitle="How you appear to teammates, and how you take calls." />
      <div className="max-w-3xl space-y-4 p-4 md:p-6">
        <Card>
          <div className="flex items-center gap-4">
            <Avatar name={me.name} src={me.avatarUrl} size="xl" />
            <div>
              <p className="font-semibold">{me.name}</p>
              <p className="text-sm text-fg-3">{me.email}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge color="#ad5700">{ROLE_LABEL[me.role]}</Badge>
                {me.teams.map((t) => (
                  <Badge key={t.id} color={t.color}>
                    {t.name}
                  </Badge>
                ))}
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => uploadAvatar(e.target.files?.[0])} />
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Photo
            </Button>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={f.name} onChange={set('name')} />
            </Field>
            <Field label="Job title">
              <Input value={f.title} onChange={set('title')} placeholder="Senior Designer" />
            </Field>
            <Field label="Department">
              <Input value={f.department} onChange={set('department')} placeholder="Creative, Performance, Accounts…" />
            </Field>
            <Field label="Mobile number" hint="With country code. Used when calls ring your mobile.">
              <Input value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="+91…" />
            </Field>
            <Field label="Skills" hint="Comma separated. Helps teammates find the right person.">
              <Input value={f.skills} onChange={set('skills')} placeholder="design, meta-ads, seo" />
            </Field>
            <Field label="Status message">
              <Input value={f.statusText} onChange={set('statusText')} placeholder="In a shoot till 4pm" maxLength={100} />
            </Field>
          </div>
          <Button className="mt-4" onClick={save} loading={saving}>
            Save profile
          </Button>
        </Card>

        {features.channels.VOICE && (
          <Card title="How I take calls">
            <p className="mb-3 text-sm text-fg-2">Calls to the agency number ring you this way, and calls you start from AscenTalk use it too.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  mode: 'SOFTPHONE' as const,
                  icon: Monitor,
                  title: 'In the browser',
                  text: 'Make and answer calls here with your headset. Needs AscenTalk open.',
                  note: here.secure ? null : 'Not on this address: it is not https.',
                  on: features.voice.softphone,
                },
                {
                  mode: 'MOBILE' as const,
                  icon: Smartphone,
                  title: 'On my mobile',
                  text: 'We ring your phone and connect the client. They see the agency number.',
                  note: f.phone.trim() ? `Rings ${f.phone.trim()}` : 'Add your mobile number above first.',
                  on: features.voice.mobileBridge,
                },
              ]
                .filter((o) => o.on)
                .map((o) => (
                  <button
                    key={o.mode}
                    onClick={() => setCallMode(o.mode)}
                    className={cn('rounded-xl border p-4 text-left transition-colors', me.callMode === o.mode ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-2')}
                    aria-pressed={me.callMode === o.mode}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <o.icon className={cn('h-5 w-5', me.callMode === o.mode ? 'text-primary' : 'text-fg-3')} />
                      {me.callMode === o.mode && <span className="text-xs font-medium text-primary">Selected</span>}
                    </span>
                    <p className="mt-2 text-sm font-semibold">{o.title}</p>
                    <p className="mt-0.5 text-xs text-fg-3">{o.text}</p>
                    {o.note && <p className="mt-1.5 text-xs font-medium text-fg-2">{o.note}</p>}
                  </button>
                ))}
            </div>
            {me.callMode === 'SOFTPHONE' && features.voice.softphone && !here.secure && (
              <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-fg-2">
                <p>
                  Your browser blocks the microphone on {here.origin} because it is not an https address, so calls cannot ring or be made here.
                </p>
                {voice?.secureUrl ? (
                  <a href={`${voice.secureUrl}/settings/profile`} className="mt-2 inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
                    <Lock className="h-3.5 w-3.5" /> Open AscenTalk at {voice.secureUrl.replace(/^https:\/\//, '')}
                  </a>
                ) : (
                  <p className="mt-1">Choose On my mobile, or ask an admin to set up an https address.</p>
                )}
              </div>
            )}
          </Card>
        )}

        {authConfig?.provider === 'keycloak' ? (
          <Card title="Password and two-step verification">
            <p className="text-sm text-fg-2">Your password, authenticator app and signed-in devices are managed on your sign-in account page.</p>
            <a href={authConfig.accountUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-fg hover:bg-surface-2">
              Open my sign-in account
            </a>
          </Card>
        ) : (
          <Card title="Change password">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Current password">
                <Input type="password" value={pw.currentPassword} onChange={(e) => setPw((s) => ({ ...s, currentPassword: e.target.value }))} autoComplete="current-password" />
              </Field>
              <Field label="New password" hint="At least 8 characters">
                <Input type="password" value={pw.newPassword} onChange={(e) => setPw((s) => ({ ...s, newPassword: e.target.value }))} autoComplete="new-password" />
              </Field>
            </div>
            <Button className="mt-4" variant="outline" onClick={changePassword} disabled={!pw.currentPassword || pw.newPassword.length < 8}>
              Update password
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
