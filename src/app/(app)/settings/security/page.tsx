'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/hooks/use-bootstrap';
import { Button } from '@/components/ui/button';
import { Card, Empty, PageHeader, PageLoader } from '@/components/ui/misc';
import { Field, Input, Switch } from '@/components/ui/form';
import { CopyField } from '@/components/settings/copy-field';
import { useIdentity, type SignInSettings } from '@/components/settings/identity';

type Editable = Omit<SignInSettings, 'emailConfigured'>;

function Toggle({ title, text, checked, onChange, disabled }: { title: string; text: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{title}</p>
        <p className="text-xs text-fg-3">{text}</p>
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  );
}

export default function SignInSecurityPage() {
  const { isAdmin } = useApp();
  const qc = useQueryClient();
  const identity = useIdentity(isAdmin);
  const { data, isLoading } = useQuery({ queryKey: ['identity', 'settings'], queryFn: () => api.get<{ settings: SignInSettings }>('/identity/settings'), enabled: identity.sso && identity.ready });
  const [form, setForm] = useState<Editable | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (data) {
      const { emailConfigured: _emailConfigured, ...editable } = data.settings;
      setForm(editable);
    }
  }, [data]);

  if (!isAdmin) return <Empty title="Admins only">Ask an admin to change sign-in rules.</Empty>;
  if (!identity.status) return <PageLoader />;

  const header = <PageHeader title="Sign-in & security" subtitle="How people sign in, and the rules their passwords and sessions follow." />;

  if (!identity.sso) {
    return (
      <div>
        {header}
        <div className="max-w-3xl p-4 md:p-6">
          <Card title="AscenTalk passwords">
            <p className="text-sm text-fg-2">
              This installation uses AscenTalk&apos;s built-in email and password sign-in. Set <code className="rounded bg-surface-2 px-1">AUTH_PROVIDER=keycloak</code> in <code className="rounded bg-surface-2 px-1">.env</code> and restart to get two-step verification, lockout rules, password policies and session control here.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  const settings = data?.settings;
  const dirty = Boolean(form && settings && (Object.keys(form) as (keyof Editable)[]).some((k) => form[k] !== settings[k]));
  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await api.put('/identity/settings', form);
      await qc.invalidateQueries({ queryKey: ['identity', 'settings'] });
      toast.success('Sign-in rules saved');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  const act = async (name: string, fn: () => Promise<string>) => {
    setBusy(name);
    try {
      toast.success(await fn());
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['identity'] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {header}
      <div className="max-w-3xl space-y-4 p-4 md:p-6">
        <Card title="Sign-in service">
          <div className="flex items-start gap-3">
            {identity.ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />}
            <div className="min-w-0 text-sm">
              <p className="font-medium">{identity.ready ? 'Keycloak is connected' : 'Keycloak is not reachable yet'}</p>
              <p className="text-fg-3">
                {identity.ready
                  ? 'People sign in on Keycloak’s page and land back here. Passwords never touch AscenTalk.'
                  : (identity.error ?? 'It can take about a minute after the stack starts.')}
              </p>
            </div>
          </div>
          {!!identity.status.allowedOrigins?.length && (
            <p className="mt-3 text-xs text-fg-3">
              Sign-in works from: {identity.status.allowedOrigins.join(', ')}. Add other addresses with <code className="rounded bg-surface-2 px-1">SSO_ALLOWED_ORIGINS</code> in <code className="rounded bg-surface-2 px-1">.env</code>.
            </p>
          )}
        </Card>

        {identity.ready && (isLoading || !form || !settings) && <PageLoader />}
        {identity.ready && form && settings && (
          <>
            <Card
              title="Passwords"
              actions={
                <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
                  Save changes
                </Button>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Minimum length" hint="8 to 64 characters">
                  <Input type="number" min={8} max={64} value={form.passwordMinLength} onChange={(e) => set('passwordMinLength', Math.min(64, Math.max(8, Number(e.target.value) || 8)))} />
                </Field>
              </div>
              <div className="mt-2 divide-y divide-border">
                <Toggle title="Require upper case, lower case and a digit" text="Applies the next time someone sets a password." checked={form.passwordRequireMixed} onChange={(v) => set('passwordRequireMixed', v)} />
                <Toggle title="Require a special character" text="Such as ! @ # %." checked={form.passwordRequireSpecial} onChange={(v) => set('passwordRequireSpecial', v)} />
                <Toggle
                  title="“Forgot password?” on the sign-in page"
                  text={settings.emailConfigured ? 'People can email themselves a reset link.' : 'Needs outgoing email: set SMTP_HOST in .env and restart.'}
                  checked={form.forgotPassword}
                  onChange={(v) => set('forgotPassword', v)}
                  disabled={!settings.emailConfigured && !form.forgotPassword}
                />
              </div>
            </Card>

            <Card title="Protection">
              <div className="divide-y divide-border">
                <Toggle title="Lock accounts after repeated wrong passwords" text="Stops password guessing. A lock lifts by itself after a wait of up to 15 minutes; admins can unlock sooner from People." checked={form.lockoutEnabled} onChange={(v) => set('lockoutEnabled', v)} />
                {form.lockoutEnabled && (
                  <div className="py-3 sm:w-1/2">
                    <Field label="Wrong attempts before locking" hint="3 to 50">
                      <Input type="number" min={3} max={50} value={form.lockoutAfter} onChange={(e) => set('lockoutAfter', Math.min(50, Math.max(3, Number(e.target.value) || 3)))} />
                    </Field>
                  </div>
                )}
                <Toggle title="Require two-step verification for new people" text="The default when you add someone. You can still switch it off for one person in the Add person dialog." checked={form.requireTwoFactorForNewUsers} onChange={(v) => set('requireTwoFactorForNewUsers', v)} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-1.5 text-[13px] font-medium">
                    <ShieldCheck className="h-4 w-4 text-success" /> Require it for everyone now
                  </p>
                  <p className="text-xs text-fg-3">Everyone without an authenticator app is asked to set one up at their next sign-in.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy === '2fa'}
                  onClick={() =>
                    confirm('Ask everyone who has not set up two-step verification to do so at their next sign-in?') &&
                    act('2fa', async () => {
                      const res = await api.post<{ count: number }>('/identity/require-two-factor');
                      return res.count ? `${res.count} ${res.count === 1 ? 'person' : 'people'} will be asked at next sign-in` : 'Everyone already has it or has been asked';
                    })
                  }
                >
                  Require for everyone
                </Button>
              </div>
            </Card>

            <Card title="Sessions">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Sign out after inactivity (hours)" hint="Counts activity in AscenTalk. Takes effect within five minutes.">
                  <Input type="number" min={1} max={720} value={form.sessionIdleHours} onChange={(e) => set('sessionIdleHours', Math.min(720, Math.max(1, Number(e.target.value) || 1)))} />
                </Field>
              </div>
              <div className="mt-2 divide-y divide-border">
                <Toggle title="“Remember me” on the sign-in page" text="Keeps people signed in on that browser after it is closed." checked={form.rememberMe} onChange={(v) => set('rememberMe', v)} />
              </div>
              {dirty && <p className="mt-2 text-xs text-warning">You have unsaved changes. Use “Save changes” in the Passwords card.</p>}
            </Card>

            <Card title="Advanced">
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">Sync accounts</p>
                    <p className="text-xs text-fg-3">Brings in accounts created directly in Keycloak and repairs any that are missing there.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy === 'sync'}
                    onClick={() =>
                      act('sync', async () => {
                        const r = await api.post<{ created: number; linked: number; imported: number }>('/identity/sync');
                        return r.created + r.linked + r.imported ? `Synced: ${r.imported} imported, ${r.created} created, ${r.linked} linked` : 'Everything is already in sync';
                      })
                    }
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Sync now
                  </Button>
                </div>
                {identity.status.consoleUrl && (
                  <div>
                    <p className="text-[13px] font-medium">Keycloak admin console</p>
                    <p className="mb-2 text-xs text-fg-3">
                      For things not covered here, such as signing in with Google or Microsoft, LDAP, or custom sign-in flows. It only opens on the server itself; sign in with <code className="rounded bg-surface-2 px-1">KEYCLOAK_ADMIN</code> from <code className="rounded bg-surface-2 px-1">.env</code>, realm “{identity.status.realm}”.
                    </p>
                    <CopyField value={identity.status.consoleUrl} />
                    <a href={identity.status.consoleUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      Open console <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
