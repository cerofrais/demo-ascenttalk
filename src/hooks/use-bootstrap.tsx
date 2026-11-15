'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Bootstrap } from '@/lib/api';
import { isAdminRole, isManagerRole } from '@/lib/utils';

interface Ctx extends Bootstrap {
  refetch: () => void;
  isAdmin: boolean;
  isManager: boolean;
  userById: (id: string | null | undefined) => Bootstrap['users'][number] | undefined;
}

const BootstrapContext = createContext<Ctx | null>(null);

export function useBootstrapQuery() {
  return useQuery({ queryKey: ['bootstrap'], queryFn: () => api.get<Bootstrap>('/bootstrap'), staleTime: 60_000, retry: false });
}

export function BootstrapProvider({ data, children }: { data: Bootstrap; children: ReactNode }) {
  const qc = useQueryClient();
  const map = new Map(data.users.map((u) => [u.id, u]));
  const value: Ctx = {
    ...data,
    refetch: () => qc.invalidateQueries({ queryKey: ['bootstrap'] }),
    isAdmin: isAdminRole(data.me.role),
    isManager: isManagerRole(data.me.role),
    userById: (id) => (id ? map.get(id) : undefined),
  };
  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(BootstrapContext);
  if (!ctx) throw new Error('useApp must be used inside BootstrapProvider');
  return ctx;
}
