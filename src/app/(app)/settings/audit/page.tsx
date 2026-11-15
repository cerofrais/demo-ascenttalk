'use client';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { timeFull } from '@/lib/utils';
import { useApp } from '@/hooks/use-bootstrap';
import { Button } from '@/components/ui/button';
import { Card, Empty, PageHeader, PageLoader } from '@/components/ui/misc';
import { Select } from '@/components/ui/form';

interface Log {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

export default function AuditPage() {
  const { isAdmin, features } = useApp();
  const [action, setAction] = useState('');
  const query = useInfiniteQuery({
    queryKey: ['audit-logs', action],
    queryFn: ({ pageParam }) => api.get<{ logs: Log[] }>('/audit-logs', { action, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.logs.length === 100 ? last.logs[last.logs.length - 1].createdAt : undefined),
    enabled: isAdmin && features.auditLog,
  });
  if (!isAdmin) return <Empty title="Only admins can view the audit log" />;
  const logs = query.data?.pages.flatMap((p) => p.logs) ?? [];
  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Sign-ins, settings changes and oversight access to private content."
        actions={
          <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-auto" aria-label="Filter by action">
            <option value="">All actions</option>
            <option value="auth">Sign-ins</option>
            <option value="oversight">Oversight access</option>
            <option value="user">People</option>
            <option value="inbox">Inboxes</option>
            <option value="client">Clients</option>
            <option value="team">Teams</option>
          </Select>
        }
      />
      <div className="p-4 md:p-6">
        <Card padded={false}>
          {query.isLoading && <PageLoader />}
          {!query.isLoading && !logs.length && <Empty title="Nothing logged yet" />}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="border-b border-border bg-surface-2 text-[11px] tracking-wide text-fg-3 uppercase">
                <tr>
                  <th className="px-4 py-2 font-semibold">When</th>
                  <th className="px-3 py-2 font-semibold">Who</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                  <th className="px-3 py-2 font-semibold">Details</th>
                  <th className="px-4 py-2 font-semibold">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((l) => (
                  <tr key={l.id} className="align-top hover:bg-surface-2">
                    <td className="px-4 py-2 whitespace-nowrap text-fg-2">{timeFull(l.createdAt)}</td>
                    <td className="px-3 py-2">{l.actor?.name ?? 'System'}</td>
                    <td className="px-3 py-2">
                      <code className={l.action.startsWith('oversight') ? 'text-xs text-warning' : 'text-xs'}>{l.action}</code>
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-xs text-fg-3">{Object.keys(l.data ?? {}).length ? JSON.stringify(l.data) : (l.targetType ?? '')}</td>
                    <td className="px-4 py-2 text-xs text-fg-3">{l.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.hasNextPage && (
            <div className="border-t border-border p-3">
              <Button variant="outline" size="sm" className="w-full" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                Load older entries
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
