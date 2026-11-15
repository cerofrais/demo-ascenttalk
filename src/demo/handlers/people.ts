/** Sign-in, the people directory, teams and sign-in administration (routes/auth.ts, users.ts, identity.ts). */
import { setDemoPersonaId } from '@/lib/demo';
import type { Me, Role } from '@/lib/api';
import { ADMIN_ROLES, MANAGER_ROLES, canAssignRole, isAdmin } from '../access';
import { audit } from '../core';
import { filesFrom, imageUrlFor } from '../files';
import { HttpError, badRequest, forbidden, invalid, isStrArray, need, notFound, notInDemo, optional, optionalList, qstr, route } from '../http';
import { PERSONAS } from '../personas';
import { emit, rooms, setManualPresence } from '../realtime';
import { serializeMe, serializeUser, userBrief, type DirectoryUser } from '../serialize';
import { db, newId, nowIso, touch, type DTeam, type DUser } from '../store';
import { attachmentKind, includesText } from '../util';

const ROLES: Role[] = ['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNT_MANAGER', 'MEMBER', 'GUEST'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NO_PASSWORDS = 'there are no passwords here, pick a role on the demo page instead';
const NO_MAIL = 'invitations and reset links are sent by email, and nothing is sent from the demo';
/** The coordinator's wording for everything that belongs to the identity server (Keycloak) in the product. */
const IDENTITY_SERVER = 'sign-in is managed by an identity server in the real product';

const PERSONA_IDS = new Set(PERSONAS.map((p) => p.id));

// ─── Sign-in ─────────────────────────────────────────────────────────────────

/** The login and profile pages ask how sign-in works; "local" keeps them on the classic forms. */
route('GET', '/auth/config', () => ({ provider: 'local', ready: true, localFallback: true, accountUrl: null }), { open: true });

route('GET', '/auth/me', ({ user }): { user: Me } => ({ user: serializeMe(user) }));

route(
  'POST',
  '/auth/login',
  () => {
    throw notInDemo(NO_PASSWORDS);
  },
  { open: true },
);

route(
  'POST',
  '/auth/logout',
  () => {
    setDemoPersonaId(null);
    return { ok: true };
  },
  { open: true },
);

route('POST', '/auth/password', () => {
  throw notInDemo(NO_PASSWORDS);
});

route(
  'GET',
  '/auth/invite/:token',
  () => {
    throw new HttpError(404, 'This invite link is invalid or expired');
  },
  { open: true },
);

for (const path of ['/auth/invite/accept', '/auth/forgot', '/auth/reset']) {
  route(
    'POST',
    path,
    () => {
      throw notInDemo(path === '/auth/forgot' ? NO_MAIL : NO_PASSWORDS);
    },
    { open: true },
  );
}

// ─── Directory ───────────────────────────────────────────────────────────────

route('GET', '/users', ({ me, query }): { users: DirectoryUser[] } => {
  const q = qstr(query, 'q');
  const department = qstr(query, 'department');
  const includeInactive = qstr(query, 'includeInactive') === 'true' && isAdmin(me);
  const users = db()
    .users.filter((u) => (includeInactive || u.active) && (!department || u.department === department) && (!q || includesText(u.name, q) || includesText(u.email, q) || includesText(u.title, q) || u.skills.includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { users: users.map((u) => serializeUser(u)) };
});

route('GET', '/users/:id', ({ params }) => {
  const s = db();
  const u = s.users.find((x) => x.id === params.id);
  if (!u) throw notFound('User');
  return { user: { ...serializeUser(u), clients: s.clients.filter((c) => c.accountManagerId === u.id).map((c) => ({ id: c.id, name: c.name })) } };
});

function personInput(body: Record<string, any>) {
  const email = need(body, 'email');
  if (!EMAIL_RE.test(email)) throw invalid('email');
  need(body, 'name');
  const role = (body.role ?? 'MEMBER') as Role;
  if (!ROLES.includes(role)) throw invalid('role');
  if (body.teamIds !== undefined && !isStrArray(body.teamIds)) throw invalid('teamIds');
  return { email: email.toLowerCase(), role };
}

/** "Add person" belongs to the identity-server setup; with local sign-in the API itself refuses it. */
route(
  'POST',
  '/users',
  () => {
    throw notInDemo(IDENTITY_SERVER);
  },
  { roles: ADMIN_ROLES },
);

route(
  'POST',
  '/users/invite',
  ({ me, body }) => {
    const { email, role } = personInput(body);
    if (!canAssignRole(me.role, role)) throw forbidden('You cannot invite users with this role');
    const existing = db().users.find((u) => u.email === email);
    if (existing && !existing.invited) throw badRequest('A user with this email already exists');
    throw notInDemo(NO_MAIL);
  },
  { roles: ADMIN_ROLES },
);

route(
  'POST',
  '/users/:id/reinvite',
  ({ params }) => {
    if (!db().users.some((u) => u.id === params.id)) throw notFound('User');
    throw notInDemo(NO_MAIL);
  },
  { roles: ADMIN_ROLES },
);

route(
  'POST',
  '/users/:id/reset-password',
  ({ me, params }) => {
    const target = db().users.find((u) => u.id === params.id);
    if (!target) throw notFound('User');
    if (target.role === 'OWNER' && me.role !== 'OWNER') throw forbidden('Only the owner can reset the owner account');
    throw notInDemo(NO_PASSWORDS);
  },
  { roles: ADMIN_ROLES },
);

route('PATCH', '/users/:id', ({ me, params, body }): { user: DirectoryUser } => {
  const s = db();
  const self = params.id === me.id;
  if (!self && !isAdmin(me)) throw forbidden();

  // the zod schema of the API
  const profile: Partial<DUser> = {};
  if (body.name !== undefined) profile.name = need(body, 'name');
  for (const key of ['title', 'department', 'phone', 'statusText'] as const) {
    const v = optional(body, key);
    if (v !== undefined) profile[key] = v;
  }
  if (typeof profile.statusText === 'string' && profile.statusText.length > 100) throw invalid('statusText');
  const skills = optionalList(body, 'skills');
  if (skills) profile.skills = skills;
  if (body.timezone !== undefined) profile.timezone = need(body, 'timezone');
  if (body.callMode !== undefined) {
    if (body.callMode !== 'SOFTPHONE' && body.callMode !== 'MOBILE') throw invalid('callMode');
    profile.callMode = body.callMode;
  }
  if (body.notificationPrefs !== undefined) {
    if (!body.notificationPrefs || typeof body.notificationPrefs !== 'object') throw invalid('notificationPrefs');
    profile.notificationPrefs = body.notificationPrefs;
  }
  const role: Role | undefined = body.role;
  if (role !== undefined && !ROLES.includes(role)) throw invalid('role');
  const active: boolean | undefined = body.active;
  if (active !== undefined && typeof active !== 'boolean') throw invalid('active');
  const teamIds = optionalList(body, 'teamIds');
  if (body.email !== undefined && (typeof body.email !== 'string' || !EMAIL_RE.test(body.email))) throw invalid('email');

  const target = s.users.find((u) => u.id === params.id);
  if (!target) throw notFound('User');

  const email: string | undefined = body.email?.toLowerCase();
  let newEmail: string | undefined;
  if (email && email !== target.email) {
    if (!isAdmin(me)) throw forbidden('Only admins can change a sign-in email');
    if (target.role === 'OWNER' && me.role !== 'OWNER') throw forbidden('Only the owner can change the owner account');
    if (s.users.some((u) => u.email === email)) throw badRequest('Another person already uses this email');
    newEmail = email;
  }
  if (role !== undefined || active !== undefined || teamIds !== undefined) {
    if (!isAdmin(me)) throw forbidden('Only admins can change roles, teams or activation');
    if (role && (!canAssignRole(me.role, role) || (target.role === 'OWNER' && me.role !== 'OWNER'))) throw forbidden('Not allowed to set this role');
    if (self && ((role && role !== me.role) || active === false)) throw badRequest('You cannot change your own role or deactivate yourself');
    // Demo only: a deactivated account cannot sign in, which would lock that role out of this browser's demo.
    if (active === false && PERSONA_IDS.has(target.id)) throw notInDemo('the six demo roles stay active so each of them can still be explored');
  }

  Object.assign(target, profile);
  if (newEmail) target.email = newEmail;
  if (role) target.role = role;
  if (active !== undefined) target.active = active;
  if (teamIds) {
    for (const t of s.teams) {
      const has = t.memberIds.includes(target.id);
      const want = teamIds.includes(t.id);
      if (has && !want) t.memberIds = t.memberIds.filter((id) => id !== target.id);
      if (!has && want) t.memberIds.push(target.id);
    }
  }
  touch();
  if (!self || role || active !== undefined) audit(me.id, 'user.updated', { type: 'user', id: target.id }, { role, active, teamIds, ...(newEmail ? { email: newEmail } : {}) });
  // the API emits the row without presence, so it arrives as OFFLINE; the list refetches right after
  emit(rooms.everyone, 'user.updated', serializeUser(target, false));
  return { user: serializeUser(target, false) };
});

route('POST', '/me/avatar', async ({ user, form }) => {
  const file = filesFrom(form)[0];
  if (!file) throw badRequest('No file');
  if (!file.type.startsWith('image/')) throw badRequest('Avatar must be an image');
  user.avatarUrl = await imageUrlFor(file);
  touch();
  return { avatarUrl: user.avatarUrl, kind: attachmentKind(file.type) };
});

route('POST', '/me/presence', ({ me, body }) => {
  if (body.status !== 'ONLINE' && body.status !== 'AWAY' && body.status !== 'BUSY') throw invalid('status');
  setManualPresence(me.id, body.status);
  return { ok: true };
});

// ─── Teams ───────────────────────────────────────────────────────────────────

route('GET', '/teams', () => {
  const s = db();
  const find = (id: string | null) => (id ? s.users.find((u) => u.id === id) : undefined);
  return {
    teams: [...s.teams]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        color: t.color,
        lead: userBrief(find(t.leadId)),
        members: t.memberIds.map((id) => userBrief(find(id), 'titled')).filter((u) => u !== null),
        clientCount: s.clients.filter((c) => c.teamId === t.id).length,
        inboxCount: s.inboxes.filter((i) => i.teamId === t.id).length,
      })),
  };
});

/** The Team row as Prisma returns it. */
const teamRow = (t: DTeam) => ({ id: t.id, name: t.name, description: t.description, color: t.color, leadId: t.leadId, createdAt: t.createdAt });

function teamInput(body: Record<string, any>, partial: boolean) {
  const out: { name?: string; description?: string | null; color?: string; leadId?: string | null; memberIds?: string[] } = {};
  if (body.name !== undefined || !partial) out.name = need(body, 'name');
  const description = optional(body, 'description');
  if (description !== undefined) out.description = description;
  if (body.color !== undefined) out.color = need(body, 'color');
  const leadId = optional(body, 'leadId');
  if (leadId !== undefined) out.leadId = leadId;
  out.memberIds = optionalList(body, 'memberIds');
  return out;
}

route(
  'POST',
  '/teams',
  ({ me, body }) => {
    const s = db();
    const f = teamInput(body, false);
    if (s.teams.some((t) => t.name === f.name)) throw new HttpError(409, 'That already exists');
    const known = (id: string) => s.users.some((u) => u.id === id);
    const team: DTeam = {
      id: newId('t'),
      name: f.name!,
      description: f.description ?? null,
      color: f.color ?? '#6366f1',
      leadId: f.leadId && known(f.leadId) ? f.leadId : null,
      memberIds: [...new Set([...(f.memberIds ?? []), ...(f.leadId ? [f.leadId] : [])])].filter(known),
      createdAt: nowIso(),
    };
    s.teams.push(team);
    touch();
    audit(me.id, 'team.created', { type: 'team', id: team.id }, { name: team.name });
    return { team: teamRow(team) };
  },
  { roles: MANAGER_ROLES },
);

route(
  'PATCH',
  '/teams/:id',
  ({ me, params, body }) => {
    const s = db();
    const team = s.teams.find((t) => t.id === params.id);
    if (!team) throw notFound();
    const f = teamInput(body, true);
    if (f.name !== undefined && s.teams.some((t) => t.name === f.name && t.id !== team.id)) throw new HttpError(409, 'That already exists');
    const known = (id: string) => s.users.some((u) => u.id === id);
    if (f.memberIds) team.memberIds = [...new Set([...f.memberIds, ...(f.leadId ? [f.leadId] : [])])].filter(known);
    if (f.name !== undefined) team.name = f.name;
    if (f.description !== undefined) team.description = f.description;
    if (f.color !== undefined) team.color = f.color;
    if (f.leadId !== undefined) team.leadId = f.leadId && known(f.leadId) ? f.leadId : null;
    touch();
    audit(me.id, 'team.updated', { type: 'team', id: team.id });
    return { team: teamRow(team) };
  },
  { roles: MANAGER_ROLES },
);

route(
  'DELETE',
  '/teams/:id',
  ({ me, params }) => {
    const s = db();
    const i = s.teams.findIndex((t) => t.id === params.id);
    if (i < 0) throw notFound();
    s.teams.splice(i, 1);
    // onDelete: SetNull on everything that pointed at the team
    for (const c of s.clients) if (c.teamId === params.id) c.teamId = null;
    for (const c of s.conversations) if (c.teamId === params.id) c.teamId = null;
    for (const b of s.inboxes) if (b.teamId === params.id) b.teamId = null;
    touch();
    audit(me.id, 'team.deleted', { type: 'team', id: params.id });
    return { ok: true };
  },
  { roles: ADMIN_ROLES },
);

// ─── Sign-in administration (Settings → People, Settings → Sign-in & security) ─

/** "local" makes both screens fall back to the classic invite flow, so the rest is normally never called. */
route('GET', '/identity', () => ({ provider: 'local', ready: true }), { roles: ADMIN_ROLES });

/** Nobody is linked to an identity server here: an empty answer keeps the People list quiet if it ever asks. */
route('GET', '/identity/overview', () => ({ users: {} }), { roles: ADMIN_ROLES });

const identityOnly: ['GET' | 'POST' | 'PUT', string][] = [
  ['GET', '/identity/settings'],
  ['PUT', '/identity/settings'],
  ['POST', '/identity/require-two-factor'],
  ['POST', '/identity/sync'],
  ['GET', '/users/:id/identity'],
  ['POST', '/users/:id/sign-out'],
  ['POST', '/users/:id/two-factor'],
  ['POST', '/users/:id/unlock'],
];
for (const [method, path] of identityOnly) {
  route(
    method,
    path,
    () => {
      throw notInDemo(IDENTITY_SERVER);
    },
    { roles: ADMIN_ROLES },
  );
}
