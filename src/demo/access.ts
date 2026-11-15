/**
 * Who may see what. These are the same rules as apps/api/src/lib/auth.ts (conversationScope, clientScope and
 * the role helpers), written as predicates over the in-memory state instead of Prisma filters.
 */
import type { Role } from '@/lib/api';
import { db, type DClient, type DConversation, type DUser, type DemoState } from './store';

/** The signed-in person, as the API's `req.user`. */
export interface Viewer {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamIds: string[];
}

export function viewerFor(user: DUser, s: DemoState = db()): Viewer {
  return { id: user.id, email: user.email, name: user.name, role: user.role, teamIds: s.teams.filter((t) => t.memberIds.includes(user.id)).map((t) => t.id) };
}

export const ADMIN_ROLES: Role[] = ['OWNER', 'ADMIN'];
export const MANAGER_ROLES: Role[] = ['OWNER', 'ADMIN', 'MANAGER'];

export const isAdmin = (u: { role: Role }) => u.role === 'OWNER' || u.role === 'ADMIN';
export const isManagerUp = (u: { role: Role }) => isAdmin(u) || u.role === 'MANAGER';

/** conversationScope(): admins see everything; others need a personal, inbox, client or team link. */
export function canSeeConversation(u: Viewer, c: DConversation, s: DemoState = db()): boolean {
  if (isAdmin(u)) return true;
  if (c.assigneeId === u.id || c.participantIds.includes(u.id)) return true;
  const inbox = s.inboxes.find((i) => i.id === c.inboxId);
  if (inbox?.memberIds.includes(u.id)) return true;
  if (u.role === 'GUEST') return false;
  const client = c.clientId ? s.clients.find((x) => x.id === c.clientId) : undefined;
  if (client?.accountManagerId === u.id) return true;
  if (!u.teamIds.length) return false;
  return Boolean((c.teamId && u.teamIds.includes(c.teamId)) || (inbox?.teamId && u.teamIds.includes(inbox.teamId)) || (client?.teamId && u.teamIds.includes(client.teamId)));
}

export function visibleConversations(u: Viewer, s: DemoState = db()): DConversation[] {
  return isAdmin(u) ? s.conversations : s.conversations.filter((c) => canSeeConversation(u, c, s));
}

/** clientScope(): managers and admins see all clients; others the ones they manage, serve or talk to. */
export function canSeeClient(u: Viewer, client: DClient, s: DemoState = db()): boolean {
  if (isManagerUp(u)) return true;
  const talksTo = () => s.conversations.some((c) => c.clientId === client.id && canSeeConversation(u, c, s));
  if (u.role === 'GUEST') return talksTo();
  return client.accountManagerId === u.id || Boolean(client.teamId && u.teamIds.includes(client.teamId)) || talksTo();
}

export function visibleClients(u: Viewer, s: DemoState = db()): DClient[] {
  return s.clients.filter((c) => canSeeClient(u, c, s));
}

/** The reports use a slightly narrower rule than the inbox (no mentions or inbox membership). */
export function inReportScope(u: Viewer, c: { assigneeId: string | null; teamId: string | null; inboxId: string; clientId: string | null }, s: DemoState = db()): boolean {
  if (isAdmin(u)) return true;
  if (c.assigneeId === u.id) return true;
  if (c.teamId && u.teamIds.includes(c.teamId)) return true;
  const inbox = s.inboxes.find((i) => i.id === c.inboxId);
  if (inbox?.teamId && u.teamIds.includes(inbox.teamId)) return true;
  const client = c.clientId ? s.clients.find((x) => x.id === c.clientId) : undefined;
  return Boolean(client && ((client.teamId && u.teamIds.includes(client.teamId)) || client.accountManagerId === u.id));
}

export function canAssignRole(actor: Role, target: Role): boolean {
  if (actor === 'OWNER') return true;
  if (actor === 'ADMIN') return target !== 'OWNER';
  return false;
}
