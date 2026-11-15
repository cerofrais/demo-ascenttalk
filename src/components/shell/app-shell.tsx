'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Building2,
  Contact,
  Eye,
  Hash,
  Inbox,
  LogOut,
  Menu as MenuIcon,
  MessagesSquare,
  Phone,
  Search,
  Settings,
  User,
  X,
} from 'lucide-react';
import { api, type Presence } from '@/lib/api';
import { cn, ROLE_LABEL, timeAgo } from '@/lib/utils';
import { DEMO_HOME, DEMO_MODE, setDemoPersonaId } from '@/lib/demo';
import { THEME_LABEL, THEME_ORDER, useTheme } from '@/lib/theme';
import { useApp } from '@/hooks/use-bootstrap';
import { emitSocket } from '@/hooks/use-realtime';
import { usePresence } from '@/hooks/use-presence';
import { disconnectSocket } from '@/lib/socket';
import { Avatar } from '@/components/ui/avatar';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Popover, Tooltip } from '@/components/ui/menu';
import { Kbd } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { BuiltByAscent, LogoMark } from '@/components/ui/logo';
import { THEME_ICON, ThemeToggle } from '@/components/ui/theme-toggle';
import { useDialer } from './softphone';
import { SearchDialog } from './search-dialog';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  show: boolean;
  mobile?: boolean;
}

function useNav(): NavItem[] {
  const { features, isManager } = useApp();
  const { data: counts } = useQuery({
    queryKey: ['conversation-counts'],
    queryFn: () => api.get<{ mine: number; unassigned: number }>('/conversations/counts'),
    enabled: features.inbox,
    refetchInterval: 60_000,
  });
  const { data: chat } = useQuery({
    queryKey: ['chat-channels'],
    queryFn: () => api.get<{ channels: { unread: number; muted: boolean }[] }>('/chat/channels'),
    enabled: features.internalChat,
  });
  const chatUnread = chat?.channels.reduce((s, c) => s + (c.muted ? 0 : c.unread), 0) ?? 0;
  return [
    { href: '/inbox', label: 'Inbox', icon: <Inbox className="h-[18px] w-[18px]" />, badge: counts?.mine, show: features.inbox, mobile: true },
    { href: '/chat', label: 'Team chat', icon: <MessagesSquare className="h-[18px] w-[18px]" />, badge: chatUnread, show: features.internalChat, mobile: true },
    { href: '/clients', label: 'Clients', icon: <Building2 className="h-[18px] w-[18px]" />, show: features.clients, mobile: true },
    { href: '/contacts', label: 'Contacts', icon: <Contact className="h-[18px] w-[18px]" />, show: true },
    { href: '/calls', label: 'Calls', icon: <Phone className="h-[18px] w-[18px]" />, show: features.channels.VOICE, mobile: true },
    { href: '/oversight', label: 'Oversight', icon: <Eye className="h-[18px] w-[18px]" />, show: features.oversight && isManager },
    { href: '/reports', label: 'Reports', icon: <BarChart3 className="h-[18px] w-[18px]" />, show: features.reports && isManager },
    { href: '/settings', label: 'Settings', icon: <Settings className="h-[18px] w-[18px]" />, show: true },
  ].filter((n) => n.show);
}

/** Leaves the session. In a demo build there is no login, so this goes back to the persona picker. */
function useSignOut() {
  const router = useRouter();
  const qc = useQueryClient();
  return async () => {
    if (DEMO_MODE) setDemoPersonaId(null);
    else await api.post('/auth/logout').catch(() => undefined);
    disconnectSocket();
    qc.clear();
    router.replace(DEMO_MODE ? DEMO_HOME : '/login');
  };
}

const SIGN_OUT_LABEL = DEMO_MODE ? 'Switch role' : 'Sign out';
const SignOutIcon = DEMO_MODE ? ArrowLeftRight : LogOut;

function DemoPill({ className }: { className?: string }) {
  if (!DEMO_MODE) return null;
  return <span className={cn('rounded bg-primary px-1 text-[9px] leading-[14px] font-bold tracking-wide text-primary-fg uppercase', className)}>Demo</span>;
}

const PRESENCE_LABEL: Record<Presence, string> = { ONLINE: 'Online', AWAY: 'Away', BUSY: 'Busy · do not disturb', OFFLINE: 'Offline' };

function UserMenu({ compact }: { compact?: boolean }) {
  const { me } = useApp();
  const presence = usePresence(me.id) ?? 'ONLINE';
  const router = useRouter();
  const { mode, setMode } = useTheme();
  const logout = useSignOut();
  const setStatus = async (s: Presence) => {
    emitSocket('presence.set', s);
    await api.post('/me/presence', { status: s }).catch(() => undefined);
  };
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className={cn('flex items-center gap-2 rounded-lg p-1.5 text-left hover:bg-sidebar-active', compact && 'p-0')} aria-label="Account menu">
          <Avatar name={me.name} src={me.avatarUrl} userId={me.id} size="sm" />
          {!compact && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-white">{me.name}</span>
              <span className="block truncate text-[11px] text-sidebar-fg">{PRESENCE_LABEL[presence]}</span>
            </span>
          )}
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-60">
        <MenuLabel>Status</MenuLabel>
        {(['ONLINE', 'AWAY', 'BUSY'] as Presence[]).map((s) => (
          <MenuItem key={s} checked={presence === s} onSelect={() => setStatus(s)} icon={<span className={cn('h-2 w-2 rounded-full', s === 'ONLINE' ? 'bg-success' : s === 'AWAY' ? 'bg-warning' : 'bg-danger')} />}>
            {PRESENCE_LABEL[s]}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem icon={<User className="h-4 w-4" />} onSelect={() => router.push('/settings/profile')}>
          Profile & preferences
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Theme</MenuLabel>
        {THEME_ORDER.map((m) => {
          const Icon = THEME_ICON[m];
          return (
            <MenuItem key={m} checked={mode === m} icon={<Icon className="h-4 w-4" />} onSelect={() => setMode(m)}>
              {THEME_LABEL[m]}
            </MenuItem>
          );
        })}
        <MenuSeparator />
        <MenuItem icon={<SignOutIcon className="h-4 w-4" />} onSelect={logout} danger={!DEMO_MODE}>
          {SIGN_OUT_LABEL}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function NotificationsButton({ dark }: { dark?: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ notifications: any[]; unread: number }>('/notifications'), refetchInterval: 120_000 });
  const markAll = async () => {
    await api.post('/notifications/read', { all: true });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      side="right"
      className="w-[min(360px,calc(100vw-24px))] p-0"
      trigger={
        <button className={cn('relative rounded-lg p-2', dark ? 'text-sidebar-fg hover:bg-sidebar-active hover:text-white' : 'text-fg-2 hover:bg-surface-2')} aria-label="Notifications">
          <Bell className="h-[18px] w-[18px]" />
          {!!data?.unread && <span className="absolute top-1 right-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 font-semibold text-white">{data.unread > 99 ? '99+' : data.unread}</span>}
        </button>
      }
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-sm font-semibold">Notifications</p>
        <button onClick={markAll} className="text-xs font-medium text-primary hover:underline">
          Mark all read
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {!data?.notifications.length && <p className="px-3 py-8 text-center text-sm text-fg-3">You're all caught up 🎉</p>}
        {data?.notifications.map((n) => (
          <button
            key={n.id}
            className={cn('flex w-full gap-2 border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-surface-2', !n.readAt && 'bg-primary-soft/50')}
            onClick={async () => {
              setOpen(false);
              await api.post('/notifications/read', { ids: [n.id] });
              qc.invalidateQueries({ queryKey: ['notifications'] });
              if (n.link) router.push(n.link);
            }}
          >
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-fg">{n.title}</span>
              {n.body && <span className="line-clamp-2 block text-xs text-fg-2">{n.body}</span>}
              <span className="block text-[11px] text-fg-3">{timeAgo(n.createdAt)}</span>
            </span>
          </button>
        ))}
      </div>
    </Popover>
  );
}

function Sidebar({ nav, onSearch }: { nav: NavItem[]; onSearch: () => void }) {
  const pathname = usePathname();
  const { workspace, features } = useApp();
  const dialer = useDialer();
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col bg-sidebar md:flex">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <WorkspaceMark logoUrl={workspace.logoUrl} className="h-8 w-8 text-white" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{workspace.name}</p>
          <p className="flex items-center gap-1.5 text-[11px] text-sidebar-fg">
            AscenTalk <DemoPill />
          </p>
        </div>
      </div>
      {features.search && (
        <button onClick={onSearch} className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-sidebar-active px-3 py-2 text-[13px] text-sidebar-fg hover:text-white">
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search</span>
          <Kbd>Ctrl K</Kbd>
        </button>
      )}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
        {nav.map((n) => {
          const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                active ? 'bg-sidebar-active text-white shadow-[inset_3px_0_0_var(--primary)]' : 'text-sidebar-fg hover:bg-sidebar-active/60 hover:text-white',
              )}
            >
              {n.icon}
              <span className="flex-1">{n.label}</span>
              {!!n.badge && <span className="rounded-full bg-primary px-1.5 text-[11px] leading-[18px] font-semibold text-primary-fg">{n.badge > 99 ? '99+' : n.badge}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-1 border-t border-white/10 px-3 py-2">
        <NotificationsButton dark />
        {dialer.available && (
          <Tooltip content={dialer.status === 'ready' ? 'Softphone ready' : dialer.status === 'mobile' ? 'Calls via your mobile' : 'Softphone'}>
            <button onClick={dialer.openKeypad} className="relative rounded-lg p-2 text-sidebar-fg hover:bg-sidebar-active hover:text-white" aria-label="Dial">
              <Phone className="h-[18px] w-[18px]" />
              <span className={cn('absolute right-1.5 bottom-1.5 h-1.5 w-1.5 rounded-full', dialer.status === 'ready' || dialer.status === 'mobile' ? 'bg-success' : dialer.status === 'connecting' ? 'bg-warning' : 'bg-danger')} />
            </button>
          </Tooltip>
        )}
        <ThemeToggle onDark className="ml-1" />
        <div className="ml-auto">
          <UserMenu compact />
        </div>
      </div>
      <div className="px-3 pb-3">
        <UserMenuName />
      </div>
    </aside>
  );
}

function UserMenuName() {
  const { me } = useApp();
  const presence = usePresence(me.id) ?? 'ONLINE';
  const signOut = useSignOut();
  if (DEMO_MODE) {
    // demo: say whose eyes you are looking through, and make switching one click
    return (
      <div className="flex items-center gap-2 rounded-lg bg-sidebar-active px-2 py-1.5 text-[11px] text-sidebar-fg">
        <span className="min-w-0 flex-1 truncate">
          Viewing as <span className="font-medium text-white">{me.name}</span> · {ROLE_LABEL[me.role]}
        </span>
        <Tooltip content="Switch role">
          <button onClick={signOut} className="rounded p-1 hover:bg-white/10 hover:text-white" aria-label="Switch role">
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-1 text-[11px] text-sidebar-fg">
      <span className={cn('h-1.5 w-1.5 rounded-full', presence === 'ONLINE' ? 'bg-success' : presence === 'AWAY' ? 'bg-warning' : 'bg-danger')} />
      <span className="truncate">
        {me.name} · {PRESENCE_LABEL[presence]}
      </span>
    </div>
  );
}

/** The agency's own logo when it has uploaded one, otherwise the AscenTalk mark. */
function WorkspaceMark({ logoUrl, className }: { logoUrl?: string | null; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (logoUrl) return <img src={logoUrl} alt="" className={cn('shrink-0 rounded-lg object-cover', className)} />;
  return <LogoMark className={cn('shrink-0', className)} />;
}

function MobileNav({ nav, onSearch }: { nav: NavItem[]; onSearch: () => void }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const primary = nav.filter((n) => n.mobile).slice(0, 4);
  const rest = nav.filter((n) => !primary.includes(n));
  const dialer = useDialer();
  const signOut = useSignOut();
  useEffect(() => setMore(false), [pathname]);
  return (
    <>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface md:hidden">
        {primary.map((n) => {
          const active = pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={cn('relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium', active ? 'text-primary' : 'text-fg-3')}>
              {n.icon}
              {n.label.split(' ')[0]}
              {!!n.badge && <span className="absolute top-1 left-1/2 ml-2 rounded-full bg-danger px-1 text-[9px] leading-4 text-white">{n.badge}</span>}
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-fg-3">
          <MenuIcon className="h-[18px] w-[18px]" />
          More
        </button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-50 bg-black/40 md:hidden" onClick={() => setMore(false)}>
          <div className="safe-bottom absolute inset-x-0 bottom-0 rounded-t-2xl bg-surface p-3" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between px-1">
              <UserMenuLight />
              <Button variant="ghost" size="icon-sm" onClick={() => setMore(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => { setMore(false); onSearch(); }} className="flex flex-col items-center gap-1 rounded-xl bg-surface-2 py-3 text-xs">
                <Search className="h-5 w-5" /> Search
              </button>
              {dialer.available && (
                <button onClick={() => { setMore(false); dialer.openKeypad(); }} className="flex flex-col items-center gap-1 rounded-xl bg-surface-2 py-3 text-xs">
                  <Hash className="h-5 w-5" /> Dial pad
                </button>
              )}
              {rest.map((n) => (
                <Link key={n.href} href={n.href} className="flex flex-col items-center gap-1 rounded-xl bg-surface-2 py-3 text-xs">
                  {n.icon}
                  {n.label}
                </Link>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border px-1 pt-3">
              <ThemeToggle />
              <Button variant="outline" size="sm" onClick={signOut}>
                <SignOutIcon className="h-3.5 w-3.5" /> {SIGN_OUT_LABEL}
              </Button>
            </div>
            <div className="mt-3 flex justify-center">
              <BuiltByAscent />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function UserMenuLight() {
  const { me } = useApp();
  return (
    <div className="flex items-center gap-2">
      <Avatar name={me.name} src={me.avatarUrl} userId={me.id} size="sm" />
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {me.name} {DEMO_MODE && <span className="text-xs font-normal text-fg-3">· {ROLE_LABEL[me.role]}</span>}
        </p>
        <Link href="/settings/profile" className="text-xs text-primary">
          Profile & status
        </Link>
      </div>
    </div>
  );
}

/** Mobile-only top bar (search + notifications). Pages render their own titles. */
function MobileTopBar({ onSearch }: { onSearch: () => void }) {
  const { workspace } = useApp();
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 md:hidden">
      <WorkspaceMark logoUrl={workspace.logoUrl} className="h-7 w-7 text-brand-grey" />
      <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold">
        <span className="truncate">{workspace.name}</span> <DemoPill />
      </p>
      <button onClick={onSearch} className="rounded-lg p-2 text-fg-2 hover:bg-surface-2" aria-label="Search">
        <Search className="h-[18px] w-[18px]" />
      </button>
      <NotificationsButton />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const nav = useNav();
  const [search, setSearch] = useState(false);
  const pathname = usePathname();
  // Hide the mobile top bar inside a focused conversation/channel to maximise space.
  const focused = useMemo(() => /^\/(inbox|chat)\/.+/.test(pathname), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar nav={nav} onSearch={() => setSearch(true)} />
      <div className="flex min-w-0 flex-1 flex-col">
        {!focused && <MobileTopBar onSearch={() => setSearch(true)} />}
        <main className={cn('min-h-0 flex-1 overflow-hidden', focused ? 'pb-0' : 'pb-14 md:pb-0')}>{children}</main>
        {/* desktop only: on phones the credit lives in the More sheet so it never costs the panes any height */}
        <footer className="hidden h-7 shrink-0 items-center justify-center border-t border-border bg-surface px-3 md:flex">
          <BuiltByAscent />
        </footer>
      </div>
      {!focused && <MobileNav nav={nav} onSearch={() => setSearch(true)} />}
      <SearchDialog open={search} onOpenChange={setSearch} />
    </div>
  );
}
