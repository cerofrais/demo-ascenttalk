'use client';
import { useSyncExternalStore } from 'react';

/** "system" follows the device setting and is the default; the other two are the user's explicit choice. */
export type ThemeMode = 'light' | 'dark' | 'system';

const KEY = 'ascentalk-theme';
const listeners = new Set<() => void>();
let watching = false;

function read(): ThemeMode {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

function apply(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark' || (mode === 'system' && systemDark()));
}

export function setThemeMode(mode: ThemeMode) {
  try {
    if (mode === 'system') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, mode);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
  apply(mode);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!watching) {
    watching = true;
    // keep "system" in step with the device, and other tabs in step with this one
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (read() === 'system') apply('system');
      listeners.forEach((l) => l());
    });
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY) return;
      apply(read());
      listeners.forEach((l) => l());
    });
  }
  return () => {
    listeners.delete(cb);
  };
}

export function useTheme() {
  const mode = useSyncExternalStore<ThemeMode>(subscribe, read, () => 'system');
  return { mode, setMode: setThemeMode };
}

export const THEME_ORDER: ThemeMode[] = ['light', 'dark', 'system'];
export const THEME_LABEL: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', system: 'Match device' };
