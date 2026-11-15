'use client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleSlash } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/hooks/use-bootstrap';
import { Badge, Card, Empty, PageHeader, PageLoader } from '@/components/ui/misc';
import { CopyField } from '@/components/settings/copy-field';

const INTEGRATIONS: { key: string; label: string; env: string; what: string }[] = [
  { key: 'evolution', label: 'WhatsApp (Evolution API)', env: 'EVOLUTION_API_KEY', what: 'Connect WhatsApp numbers by QR code' },
  { key: 'plivo', label: 'Calling (Plivo)', env: 'PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN', what: 'Phone lines, softphone, recordings' },
  { key: 'google', label: 'Google sign-in for mailboxes', env: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET', what: 'Connect Gmail / Workspace mailboxes' },
  { key: 'microsoft', label: 'Microsoft sign-in for mailboxes', env: 'MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET', what: 'Connect Microsoft 365 / Outlook mailboxes' },
  { key: 'meta', label: 'Meta webhook signature', env: 'META_APP_SECRET', what: 'Verifies Messenger / Instagram webhooks' },
  { key: 'smtp', label: 'System email', env: 'SMTP_HOST …', what: 'Emails invites and password resets' },
  { key: 'googleApiKey', label: 'Google Drive link titles', env: 'GOOGLE_API_KEY', what: 'Shows real file names for pasted Drive links' },
];

function Flag({ on }: { on: boolean }) {
  return on ? <CheckCircle2 className="h-4 w-4 text-success" aria-label="On" /> : <CircleSlash className="h-4 w-4 text-fg-3" aria-label="Off" />;
}

function FlagTree({ node, path = '' }: { node: Record<string, any>; path?: string }) {
  return (
    <ul className={path ? 'ml-4 border-l border-border pl-3' : ''}>
      {Object.entries(node).map(([k, v]) => {
        const full = path ? `${path}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          return (
            <li key={full} className="py-1">
              <span className="flex items-center gap-2 text-[13px] font-medium">
                {'enabled' in v && <Flag on={v.enabled !== false} />}
                <code className="text-xs">{k}</code>
              </span>
              <FlagTree node={Object.fromEntries(Object.entries(v).filter(([kk]) => kk !== 'enabled'))} path={full} />
            </li>
          );
        }
        return (
          <li key={full} className="flex items-center gap-2 py-0.5 text-[13px]">
            {typeof v === 'boolean' ? <Flag on={v} /> : <span className="h-4 w-4" />}
            <code className="text-xs text-fg-2">{k}</code>
            {typeof v !== 'boolean' && <Badge>{String(v)}</Badge>}
          </li>
        );
      })}
    </ul>
  );
}

export default function FeaturesPage() {
  const { isAdmin, integrations } = useApp();
  const { data, isLoading } = useQuery({ queryKey: ['settings-features'], queryFn: () => api.get<{ file: string; features: Record<string, any> }>('/settings/features'), enabled: isAdmin });
  if (!isAdmin) return <Empty title="Only admins can view this" />;
  return (
    <div>
      <PageHeader title="Features & integrations" subtitle="What’s switched on, and which provider keys are set. Both are controlled by files on the server, so they can’t be changed by accident from the browser." />
      <div className="grid max-w-5xl gap-4 p-4 md:p-6 lg:grid-cols-2">
        <Card title="Integrations (.env)">
          <ul className="space-y-3">
            {INTEGRATIONS.map((i) => {
              const on = Boolean(integrations?.[i.key]);
              return (
                <li key={i.key} className="flex items-start gap-3">
                  <span className="mt-0.5">
                    <Flag on={on} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">
                      {i.label} {!on && <span className="font-normal text-fg-3">· not set</span>}
                    </p>
                    <p className="text-xs text-fg-3">{i.what}</p>
                    {!on && <code className="text-[11px] text-fg-3">{i.env}</code>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4">
            <CopyField label="Public URL used for provider callbacks" value={String(integrations?.publicUrl ?? '')} />
            <p className="mt-1 text-xs text-fg-3">Plivo, Meta and Telegram webhooks need this to be reachable from the internet (set PUBLIC_URL, or USE_TUNNEL=true for local testing).</p>
          </div>
        </Card>
        <Card title="Feature switches (config/features.json)">
          {isLoading && <PageLoader />}
          {data && (
            <>
              <p className="mb-3 text-xs text-fg-3">
                Edit <code className="rounded bg-surface-2 px-1">{data.file}</code> on the server. Changes apply within a few seconds, no restart needed.
              </p>
              <FlagTree node={data.features} />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
