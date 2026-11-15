import type { Role } from '@/lib/api';

/** The fictional agency the demo is set in. */
export const DEMO_AGENCY = 'Orbit Media';

export interface DemoPersona {
  /** User id in the demo data set. */
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Badge text on the picker. */
  roleLabel: string;
  title: string;
  /** One line on what this person can see and do. */
  blurb: string;
  icon: 'crown' | 'settings' | 'eye' | 'briefcase' | 'palette' | 'video';
  /** First screen after picking this role: wherever this person's day starts. */
  landing: string;
}

/** Who a visitor can be. The mock backend applies the same visibility rules as the real API to each of them. */
export const PERSONAS: DemoPersona[] = [
  {
    id: 'u-aditi',
    name: 'Aditi Rao',
    email: 'aditi@orbitmedia.example',
    role: 'OWNER',
    roleLabel: 'Owner',
    title: 'Founder & Director',
    blurb: 'Sees everything: every client conversation, team chat oversight, reports, settings and the audit log.',
    icon: 'crown',
    landing: '/oversight',
  },
  {
    id: 'u-meera',
    name: 'Meera Iyer',
    email: 'meera@orbitmedia.example',
    role: 'ADMIN',
    roleLabel: 'Admin',
    title: 'Operations Lead',
    blurb: 'Runs the workspace: inboxes and channels, people, teams, labels and feature settings.',
    icon: 'settings',
    landing: '/inbox?tab=all',
  },
  {
    id: 'u-priya',
    name: 'Priya Sharma',
    email: 'priya@orbitmedia.example',
    role: 'MANAGER',
    roleLabel: 'Manager',
    title: 'Account Director',
    blurb: 'Oversight of the accounts team: who is handling what, what is waiting on a reply, and the reports.',
    icon: 'eye',
    landing: '/oversight',
  },
  {
    id: 'u-arjun',
    name: 'Arjun Mehta',
    email: 'arjun@orbitmedia.example',
    role: 'ACCOUNT_MANAGER',
    roleLabel: 'Account manager',
    title: 'Senior Account Manager',
    blurb: 'Works his own clients across WhatsApp, email, calls and chat, and loops the team in with private notes.',
    icon: 'briefcase',
    landing: '/inbox',
  },
  {
    id: 'u-rahul',
    name: 'Rahul Verma',
    email: 'rahul@orbitmedia.example',
    role: 'MEMBER',
    roleLabel: 'Team member',
    title: 'Senior Designer',
    blurb: 'Sees the client conversations he is assigned to, mentioned in or that belong to his team, plus team chat.',
    icon: 'palette',
    landing: '/inbox',
  },
  {
    id: 'u-alex',
    name: 'Alex Fernandes',
    email: 'alex@freelance.example',
    role: 'GUEST',
    roleLabel: 'Guest',
    title: 'Freelance Video Editor',
    blurb: 'An outside collaborator: only the team channels he was added to, and client conversations only when someone brings him in.',
    icon: 'video',
    landing: '/chat',
  },
];

export const personaById = (id: string | null | undefined) => PERSONAS.find((p) => p.id === id);
