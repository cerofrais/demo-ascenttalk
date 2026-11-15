'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** GET /api/identity: how sign-in works on this installation (admins only). */
export interface IdentityStatus {
  provider: 'keycloak' | 'local';
  ready: boolean;
  error?: string | null;
  realm?: string;
  /** Keycloak's own admin console (only reachable on the server itself) */
  consoleUrl?: string;
  accountUrl?: string;
  allowedOrigins?: string[];
  localFallback?: boolean;
}

/** Sign-in rules an admin can change (stored in Keycloak). */
export interface SignInSettings {
  passwordMinLength: number;
  passwordRequireMixed: boolean;
  passwordRequireSpecial: boolean;
  lockoutEnabled: boolean;
  lockoutAfter: number;
  forgotPassword: boolean;
  rememberMe: boolean;
  requireTwoFactorForNewUsers: boolean;
  sessionIdleHours: number;
  emailConfigured: boolean;
}

/** One row of GET /api/identity/overview. */
export interface UserSignIn {
  linked: boolean;
  enabled?: boolean;
  twoFactor?: boolean;
  mustChangePassword?: boolean;
  twoFactorRequired?: boolean;
}

/** GET /api/users/:id/identity */
export interface UserIdentity {
  enabled: boolean;
  username: string;
  hasPassword: boolean;
  mustChangePassword: boolean;
  twoFactor: boolean;
  twoFactorRequired: boolean;
  locked: boolean;
  failedAttempts: number;
  lastFailureAt: string | null;
  createdAt: string | null;
  sessions: { id: string; ip: string; startedAt: string; lastSeenAt: string }[];
}

/** `sso` is true when people sign in through Keycloak and accounts are managed there. */
export function useIdentity(enabled: boolean) {
  const { data } = useQuery({ queryKey: ['identity'], queryFn: () => api.get<IdentityStatus>('/identity'), enabled, staleTime: 30_000, refetchInterval: (q) => (q.state.data && !q.state.data.ready ? 5000 : false) });
  return { status: data, sso: data?.provider === 'keycloak', ready: Boolean(data?.ready), error: data?.error ?? null };
}

/** For any signed-in person: is their password managed by Keycloak, and where is their account page? */
export function useAuthConfig() {
  const { data } = useQuery({ queryKey: ['auth-config'], queryFn: () => api.get<{ provider: 'keycloak' | 'local'; accountUrl: string | null }>('/auth/config'), staleTime: 5 * 60_000 });
  return data;
}
