'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Spinner } from '@/components/ui/misc';

/** How people sign in on this installation (GET /api/auth/config). */
interface AuthConfig {
  provider: 'keycloak' | 'local';
  ready: boolean;
  localFallback: boolean;
}

// Reasons a single sign-on attempt can come back to this page (?error=<code>).
const SSO_ERRORS: Record<string, string> = {
  origin: 'Sign-in is not set up for this address. Ask an admin to add it to SSO_ALLOWED_ORIGINS in .env.',
  starting: 'The sign-in service is still starting. Try again in a moment.',
  expired: 'That sign-in attempt expired. Please try again.',
  denied: 'Sign-in was cancelled.',
  failed: 'Sign-in did not complete. Please try again.',
  invalid: 'Sign-in did not complete. Please try again.',
  deactivated: 'Your account is deactivated. Ask an admin to reactivate it.',
  not_provisioned: 'You do not have an AscenTalk account yet. Ask an admin to add you.',
  no_email: 'Your sign-in account has no email address. Ask an admin to fix it.',
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [agency, setAgency] = useState<string | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);

  const next = params.get('next') || '/inbox';
  const ssoError = params.get('error');
  const wantsPasswordForm = params.get('local') === '1';
  const ssoUrl = (prompt?: 'login') => `/api/auth/sso/start?next=${encodeURIComponent(next)}${prompt ? `&prompt=${prompt}` : ''}`;

  useEffect(() => {
    let cancelled = false;
    api.get<{ agency: string }>('/public/config').then((c) => !cancelled && setAgency(c.agency)).catch(() => undefined);
    (async () => {
      const signedIn = await api.get('/auth/me').then(
        () => true,
        () => false,
      );
      if (cancelled) return;
      if (signedIn) return router.replace(next);
      const cfg = await api.get<AuthConfig>('/auth/config').catch(() => ({ provider: 'local', ready: true, localFallback: true }) as AuthConfig);
      if (cancelled) return;
      setConfig(cfg);
      // With Keycloak there is no form here: go straight to its sign-in page unless we are showing an error.
      if (cfg.provider === 'keycloak' && cfg.ready && !ssoError && !(wantsPasswordForm && cfg.localFallback)) {
        window.location.href = `/api/auth/sso/start?next=${encodeURIComponent(next)}`;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, next, ssoError, wantsPasswordForm]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/login', { email, password });
      qc.clear();
      router.replace(next);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const heading = (
    <div>
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-fg-3">{agency ? `Welcome back to ${agency}` : 'Welcome back'}</p>
    </div>
  );

  if (!config) {
    return (
      <div className="space-y-5">
        {heading}
        <p className="inline-flex items-center gap-2 text-sm text-fg-3">
          <Spinner className="h-4 w-4" /> One moment…
        </p>
      </div>
    );
  }

  const sso = config.provider === 'keycloak';
  if (sso && !(wantsPasswordForm && config.localFallback)) {
    const message = ssoError ? (SSO_ERRORS[ssoError] ?? SSO_ERRORS.failed) : !config.ready ? SSO_ERRORS.starting : null;
    return (
      <div className="space-y-5">
        {heading}
        {message ? (
          <>
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {message}
            </p>
            <Button className="w-full" onClick={() => (window.location.href = ssoUrl())}>
              Try again
            </Button>
            {(ssoError === 'deactivated' || ssoError === 'not_provisioned') && (
              <p className="text-center text-sm">
                <a href={ssoUrl('login')} className="text-primary hover:underline">
                  Sign in with a different account
                </a>
              </p>
            )}
          </>
        ) : (
          <p className="inline-flex items-center gap-2 text-sm text-fg-3">
            <Spinner className="h-4 w-4" /> Taking you to the sign-in page…
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {heading}
      {sso && <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-fg-2">Emergency access for the owner account. Everyone else signs in through the normal sign-in page.</p>}
      <Field label="Work email">
        <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>
        Sign in
      </Button>
      <p className="text-center text-sm">
        {sso ? (
          <a href={ssoUrl()} className="text-primary hover:underline">
            Back to normal sign-in
          </a>
        ) : (
          <Link href="/forgot" className="text-primary hover:underline">
            Forgot password?
          </Link>
        )}
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
