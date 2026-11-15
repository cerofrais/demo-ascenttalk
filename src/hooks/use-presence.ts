'use client';
import { useSyncExternalStore } from 'react';
import type { Presence } from '@/lib/api';

const state = new Map<string, Presence>();
const listeners = new Set<() => void>();
let version = 0;

export function setPresence(userId: string, status: Presence) {
  if (state.get(userId) === status) return;
  state.set(userId, status);
  version++;
  listeners.forEach((l) => l());
}

export function setPresenceBulk(entries: Record<string, Presence>) {
  for (const [k, v] of Object.entries(entries)) state.set(k, v);
  version++;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function usePresence(userId?: string): Presence | undefined {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return userId ? (state.get(userId) ?? 'OFFLINE') : undefined;
}

export function getPresence(userId: string): Presence {
  return state.get(userId) ?? 'OFFLINE';
}
