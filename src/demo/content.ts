/**
 * The written part of the demo data set: who the agency works with and what was said.
 * Everything here is fictional. Phone numbers come from the reserved +1 202 555 01xx range and every email
 * address is on a .example domain, so nothing can reach a real person. Times are "minutes before now".
 */
import type { ChannelType, ConversationStatus, Presence, Priority, Role } from '@/lib/api';
import type { ClientStatus, MessageStatus } from './store';

export const H = 60;
export const D = 1440;

// ─── People ──────────────────────────────────────────────────────────────────

export interface UserSeed {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  department: string;
  skills: string[];
  phone: string | null;
  presence: Presence;
  statusText?: string;
  callMode?: 'SOFTPHONE' | 'MOBILE';
  /** Minutes since last seen, for people shown as offline. */
  lastSeen?: number;
}

/** Details for the personas (ids, names, emails, roles and titles come from personas.ts) and the rest of the team. */
export const USER_EXTRAS: Record<string, Omit<UserSeed, 'id' | 'name' | 'email' | 'role' | 'title'>> = {
  'u-aditi': { department: 'Leadership', skills: ['strategy', 'new-business'], phone: '+12025550140', presence: 'ONLINE', statusText: 'Client reviews till 4' },
  'u-meera': { department: 'Operations', skills: ['ops', 'billing', 'hiring'], phone: '+12025550141', presence: 'ONLINE' },
  'u-priya': { department: 'Accounts', skills: ['strategy', 'client-servicing'], phone: '+12025550142', presence: 'BUSY', statusText: 'Pitch prep: Skyline' },
  'u-arjun': { department: 'Accounts', skills: ['client-servicing', 'fmcg', 'food'], phone: '+12025550143', presence: 'ONLINE' },
  'u-rahul': { department: 'Creative', skills: ['design', 'branding', 'motion'], phone: null, presence: 'ONLINE', statusText: 'Heads down on the Lumen carousel' },
  'u-alex': { department: 'Creative', skills: ['video', 'motion'], phone: null, presence: 'OFFLINE', lastSeen: 50 },
};

export const OTHER_USERS: UserSeed[] = [
  { id: 'u-neha', name: 'Neha Kapoor', email: 'neha@orbitmedia.example', role: 'ACCOUNT_MANAGER', title: 'Account Manager', department: 'Accounts', skills: ['client-servicing', 'fitness', 'edtech'], phone: '+12025550144', presence: 'AWAY', callMode: 'MOBILE' },
  { id: 'u-sara', name: 'Sara Khan', email: 'sara@orbitmedia.example', role: 'MEMBER', title: 'Performance Marketer', department: 'Performance', skills: ['meta-ads', 'google-ads', 'analytics'], phone: '+12025550146', presence: 'ONLINE' },
  { id: 'u-vikram', name: 'Vikram Rao', email: 'vikram@orbitmedia.example', role: 'MEMBER', title: 'Copywriter', department: 'Content', skills: ['copy', 'seo', 'social'], phone: null, presence: 'OFFLINE', lastSeen: 3 * H },
];

export const TEAMS = [
  { id: 't-accounts', name: 'Accounts', color: '#0ea5e9', description: 'Client servicing', leadId: 'u-priya', memberIds: ['u-priya', 'u-arjun', 'u-neha'] },
  { id: 't-content', name: 'Content', color: '#f59e0b', description: 'Copy, SEO and social', leadId: 'u-vikram', memberIds: ['u-vikram'] },
  { id: 't-creative', name: 'Creative', color: '#ec4899', description: 'Design and video', leadId: 'u-rahul', memberIds: ['u-rahul'] },
  { id: 't-performance', name: 'Performance', color: '#22c55e', description: 'Paid media', leadId: 'u-sara', memberIds: ['u-sara', 'u-priya'] },
];

export const LABELS = [
  { id: 'lb-billing', name: 'billing', color: '#f59e0b', description: 'Invoices and payments' },
  { id: 'lb-campaign', name: 'campaign', color: '#6366f1', description: 'Campaign execution' },
  { id: 'lb-creative-review', name: 'creative-review', color: '#ec4899', description: 'Awaiting creative approval' },
  { id: 'lb-feedback', name: 'feedback', color: '#22c55e', description: 'Client feedback' },
  { id: 'lb-influencer', name: 'influencer', color: '#14b8a6', description: 'Creator and influencer work' },
  { id: 'lb-new-lead', name: 'new-lead', color: '#0ea5e9', description: 'Prospective client' },
  { id: 'lb-urgent', name: 'urgent', color: '#ef4444', description: 'Needs action today' },
];

export const CANNED = [
  { shortCode: 'brief', title: 'Ask for brief', content: 'Could you share the campaign brief (objective, audience, budget and timelines)? A Google Drive link works great.', by: 'u-priya' },
  { shortCode: 'call', title: 'Schedule a call', content: 'Would you be available for a quick call today? Let us know a time that works for you.', by: 'u-arjun' },
  { shortCode: 'creative', title: 'Creative shared', content: 'Hi {{contact.name}}, the creatives are ready for your review. Feedback by tomorrow evening keeps us on schedule.', by: 'u-arjun' },
  { shortCode: 'followup', title: 'Gentle follow-up', content: 'Hi {{contact.name}}, just checking in on this. Is there anything you need from our side to move ahead?', by: 'u-neha' },
  { shortCode: 'hi', title: 'Greeting', content: 'Hi {{contact.name}}, thanks for reaching out! How can we help today?', by: 'u-aditi' },
  { shortCode: 'invoice', title: 'Invoice sent', content: 'Hi {{contact.name}}, the invoice for {{client.name}} has been emailed to your accounts team. Let us know if anything needs changing.', by: 'u-meera' },
  { shortCode: 'report', title: 'Monthly report', content: 'Hi {{contact.name}}, your monthly performance report for {{client.name}} is ready. Sharing the Drive link shortly.', by: 'u-neha' },
  { shortCode: 'thanks', title: 'Thank you', content: 'Thank you {{contact.name}}! We will get back to you shortly.', by: 'u-aditi' },
];

// ─── Clients and contacts ────────────────────────────────────────────────────

export interface ClientSeed {
  id: string;
  name: string;
  industry: string;
  website: string;
  status: ClientStatus;
  am: string;
  team: string;
  tags: string[];
  folder: string;
  notes: string;
  /** Days since the client was added. */
  since: number;
  links: { url: string; title: string; type: string; by: string; at: number }[];
}

export const CLIENTS: ClientSeed[] = [
  {
    id: 'cl-harvest', name: 'Harvest Lane Foods', industry: 'FMCG', website: 'https://harvestlane.example', status: 'ACTIVE', am: 'u-arjun', team: 't-accounts', tags: ['retainer', 'festive'],
    folder: 'https://drive.google.com/drive/folders/1HarvestLaneOrbitShared01', notes: 'Retainer client since 2024. Festive campaign in flight; weekly review every Thursday. Anita signs off creative, Rohan owns brand guardrails.', since: 420,
    links: [
      { url: 'https://docs.google.com/presentation/d/1FestiveStoryboardOrbitV2/edit', title: 'Festive film: storyboard v2', type: 'presentation', by: 'u-arjun', at: 26 * H },
      { url: 'https://docs.google.com/spreadsheets/d/1HarvestMediaPlanV3Orbit/edit', title: 'Festive media plan v3', type: 'spreadsheet', by: 'u-sara', at: 70 * H },
      { url: 'https://docs.google.com/document/d/1HarvestTaglinesOrbit/edit', title: 'Tagline options (Hindi and English)', type: 'document', by: 'u-vikram', at: 4 * D },
    ],
  },
  {
    id: 'cl-northpeak', name: 'Northpeak Fitness', industry: 'Health & Fitness', website: 'https://northpeakfit.example', status: 'ACTIVE', am: 'u-neha', team: 't-accounts', tags: ['performance', 'lead-gen'],
    folder: 'https://drive.google.com/drive/folders/1NorthpeakOrbitShared02', notes: 'Six studios. Trial sign-ups are the only number Kabir cares about. Friday call every week.', since: 300,
    links: [
      { url: 'https://docs.google.com/spreadsheets/d/1NorthpeakTrialDashboard/edit', title: 'Trial sign-up dashboard', type: 'spreadsheet', by: 'u-sara', at: 9 * D },
      { url: 'https://drive.google.com/file/d/1NorthpeakScheduleScreen01/view', title: 'Class schedule: studio screens', type: 'image', by: 'u-neha', at: 3 * D },
    ],
  },
  {
    id: 'cl-lumen', name: 'Lumen & Leaf Skincare', industry: 'Beauty', website: 'https://lumenandleaf.example', status: 'ACTIVE', am: 'u-arjun', team: 't-accounts', tags: ['social', 'influencer'],
    folder: 'https://drive.google.com/drive/folders/1LumenLeafOrbitShared03', notes: 'Dew Drop Serum 50 ml launches on the 28th. Meher approves everything visual; Lisa runs the day-to-day.', since: 210,
    links: [
      { url: 'https://docs.google.com/spreadsheets/d/1LumenLaunchCalendarOrbit/edit', title: 'Serum launch calendar and creator shortlist', type: 'spreadsheet', by: 'u-arjun', at: 2 * D },
      { url: 'https://docs.google.com/document/d/1LumenCaptionsOrbit/edit', title: 'Launch captions: clinical and playful', type: 'document', by: 'u-vikram', at: 3 * D },
    ],
  },
  {
    id: 'cl-skyline', name: 'Skyline Habitat Realty', industry: 'Real Estate', website: 'https://skylinehabitat.example', status: 'LEAD', am: 'u-priya', team: 't-accounts', tags: ['inbound-lead', 'pitch'],
    folder: 'https://drive.google.com/drive/folders/1SkylinePitchOrbitFolder', notes: 'Pitching for the launch of The Meridian (240 homes). Three agencies in the running, decision expected next week.', since: 2,
    links: [
      { url: 'https://docs.google.com/presentation/d/1SkylineLaunchDeckOrbit/edit', title: 'Pitch deck: The Meridian launch', type: 'presentation', by: 'u-priya', at: 6 * H },
      { url: 'https://drive.google.com/drive/folders/1SkylinePitchOrbitFolder', title: 'Real estate case studies', type: 'folder', by: 'u-arjun', at: 29 * H },
    ],
  },
  {
    id: 'cl-brightpath', name: 'BrightPath Learning', industry: 'EdTech', website: 'https://brightpath.example', status: 'ACTIVE', am: 'u-neha', team: 't-accounts', tags: ['webinars', 'content'],
    folder: 'https://drive.google.com/drive/folders/1BrightPathOrbitShared05', notes: 'Monthly masterclass webinars drive admissions. Ad copy needs extra care: the platforms are strict on outcome claims.', since: 160,
    links: [
      { url: 'https://docs.google.com/spreadsheets/d/1BrightPathBlogCalendarNov/edit', title: 'Blog calendar: November', type: 'spreadsheet', by: 'u-vikram', at: 45 * H },
      { url: 'https://docs.google.com/document/d/1BrightPathAdCopyGuide/edit', title: 'Ad copy do and do not', type: 'document', by: 'u-sara', at: 20 * D },
    ],
  },
  {
    id: 'cl-copperpot', name: 'Copper Pot Kitchens', industry: 'Restaurants', website: 'https://copperpot.example', status: 'ACTIVE', am: 'u-arjun', team: 't-accounts', tags: ['local', 'reels'],
    folder: 'https://drive.google.com/drive/folders/1CopperPotOrbitShared06', notes: 'Four outlets, fifth opens in Indiranagar on the 22nd. Vivek decides quickly on WhatsApp; keep the thali in every frame.', since: 95,
    links: [
      { url: 'https://docs.google.com/document/d/1CopperPotShotListOrbit/edit', title: 'Reels shoot: shot list and schedule', type: 'document', by: 'u-arjun', at: 46 * H },
      { url: 'https://docs.google.com/document/d/1CopperPotLaunchOnePager/edit', title: 'Indiranagar launch one pager', type: 'document', by: 'u-arjun', at: 6 * H },
    ],
  },
  {
    id: 'cl-loom', name: 'Loom & Thread', industry: 'D2C Fashion', website: 'https://loomandthread.example', status: 'ACTIVE', am: 'u-neha', team: 't-performance', tags: ['d2c', 'roas'],
    folder: 'https://drive.google.com/drive/folders/1LoomThreadOrbitShared07', notes: 'Performance-only engagement run by the Performance team. Weekly ROAS report every Monday; winter sale planning starts next week.', since: 130,
    links: [
      { url: 'https://docs.google.com/spreadsheets/d/1LoomWeeklyRoasOrbit/edit', title: 'Weekly ROAS report', type: 'spreadsheet', by: 'u-sara', at: 30 * H },
      { url: 'https://docs.google.com/spreadsheets/d/1LoomCatalogueFeedAudit/edit', title: 'Catalogue feed audit', type: 'spreadsheet', by: 'u-sara', at: 25 * H },
    ],
  },
  {
    id: 'cl-trailmark', name: 'Trailmark Travel', industry: 'Travel', website: 'https://trailmark.example', status: 'PAUSED', am: 'u-priya', team: 't-accounts', tags: ['seasonal'],
    folder: 'https://drive.google.com/drive/folders/1TrailmarkContentBankOrbit', notes: 'Retainer paused until March. Ad accounts are in maintenance mode; plan the summer push with George in February.', since: 380,
    links: [{ url: 'https://drive.google.com/drive/folders/1TrailmarkContentBankOrbit', title: 'Content bank handover', type: 'folder', by: 'u-priya', at: 5 * D }],
  },
];

export interface ContactSeed {
  id: string;
  name: string;
  client: string | null;
  role?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export const CONTACTS: ContactSeed[] = [
  { id: 'ct-anita', name: 'Anita Desai', client: 'cl-harvest', role: 'Marketing Head', phone: '+12025550102', email: 'anita@harvestlane.example', notes: 'Prefers a call for anything urgent. Signs off creative.' },
  { id: 'ct-rohan', name: 'Rohan Gupta', client: 'cl-harvest', role: 'Brand Manager', phone: '+12025550101', email: 'rohan@harvestlane.example' },
  { id: 'ct-farah', name: 'Farah Sheikh', client: 'cl-harvest', role: 'Finance Controller', phone: '+12025550111', email: 'accounts@harvestlane.example' },
  { id: 'ct-kabir', name: 'Kabir Singh', client: 'cl-northpeak', role: 'Founder', phone: '+12025550103', email: 'kabir@northpeakfit.example' },
  { id: 'ct-tanya', name: 'Tanya Bose', client: 'cl-northpeak', role: 'Studio Manager', phone: '+12025550112', email: 'tanya@northpeakfit.example' },
  { id: 'ct-lisa', name: 'Lisa Thomas', client: 'cl-lumen', role: 'Social Media Lead', phone: '+12025550104', email: 'lisa@lumenandleaf.example' },
  { id: 'ct-meher', name: 'Meher Kohli', client: 'cl-lumen', role: 'Founder', phone: '+12025550113', email: 'meher@lumenandleaf.example' },
  { id: 'ct-dev', name: 'Dev Malhotra', client: 'cl-skyline', role: 'Director', phone: '+12025550105', email: 'dev@skylinehabitat.example' },
  { id: 'ct-ira', name: 'Ira Banerjee', client: 'cl-skyline', role: 'Marketing Manager', phone: '+12025550114', email: 'ira@skylinehabitat.example' },
  { id: 'ct-sameer', name: 'Sameer Joshi', client: 'cl-brightpath', role: 'Growth Lead', phone: '+12025550106', email: 'sameer@brightpath.example' },
  { id: 'ct-pooja', name: 'Pooja Nair', client: 'cl-brightpath', role: 'Content Manager', phone: '+12025550115', email: 'pooja@brightpath.example' },
  { id: 'ct-vivek', name: 'Vivek Menon', client: 'cl-copperpot', role: 'Owner', phone: '+12025550107', email: 'vivek@copperpot.example', notes: 'Decides fast on WhatsApp. Do not send long emails.' },
  { id: 'ct-diya', name: 'Diya Pillai', client: 'cl-copperpot', role: 'Marketing Executive', phone: '+12025550116', email: 'diya@copperpot.example' },
  { id: 'ct-hari', name: 'Hari Prasad', client: 'cl-copperpot', role: 'Outlet Manager', phone: '+12025550117', email: 'hari@copperpot.example' },
  { id: 'ct-zoya', name: 'Zoya Mirza', client: 'cl-loom', role: 'Founder', phone: '+12025550108', email: 'zoya@loomandthread.example' },
  { id: 'ct-nikhil', name: 'Nikhil Batra', client: 'cl-loom', role: 'E-commerce Manager', phone: '+12025550118', email: 'nikhil@loomandthread.example' },
  { id: 'ct-george', name: 'George Mathew', client: 'cl-trailmark', role: 'CEO', phone: '+12025550109', email: 'george@trailmark.example' },
  { id: 'ct-sana', name: 'Sana Qureshi', client: 'cl-trailmark', role: 'Marketing Lead', phone: '+12025550119', email: 'sana@trailmark.example' },
  // People who are not linked to a client (yet)
  { id: 'ct-ritika', name: 'Ritika Anand', client: null, phone: '+12025550121', notes: 'Runs two boutique hotels. Referred by Vivek at Copper Pot.' },
  { id: 'ct-unknown-caller', name: '+12025550122', client: null, phone: '+12025550122' },
  { id: 'ct-harish', name: 'Harish Kumar', client: null },
  { id: 'ct-ishita', name: 'Ishita Rawal', client: null, notes: 'Skincare creator, about 48k followers.' },
  { id: 'ct-suresh', name: 'Suresh Pillai', client: null, role: 'PrintWorks Studio (vendor)', phone: '+12025550123', email: 'suresh@printworks.example' },
  { id: 'ct-aarav', name: 'Aarav Shah', client: null, email: 'aarav@aaravshah.example' },
  { id: 'ct-marcus', name: "Marcus D'Souza", client: null, email: 'marcus@wickandwax.example' },
  { id: 'ct-visitor', name: 'Visitor 7F3A', client: null },
  { id: 'ct-priyanka', name: 'Priyanka Sen', client: null, email: 'priyanka@crunchleaf.example' },
];

// ─── Inboxes ─────────────────────────────────────────────────────────────────

export const WEBSITE_GREETING = 'Thanks for reaching out! A strategist will reply in a few minutes.';

export const INBOXES: { id: string; name: string; channelType: ChannelType; team: string | null; members: string[]; config: Record<string, unknown>; externalId: string | null; token: string; greeting?: string; signature?: string; since: number }[] = [
  { id: 'ib-email', name: 'Client Desk Email', channelType: 'EMAIL', team: null, members: [], config: { email: 'hello@orbitmedia.example', provider: 'google' }, externalId: 'hello@orbitmedia.example', token: 'demo-email-desk', signature: 'Orbit Media\nhello@orbitmedia.example', since: 400 },
  { id: 'ib-facebook', name: 'Orbit Facebook Page', channelType: 'FACEBOOK', team: null, members: ['u-vikram'], config: { pageId: '100200300400500', pageName: 'Orbit Media' }, externalId: '100200300400500', token: 'demo-facebook-page', since: 220 },
  { id: 'ib-instagram', name: 'Orbit Instagram', channelType: 'INSTAGRAM', team: null, members: ['u-vikram'], config: { pageId: '100200300400500', instagramId: '17840000000000001', username: 'orbitmedia.example' }, externalId: '17840000000000001', token: 'demo-instagram', since: 220 },
  { id: 'ib-telegram', name: 'Orbit Telegram', channelType: 'TELEGRAM', team: null, members: [], config: { botUsername: 'orbitmedia_demo_bot' }, externalId: '7000000001', token: 'demo-telegram-bot', since: 150 },
  { id: 'ib-voice', name: 'Main Line', channelType: 'VOICE', team: 't-accounts', members: [], config: { phoneNumber: '+12025550110' }, externalId: '12025550110', token: 'demo-main-line', since: 380 },
  { id: 'ib-web', name: 'Orbit Website Chat', channelType: 'WEBSITE', team: 't-accounts', members: [], config: { websiteUrl: 'https://orbitmedia.example', widgetColor: '#4f46e5', welcomeTitle: 'Hi there 👋', welcomeTagline: 'Talk to our strategy team.' }, externalId: null, token: 'orbit-website-demo', greeting: WEBSITE_GREETING, since: 380 },
  { id: 'ib-whatsapp', name: 'Orbit WhatsApp', channelType: 'WHATSAPP', team: 't-accounts', members: [], config: { phoneNumber: '+12025550100' }, externalId: 'orbit-whatsapp', token: 'demo-whatsapp', since: 400 },
];

// ─── Sample files (apps/web/public/demo-assets) ──────────────────────────────

export const FILES: Record<string, { file: string; fileName: string; mimeType: string; size: number; kind: 'IMAGE' | 'AUDIO' | 'FILE' }> = {
  moodboard: { file: 'festive-moodboard.svg', fileName: 'festive-moodboard.svg', mimeType: 'image/svg+xml', size: 86_400, kind: 'IMAGE' },
  heroFrame: { file: 'festive-hero-frame.svg', fileName: 'hero-film-frame-014.svg', mimeType: 'image/svg+xml', size: 64_200, kind: 'IMAGE' },
  productShot: { file: 'lumen-product-shot.svg', fileName: 'dew-drop-serum-hero.svg', mimeType: 'image/svg+xml', size: 71_900, kind: 'IMAGE' },
  carousel: { file: 'lumen-carousel-v2.svg', fileName: 'launch-carousel-v2.svg', mimeType: 'image/svg+xml', size: 93_100, kind: 'IMAGE' },
  menu1: { file: 'copperpot-menu-1.svg', fileName: 'indiranagar-menu-photo-1.svg', mimeType: 'image/svg+xml', size: 58_700, kind: 'IMAGE' },
  menu2: { file: 'copperpot-menu-2.svg', fileName: 'indiranagar-menu-photo-2.svg', mimeType: 'image/svg+xml', size: 61_300, kind: 'IMAGE' },
  webinarAd: { file: 'brightpath-webinar-ad.svg', fileName: 'masterclass-static-final.svg', mimeType: 'image/svg+xml', size: 55_800, kind: 'IMAGE' },
  lookbook: { file: 'loom-lookbook.svg', fileName: 'winter-lookbook-selects.svg', mimeType: 'image/svg+xml', size: 97_600, kind: 'IMAGE' },
  sitePlan: { file: 'skyline-site-plan.svg', fileName: 'meridian-teaser-route-1.svg', mimeType: 'image/svg+xml', size: 66_500, kind: 'IMAGE' },
  mediaPlan: { file: 'festive-media-plan.pdf', fileName: 'festive-media-plan-v3.pdf', mimeType: 'application/pdf', size: 184_300, kind: 'FILE' },
  invoice: { file: 'invoice-inv-2041.pdf', fileName: 'INV-2041-harvest-lane-october.pdf', mimeType: 'application/pdf', size: 72_800, kind: 'FILE' },
  proposal: { file: 'skyline-proposal.pdf', fileName: 'orbit-proposal-the-meridian.pdf', mimeType: 'application/pdf', size: 248_900, kind: 'FILE' },
  quote: { file: 'print-quote-standees.pdf', fileName: 'Q-318-roll-up-standees.pdf', mimeType: 'application/pdf', size: 41_200, kind: 'FILE' },
};

export const assetUrl = (file: string) => `/demo-assets/${file}?v=1`;
export const CALL_AUDIO_URL = assetUrl('call-sample.wav');

/** Titles for the Google Drive links that appear in the seeded messages (the real API looks these up live). */
export const DRIVE_TITLES: Record<string, string> = {
  'https://docs.google.com/presentation/d/1FestiveStoryboardOrbitV2/edit': 'Festive film: storyboard v2',
  'https://docs.google.com/spreadsheets/d/1HarvestMediaPlanV3Orbit/edit': 'Festive media plan v3',
  'https://docs.google.com/document/d/1HarvestTaglinesOrbit/edit': 'Tagline options (Hindi and English)',
  'https://docs.google.com/document/d/1HarvestRegionalEstimateOrbit/edit': 'Estimate: regional edits',
  'https://drive.google.com/file/d/1FestiveFilmV2OrbitCut/view': 'festive-film-v2-30s.mp4',
  'https://docs.google.com/spreadsheets/d/1LumenLaunchCalendarOrbit/edit': 'Serum launch calendar and creator shortlist',
  'https://drive.google.com/drive/folders/1SkylinePitchOrbitFolder': 'Skyline pitch',
  'https://docs.google.com/presentation/d/1SkylineLaunchDeckOrbit/edit': 'Pitch deck: The Meridian launch',
  'https://docs.google.com/spreadsheets/d/1BrightPathBlogCalendarNov/edit': 'Blog calendar: November',
  'https://docs.google.com/spreadsheets/d/1LoomWeeklyRoasOrbit/edit': 'Weekly ROAS report',
  'https://docs.google.com/document/d/1CopperPotShotListOrbit/edit': 'Reels shoot: shot list and schedule',
  'https://drive.google.com/file/d/1NorthpeakScheduleScreen01/view': 'class-schedule-1920x1080.png',
  'https://drive.google.com/drive/folders/1TrailmarkContentBankOrbit': 'Trailmark content bank',
  'https://drive.google.com/file/d/1IshitaMediaKitSample01/view': 'Ishita Rawal: media kit.pdf',
};

// ─── Calls ───────────────────────────────────────────────────────────────────

export interface CallSeed {
  id: string;
  at: number;
  dir: 'INBOUND' | 'OUTBOUND';
  status: 'COMPLETED' | 'MISSED' | 'VOICEMAIL' | 'NO_ANSWER' | 'BUSY';
  contact: string;
  user: string | null;
  sec?: number;
  mode?: 'MOBILE';
  recording?: boolean;
}

export const CALLS: CallSeed[] = [
  { id: 'k-01', at: 6 * D + 3 * H, dir: 'INBOUND', status: 'COMPLETED', contact: 'ct-george', user: 'u-priya', sec: 430 },
  { id: 'k-02', at: 5 * D + 2 * H, dir: 'INBOUND', status: 'MISSED', contact: 'ct-tanya', user: null },
  { id: 'k-03', at: 4 * D + 5 * H, dir: 'INBOUND', status: 'COMPLETED', contact: 'ct-sameer', user: 'u-neha', sec: 231, mode: 'MOBILE' },
  { id: 'k-04', at: 3 * D + 1 * H, dir: 'OUTBOUND', status: 'COMPLETED', contact: 'ct-kabir', user: 'u-neha', sec: 400, mode: 'MOBILE', recording: true },
  { id: 'k-05', at: 2 * D + 6 * H, dir: 'OUTBOUND', status: 'NO_ANSWER', contact: 'ct-dev', user: 'u-priya' },
  { id: 'k-06', at: 2 * D + 2 * H, dir: 'OUTBOUND', status: 'COMPLETED', contact: 'ct-anita', user: 'u-arjun', sec: 125 },
  { id: 'k-07', at: 2 * D + 1 * H, dir: 'OUTBOUND', status: 'COMPLETED', contact: 'ct-nikhil', user: 'u-sara', sec: 722 },
  { id: 'k-08', at: 47 * H, dir: 'OUTBOUND', status: 'COMPLETED', contact: 'ct-dev', user: 'u-priya', sec: 690, recording: true },
  { id: 'k-09', at: 30 * H, dir: 'INBOUND', status: 'COMPLETED', contact: 'ct-lisa', user: 'u-arjun', sec: 342 },
  { id: 'k-10', at: 28 * H, dir: 'OUTBOUND', status: 'COMPLETED', contact: 'ct-zoya', user: 'u-neha', sec: 542, mode: 'MOBILE', recording: true },
  { id: 'k-11', at: 26 * H, dir: 'INBOUND', status: 'VOICEMAIL', contact: 'ct-vivek', user: null, sec: 0 },
  { id: 'k-12', at: 25 * H, dir: 'OUTBOUND', status: 'COMPLETED', contact: 'ct-vivek', user: 'u-arjun', sec: 192 },
  { id: 'k-13', at: 6 * H, dir: 'INBOUND', status: 'COMPLETED', contact: 'ct-anita', user: 'u-arjun', sec: 258, recording: true },
  { id: 'k-14', at: 4 * H, dir: 'OUTBOUND', status: 'COMPLETED', contact: 'ct-rohan', user: 'u-arjun', sec: 108 },
  { id: 'k-15', at: 3 * H, dir: 'INBOUND', status: 'MISSED', contact: 'ct-unknown-caller', user: null },
  { id: 'k-16', at: 2 * H, dir: 'OUTBOUND', status: 'BUSY', contact: 'ct-sameer', user: 'u-neha', mode: 'MOBILE' },
  { id: 'k-17', at: 45, dir: 'INBOUND', status: 'MISSED', contact: 'ct-kabir', user: null },
];

// ─── Client conversations ────────────────────────────────────────────────────

export interface MsgSeed {
  k: 'in' | 'out' | 'note' | 'act' | 'call' | 'greet';
  at: number;
  /** Contact id (incoming), user id (outgoing, notes, activity) or call id. */
  who?: string | null;
  text?: string;
  mentions?: string[];
  files?: string[];
  cc?: string[];
  status?: MessageStatus;
  error?: string;
}

export interface ConvSeed {
  key: string;
  inbox: string;
  contact?: string;
  client?: string | null;
  group?: string;
  subject?: string;
  status?: ConversationStatus;
  priority?: Priority;
  assignee?: string | null;
  team?: string | null;
  labels?: string[];
  /** Minutes from now until a snoozed conversation wakes up. */
  snoozeFor?: number;
  msgs: MsgSeed[];
}

const I = (at: number, who: string, text: string, x: Partial<MsgSeed> = {}): MsgSeed => ({ k: 'in', at, who, text, ...x });
const O = (at: number, who: string, text: string, x: Partial<MsgSeed> = {}): MsgSeed => ({ k: 'out', at, who, text, ...x });
const N = (at: number, who: string, text: string, mentions: string[] = []): MsgSeed => ({ k: 'note', at, who, text, mentions });
/** System line such as "Arjun Mehta assigned to Rahul Verma" (the actor's name is added in front). */
const A = (at: number, who: string, text: string): MsgSeed => ({ k: 'act', at, who, text });
const K = (callId: string): MsgSeed => ({ k: 'call', at: CALLS.find((c) => c.id === callId)!.at, who: callId });
const G = (at: number): MsgSeed => ({ k: 'greet', at, text: WEBSITE_GREETING });

export const CONVERSATIONS: ConvSeed[] = [
  {
    key: 'harvestGroup', inbox: 'ib-whatsapp', client: 'cl-harvest', group: 'Harvest Lane × Orbit | Festive Campaign', assignee: 'u-arjun', team: 't-accounts', priority: 'HIGH', labels: ['lb-campaign', 'lb-creative-review'],
    msgs: [
      I(6 * D - 30, 'ct-anita', 'Hello team, creating this group for the festive campaign so we can move faster. Adding Rohan from brand.'),
      O(6 * D - 42, 'u-arjun', "Thanks Anita. Rahul (design), Sara (media) and Vikram (copy) are on this from our side. I'll post an update here every evening."),
      I(5 * D, 'ct-rohan', 'Sharing the brand guardrails again: no fireworks visuals, and the pack shot must appear in the first 3 seconds.'),
      O(5 * D - 20, 'u-arjun', 'Noted on both. The mood board is built around lamps and kitchens, no fireworks anywhere.', { files: ['moodboard'] }),
      I(4 * D, 'ct-anita', 'Love the mood board. Frames 2 and 5 are exactly the feeling we want.'),
      I(26 * H, 'ct-anita', 'Team, can we see the first cut of the hero film by Thursday?'),
      O(25.5 * H, 'u-arjun', 'Absolutely Anita. Rahul is on it. The storyboard is here in the meantime: https://docs.google.com/presentation/d/1FestiveStoryboardOrbitV2/edit'),
      N(25 * H, 'u-arjun', '@Rahul Verma client wants the first cut by Thursday. Can you confirm timelines?', ['u-rahul']),
      N(24 * H, 'u-rahul', 'Confirmed. Rough cut Wednesday end of day, final Thursday noon. Alex is editing.'),
      O(23 * H, 'u-arjun', 'Confirmed with the studio: rough cut tomorrow evening, final by Thursday noon.'),
      I(3 * H, 'ct-rohan', 'Also please keep the Hindi version of the tagline ready. Budget approval came through 🎉'),
      O(2.8 * H, 'u-arjun', "Great news! Here's a frame from the edit to keep you going.", { files: ['heroFrame'] }),
      I(95, 'ct-rohan', 'This looks rich. Can the pack shot be a little bigger?'),
      I(80, 'ct-anita', 'When can we expect the media plan with the regional split?'),
      N(70, 'u-arjun', '@Sara Khan the regional split is approved on email. Can you drop the final PDF here once it is exported?', ['u-sara']),
    ],
  },
  {
    key: 'harvestMediaPlan', inbox: 'ib-email', contact: 'ct-anita', client: 'cl-harvest', subject: 'Festive campaign: revised media plan and budgets', assignee: 'u-arjun', team: 't-accounts', labels: ['lb-campaign'],
    msgs: [
      I(3 * D, 'ct-anita', 'Hi Arjun,\n\nThanks for the first cut of the plan. Two things from our side:\n\n1. Regional language spends look low. Can we move at least 15% to Hindi and Marathi placements?\n2. Finance wants the creator partnerships shown as a separate line.\n\nCould you send a revised plan by Wednesday?\n\nRegards,\nAnita'),
      N(71 * H, 'u-arjun', '@Sara Khan can you rework the split with 15% on regional display? The client wants creators as a separate line too.', ['u-sara']),
      N(70 * H, 'u-sara', 'Done. v3 is in the client folder. Reach drops about 4% but completion rate should hold.'),
      O(69 * H, 'u-arjun', 'Hi Anita,\n\nRevised plan attached (v3). Regional placements are now 15% and creator partnerships sit on their own line at 12%.\n\nThe working sheet is here if your team wants to play with the numbers: https://docs.google.com/spreadsheets/d/1HarvestMediaPlanV3Orbit/edit\n\nBest,\nArjun', { files: ['mediaPlan'] }),
      I(47 * H, 'ct-anita', 'Thanks Arjun, this works. One question: can we hold back 5% of the retargeting budget for the gifting push in week 4?\n\nAnita'),
      O(46 * H, 'u-arjun', "Yes, that is sensible. I've parked 5% as a week 4 reserve in the sheet. Nothing else moves.\n\nArjun"),
      I(5 * H, 'ct-anita', 'Approved from our side. Rohan is copied for the purchase order. Please share the final PDF once the reserve is reflected.\n\nAnita', { cc: ['rohan@harvestlane.example'] }),
    ],
  },
  {
    key: 'harvestCalls', inbox: 'ib-voice', contact: 'ct-anita', client: 'cl-harvest', assignee: 'u-arjun', team: 't-accounts',
    msgs: [K('k-06'), K('k-13'), N(5.8 * H, 'u-arjun', 'Anita called about the media plan sign-off. Approval will come on email today, purchase order to follow from Rohan.')],
  },
  {
    key: 'harvestInvoice', inbox: 'ib-email', contact: 'ct-farah', client: 'cl-harvest', subject: 'Invoice INV-2041 for the October retainer', assignee: 'u-meera', team: null, status: 'RESOLVED', labels: ['lb-billing'],
    msgs: [
      O(5 * D, 'u-meera', 'Hi Farah,\n\nPlease find invoice INV-2041 for the October retainer attached. Payment terms are 15 days as per the agreement.\n\nThanks,\nMeera Iyer\nOperations, Orbit Media', { files: ['invoice'] }),
      I(4 * D, 'ct-farah', 'Hi Meera,\n\nReceived. The PO number on the invoice should be HL-PO-7781. Could you reissue?\n\nFarah'),
      O(4 * D - 2 * H, 'u-meera', 'Reissued with the PO number, attached. Sorry about that.\n\nMeera', { files: ['invoice'] }),
      I(3 * D, 'ct-farah', "Thanks, it is in this Friday's payment run.\n\nFarah"),
      A(3 * D - 10, 'u-meera', 'marked the conversation as resolved'),
    ],
  },
  {
    key: 'harvestEstimate', inbox: 'ib-whatsapp', contact: 'ct-rohan', client: 'cl-harvest', assignee: 'u-arjun', team: 't-accounts', status: 'SNOOZED', snoozeFor: 18 * H, labels: ['lb-billing'],
    msgs: [
      I(27 * H, 'ct-rohan', 'Arjun, finance is asking for the estimate for the extra regional edits before they raise the PO.'),
      O(26.5 * H, 'u-arjun', 'Sure. Two extra language versions of the hero film and six statics. Sending the estimate in an hour.'),
      O(25.5 * H, 'u-arjun', 'Estimate is here: https://docs.google.com/document/d/1HarvestRegionalEstimateOrbit/edit'),
      I(25 * H, 'ct-rohan', 'Got it. The PO will take till Monday, our approver is travelling.'),
      O(24.8 * H, 'u-arjun', "No problem. I'll check back Monday morning."),
      A(24.7 * H, 'u-arjun', 'snoozed the conversation'),
    ],
  },
  {
    key: 'northpeakScale', inbox: 'ib-whatsapp', contact: 'ct-kabir', client: 'cl-northpeak', assignee: 'u-neha', team: 't-accounts', status: 'PENDING', labels: ['lb-feedback'],
    msgs: [
      I(9 * H, 'ct-kabir', 'Hi Neha, the leads from last week were great. 61 trials booked. Can we increase the budget on the Meta campaign?'),
      O(8.5 * H, 'u-neha', "Hi Kabir! That's great to hear. Sara is preparing a scale-up plan, I'll share it by tomorrow morning."),
      N(8.4 * H, 'u-neha', '@Sara Khan can you draft a +30% budget plan for the Northpeak trial campaign? Cost per trial was 212 last week.', ['u-sara']),
      N(7 * H, 'u-sara', 'Drafting. We can scale 30% without touching the audiences. Beyond that we need new creatives.'),
      I(6 * H, 'ct-kabir', 'Also thinking of a referral offer for members. Thoughts?'),
      O(5.5 * H, 'u-neha', 'Good idea. Let me bring two options to our Friday call, one with a free month and one with a guest pass.'),
      A(5.4 * H, 'u-neha', 'marked the conversation as pending'),
    ],
  },
  { key: 'northpeakCalls', inbox: 'ib-voice', contact: 'ct-kabir', client: 'cl-northpeak', assignee: 'u-neha', team: 't-accounts', msgs: [K('k-04'), K('k-17')] },
  {
    key: 'northpeakScreens', inbox: 'ib-whatsapp', contact: 'ct-tanya', client: 'cl-northpeak', assignee: 'u-neha', team: 't-accounts', status: 'RESOLVED',
    msgs: [
      I(3 * D, 'ct-tanya', 'Neha, need the new class schedule creative for the studio TV screens. 1920x1080.'),
      O(3 * D - 1 * H, 'u-neha', 'On it. Will send by 5 pm.'),
      O(3 * D - 5 * H, 'u-neha', "Here's the screen creative: https://drive.google.com/file/d/1NorthpeakScheduleScreen01/view"),
      I(3 * D - 5.5 * H, 'ct-tanya', 'Looks great on the screen. Thank you!'),
      O(3 * D - 5.6 * H, 'u-neha', 'Glad it works 🙌'),
      A(3 * D - 5.7 * H, 'u-neha', 'marked the conversation as resolved'),
    ],
  },
  {
    key: 'northpeakFacebook', inbox: 'ib-facebook', contact: 'ct-tanya', client: 'cl-northpeak', assignee: 'u-neha', team: 't-accounts', labels: ['lb-feedback'],
    msgs: [
      I(51 * H, 'ct-tanya', 'Hi! Someone commented on our New Year offer ad asking if the offer applies to the Baner studio as well. Can you check and reply from the page?'),
      O(50.5 * H, 'u-neha', "Hi Tanya, on it. The offer copy says all studios, so I'll confirm that in the comments and pin the reply."),
      I(50 * H, 'ct-tanya', "Perfect. Also the ad shows last month's class timings in the second frame."),
      N(49.6 * H, 'u-neha', '@Sara Khan please pause the Northpeak offer carousel until the second frame is fixed. Old timings.', ['u-sara']),
      O(49.5 * H, 'u-neha', 'Good catch. We are swapping the frame today, the updated ad goes live by evening.'),
      I(26 * H, 'ct-tanya', 'Thanks for fixing the frame. Can we extend the offer by a week? Sign-ups are picking up.'),
      O(2 * H, 'u-neha', "Yes, extending it till the 30th. I'll update the ad copy and the pinned comment today.", { status: 'FAILED', error: "Meta rejected this reply: it was sent more than 24 hours after the client's last message." }),
    ],
  },
  {
    key: 'lumenGroup', inbox: 'ib-whatsapp', client: 'cl-lumen', group: 'Lumen & Leaf | Launch Squad', assignee: 'u-arjun', team: 't-accounts', priority: 'MEDIUM', labels: ['lb-campaign', 'lb-influencer'],
    msgs: [
      I(4 * D, 'ct-meher', 'Hi all, the Dew Drop Serum 50 ml launches on the 28th. We need the launch carousel, six creator reels and a launch day live.'),
      O(4 * D - 30, 'u-arjun', 'Hi Meher, Lisa. Got it. Sharing a launch calendar by tomorrow. Vikram is on captions, Rahul on the carousel.'),
      I(3 * D, 'ct-lisa', 'Final product shots are in. Using this one as the hero.', { files: ['productShot'] }),
      O(3 * D - 20, 'u-arjun', "Beautiful shot. We'll build the carousel around it."),
      N(3 * D - 25, 'u-arjun', '@Vikram Rao need launch captions in two tones, clinical and playful, by Thursday.', ['u-vikram']),
      O(2 * D, 'u-arjun', 'Launch calendar and creator shortlist: https://docs.google.com/spreadsheets/d/1LumenLaunchCalendarOrbit/edit'),
      I(2 * D - 1 * H, 'ct-lisa', 'Shortlist looks good. Please drop creator 4, she posted for a competitor last week.'),
      O(2 * D - 1.5 * H, 'u-arjun', 'Done, replaced with a dermatologist-led creator. Updated in the sheet.'),
      I(3.2 * H, 'ct-meher', 'Any update on the carousel? We need to send it to the retailer by tomorrow.'),
      I(3 * H, 'ct-lisa', 'And can the live be at 7 pm instead of 6?'),
    ],
  },
  {
    key: 'lumenFeedback', inbox: 'ib-whatsapp', contact: 'ct-meher', client: 'cl-lumen', assignee: 'u-rahul', team: 't-accounts', labels: ['lb-creative-review'],
    msgs: [
      I(5.5 * H, 'ct-meher', 'Rahul, Arjun said to send carousel feedback to you directly. Frame 3 feels too dark and the serum bottle looks smaller than the dropper.'),
      A(5.4 * H, 'u-arjun', 'assigned to Rahul Verma'),
      O(5.2 * H, 'u-rahul', "Hi Meher, noted. I'll lift the background on frame 3 and scale the bottle up by about 15%."),
      I(5 * H, 'ct-meher', 'Also can the green be closer to our pack colour? The Pantone is on the brand sheet.'),
      O(4.5 * H, 'u-rahul', 'Here is v2 with the brand green and the larger bottle.', { files: ['carousel'] }),
      I(4.3 * H, 'ct-meher', 'Much better! The offer text on frame 6 is a little small on mobile.'),
      O(4.2 * H, 'u-rahul', 'Bumping it two sizes. Final export in an hour.'),
      I(25, 'ct-meher', 'Sorry, one last thing. Can frame 1 say "New 50 ml" instead of "Now in 50 ml"?'),
    ],
  },
  {
    key: 'lumenWebsite', inbox: 'ib-web', contact: 'ct-lisa', client: 'cl-lumen', assignee: 'u-arjun', team: 't-accounts', status: 'RESOLVED',
    msgs: [
      I(50 * H, 'ct-lisa', 'Can you send over the influencer shortlist for the serum launch?'),
      G(50 * H - 0.2),
      O(49.8 * H, 'u-arjun', 'Hi Lisa, here is the shortlist (second tab): https://docs.google.com/spreadsheets/d/1LumenLaunchCalendarOrbit/edit'),
      I(49.5 * H, 'ct-lisa', 'Perfect, thanks!'),
      A(49.4 * H, 'u-arjun', 'marked the conversation as resolved'),
    ],
  },
  {
    key: 'skylineProposal', inbox: 'ib-email', contact: 'ct-dev', client: 'cl-skyline', subject: 'Proposal request: launch campaign for The Meridian', assignee: 'u-priya', team: 't-accounts', status: 'PENDING', priority: 'HIGH', labels: ['lb-new-lead'],
    msgs: [
      I(50 * H, 'ct-dev', 'Dear Orbit team,\n\nWe are a mid-size developer launching The Meridian, 240 homes in the east of the city. We are speaking to three agencies for the launch.\n\nCould you share a proposal covering strategy, creative and performance, with indicative fees? Our marketing manager Ira will coordinate.\n\nRegards,\nDev Malhotra\nDirector, Skyline Habitat Realty'),
      N(49 * H, 'u-priya', '@Aditi Rao this looks like a big one: 240 homes and a three-agency pitch. @Arjun Mehta can you pull our real estate case studies?', ['u-aditi', 'u-arjun']),
      O(48 * H, 'u-priya', 'Dear Dev,\n\nThank you for considering us. We would love to pitch. Could we get 30 minutes this week to understand the project and your sales targets? I can do Thursday 11:00 or Friday 15:00.\n\nWarm regards,\nPriya Sharma\nAccount Director, Orbit Media'),
      I(30 * H, 'ct-dev', 'Thursday 11:00 works. Sending a calendar invite.\n\nDev'),
      N(29 * H, 'u-arjun', 'Case studies are in the pitch folder: https://drive.google.com/drive/folders/1SkylinePitchOrbitFolder'),
      O(6 * H, 'u-priya', 'Dear Dev,\n\nGood speaking with you yesterday. Our proposal is attached, with the phased plan and the team. The deck with the creative routes is here: https://docs.google.com/presentation/d/1SkylineLaunchDeckOrbit/edit\n\nHappy to walk your team through it.\n\nPriya', { files: ['proposal'] }),
      A(5.9 * H, 'u-priya', 'marked the conversation as pending'),
    ],
  },
  {
    key: 'skylineWebsite', inbox: 'ib-web', contact: 'ct-ira', client: 'cl-skyline', assignee: null, team: 't-accounts', priority: 'MEDIUM', labels: ['lb-new-lead'],
    msgs: [
      I(4.9 * H, 'ct-ira', 'Hello, we are launching a residential project called The Meridian next quarter and need a full digital launch campaign. What do your packages look like?'),
      G(4.9 * H - 0.2),
      I(4.8 * H, 'ct-ira', 'Budget is roughly 15 lakh across three months. My director Dev has also emailed your team.'),
      I(4.7 * H, 'ct-ira', 'Could someone call me today? +1 202 555 0114'),
    ],
  },
  {
    key: 'brightpathAds', inbox: 'ib-whatsapp', contact: 'ct-sameer', client: 'cl-brightpath', assignee: 'u-neha', team: 't-accounts', priority: 'URGENT', labels: ['lb-urgent', 'lb-campaign'],
    msgs: [
      I(7 * H, 'ct-sameer', 'Neha, the masterclass ads have stopped delivering since morning. Registrations are flat. The webinar is in 2 days!'),
      O(6.9 * H, 'u-neha', 'Checking right now, Sameer.'),
      N(6.8 * H, 'u-neha', '@Sara Khan BrightPath masterclass ads show Rejected in Ads Manager. Can you look urgently? @Priya Sharma flagging this, the webinar is on Saturday.', ['u-sara', 'u-priya']),
      N(6.7 * H, 'u-sara', 'Policy flag on the phrase "guaranteed placement" in the primary text. Appealing, and uploading a clean variant in parallel.'),
      O(6.6 * H, 'u-neha', "Found it. The platform flagged one line in the ad copy. We've appealed and a revised version is in review, usually back within a few hours."),
      I(6.5 * H, 'ct-sameer', 'Please keep me posted. We have 400 seats to fill.'),
      I(4.2 * H, 'ct-sameer', 'Any update??'),
    ],
  },
  {
    key: 'brightpathTelegram', inbox: 'ib-telegram', contact: 'ct-sameer', client: 'cl-brightpath', assignee: 'u-neha', team: 't-accounts',
    msgs: [
      I(30 * H, 'ct-sameer', 'Neha, quick one. Need the masterclass ad creatives approved today, the webinar is on Saturday.'),
      O(29.8 * H, 'u-neha', 'Here is the final static. Headline and date are updated.', { files: ['webinarAd'] }),
      I(29.5 * H, 'ct-sameer', 'Looks good. Can the button say Reserve a seat instead of Register?'),
      O(29 * H, 'u-neha', 'It already does in this version 🙂 Pushing it live now.'),
      I(28 * H, 'ct-sameer', 'Great. Send me the tracking link for our emailer too.'),
      O(27.5 * H, 'u-neha', 'Here you go: https://brightpath.example/masterclass?utm_source=email&utm_campaign=data-skills'),
      I(27 * H, 'ct-sameer', 'Thanks!'),
      O(26.9 * H, 'u-neha', "Anytime. I'll share registrations tomorrow morning."),
    ],
  },
  {
    key: 'brightpathBlog', inbox: 'ib-email', contact: 'ct-pooja', client: 'cl-brightpath', subject: 'Blog calendar for November', assignee: 'u-vikram', team: 't-accounts', labels: ['lb-feedback'],
    msgs: [
      I(2 * D, 'ct-pooja', 'Hi Vikram,\n\nSharing the topics our academic team wants covered in November:\n\n- Careers in data analytics\n- How to pick a first programming language\n- A parent guide to online certifications\n\nCan you turn these into a calendar with keywords?\n\nPooja'),
      O(2 * D - 3 * H, 'u-vikram', "Hi Pooja,\n\nThe calendar is here with primary keywords and search volumes: https://docs.google.com/spreadsheets/d/1BrightPathBlogCalendarNov/edit\n\nI've added two extra topics that are trending with your audience.\n\nVikram"),
      I(28 * H, 'ct-pooja', 'This is great. Could the parent guide go first? Admissions open on the 20th.\n\nPooja'),
      O(27 * H, 'u-vikram', 'Moved it to the 12th so it has a week to rank before admissions open.\n\nVikram'),
      I(3.5 * H, 'ct-pooja', 'One more request: can we get the first draft of the parent guide by Monday?\n\nPooja'),
    ],
  },
  {
    key: 'copperLaunch', inbox: 'ib-whatsapp', contact: 'ct-vivek', client: 'cl-copperpot', assignee: 'u-arjun', team: 't-accounts', labels: ['lb-feedback'],
    msgs: [
      I(8 * H, 'ct-vivek', 'Arjun, the Indiranagar outlet opens on the 22nd. Need a launch plan, nothing fancy.'),
      O(7.8 * H, 'u-arjun', 'Congratulations Vivek! Thinking: three reels from the kitchen, a neighbourhood offer on Maps and Instagram, and ten local food creators for the opening weekend.'),
      I(7.5 * H, 'ct-vivek', 'Budget?'),
      O(7.3 * H, 'u-arjun', "Around 1.2 lakh all in, including creator meals. I'll send a one pager tonight."),
      I(7 * H, 'ct-vivek', 'Ok. Keep the thali in every frame, that is what people come for.'),
      O(6.9 * H, 'u-arjun', 'Always 😄'),
      I(1.5 * H, 'ct-vivek', 'Reel shoot is confirmed for Friday 10 am at the new outlet.'),
      O(1.4 * H, 'u-arjun', 'Locked. Rahul and Alex will be there by 9:30 for setup.'),
    ],
  },
  {
    key: 'copperCalls', inbox: 'ib-voice', contact: 'ct-vivek', client: 'cl-copperpot', assignee: 'u-arjun', team: 't-accounts',
    msgs: [K('k-11'), K('k-12'), N(24.9 * H, 'u-arjun', "Returned Vivek's voicemail. He wants the launch one pager before Friday's shoot.")],
  },
  {
    key: 'copperShoot', inbox: 'ib-telegram', client: 'cl-copperpot', group: 'Copper Pot | Reels Shoot', assignee: 'u-arjun', team: 't-accounts', status: 'PENDING',
    msgs: [
      I(2 * D, 'ct-diya', 'Creating this group for the shoot logistics. Vivek sir is here too.'),
      O(2 * D - 15, 'u-arjun', 'Thanks Diya. Shot list coming up today.'),
      O(2 * D - 2 * H, 'u-arjun', 'Shot list and schedule: https://docs.google.com/document/d/1CopperPotShotListOrbit/edit'),
      I(2 * D - 3 * H, 'ct-vivek', 'Add the tandoor shot. And the staff group photo at the end.'),
      N(2 * D - 3.2 * H, 'u-arjun', '@Rahul Verma they want a tandoor shot and a staff photo added. Do we need a second light for the kitchen?', ['u-rahul']),
      N(2 * D - 4 * H, 'u-rahul', "Yes, one extra panel light. I'll carry it. Alex is bringing the gimbal."),
      O(2 * D - 4.2 * H, 'u-arjun', "Both added. We'll bring an extra light for the kitchen."),
      I(20 * H, 'ct-diya', 'Parking is at the back gate. Tell the crew to come by 9:30.'),
      O(19.5 * H, 'u-arjun', 'Will do. See you Friday.'),
      A(19.4 * H, 'u-arjun', 'marked the conversation as pending'),
    ],
  },
  {
    key: 'copperMenu', inbox: 'ib-email', contact: 'ct-hari', client: 'cl-copperpot', subject: 'Menu photos for the Indiranagar outlet', assignee: 'u-arjun', team: 't-accounts',
    msgs: [
      I(22 * H, 'ct-hari', 'Hello Arjun sir,\n\nAttaching the photos taken by our staff for the new outlet menu. Please see if these can be used.\n\nHari Prasad\nOutlet Manager', { files: ['menu1', 'menu2'] }),
      N(21 * H, 'u-arjun', '@Rahul Verma are these usable for the menu, or do we reshoot the hero dishes on Friday?', ['u-rahul']),
      N(20 * H, 'u-rahul', "Lighting is flat on both. Fine for the Maps listing, not for print. Let's reshoot the thali and the biryani on Friday."),
      O(19 * H, 'u-arjun', "Hi Hari,\n\nThank you. These work for the Maps listing. For the printed menu we will reshoot the thali and the biryani during Friday's shoot, so no extra visit is needed.\n\nArjun"),
      I(50, 'ct-hari', 'Ok sir. What time should the kitchen be ready on Friday?\n\nHari'),
    ],
  },
  {
    key: 'copperCaptions', inbox: 'ib-instagram', contact: 'ct-diya', client: 'cl-copperpot', assignee: 'u-vikram', team: 't-accounts', status: 'RESOLVED',
    msgs: [
      I(3 * D, 'ct-diya', "Hi! Captions for this week's three reels please 🙏"),
      O(3 * D - 1 * H, 'u-vikram', 'Hi Diya! Here they are:\n1. Slow cooked. Served fast.\n2. Sunday is for thalis and second helpings.\n3. The new outlet smells like home already.'),
      I(3 * D - 2 * H, 'ct-diya', 'Love number 2. Can number 3 mention Indiranagar?'),
      O(3 * D - 2.2 * H, 'u-vikram', '"Indiranagar, your new kitchen smells like home already." How is that?'),
      I(3 * D - 2.5 * H, 'ct-diya', 'Perfect, posting today!'),
      A(3 * D - 2.6 * H, 'u-vikram', 'marked the conversation as resolved'),
    ],
  },
  {
    key: 'loomReport', inbox: 'ib-email', contact: 'ct-nikhil', client: 'cl-loom', subject: 'Weekly ROAS report and the catalogue feed issue', assignee: 'u-sara', team: 't-performance', priority: 'MEDIUM',
    msgs: [
      O(30 * H, 'u-sara', 'Hi Nikhil,\n\nWeekly numbers are in the sheet: https://docs.google.com/spreadsheets/d/1LoomWeeklyRoasOrbit/edit\n\nBlended ROAS was 3.4 (up from 2.9). Catalogue ads did the heavy lifting.\n\nOne issue: 38 products are being rejected because the feed has missing size attributes.\n\nSara'),
      I(26 * H, 'ct-nikhil', 'Thanks Sara. The feed comes from our store plugin. What exactly needs fixing?\n\nNikhil'),
      O(25 * H, 'u-sara', 'The size field is empty for the new winter collection. If your team fills in size in the product editor, the plugin will pick it up on the next sync.\n\nSara'),
      N(24.5 * H, 'u-sara', '@Neha Kapoor heads up, 38 SKUs are off catalogue ads until they fix the feed. ROAS will dip this week if it drags.', ['u-neha']),
      I(7 * H, 'ct-nikhil', 'Fixed 30 of them. The remaining 8 are bundles and have no single size.\n\nNikhil'),
      O(6.5 * H, 'u-sara', 'For bundles, set size to One Size. That clears the rejection.\n\nSara'),
      I(2.2 * H, 'ct-nikhil', 'Done. Can you confirm they are approved now?\n\nNikhil'),
    ],
  },
  {
    key: 'loomInstagram', inbox: 'ib-instagram', contact: 'ct-zoya', client: 'cl-loom', assignee: 'u-sara', team: 't-performance', priority: 'LOW',
    msgs: [
      I(46 * H, 'ct-zoya', 'Hey team! The reel with the wool overshirt is doing so well organically. Can we put some budget behind it?'),
      O(45.5 * H, 'u-sara', 'Hi Zoya! Yes, saw that, the saves are great. I can boost it as a partnership ad from your handle. Budget in mind?'),
      I(45 * H, 'ct-zoya', 'Maybe 15k for a week to start?'),
      O(44.8 * H, 'u-sara', "Works. I'll set it up with a lookalike of past purchasers and share numbers on Monday."),
      I(20 * H, 'ct-zoya', 'Also sharing the lookbook selects for the carousel ads.', { files: ['lookbook'] }),
      O(19.5 * H, 'u-sara', 'These are lovely. Using frames 1, 3 and 4 for the carousel. Going live tomorrow morning.'),
      I(19 * H, 'ct-zoya', '🙌'),
      O(18.9 * H, 'u-sara', 'Will keep you posted 😊'),
    ],
  },
  { key: 'loomCalls', inbox: 'ib-voice', contact: 'ct-zoya', client: 'cl-loom', assignee: 'u-neha', team: 't-accounts', msgs: [K('k-10'), N(27.8 * H, 'u-neha', 'Call with Zoya: happy with ROAS, wants a winter sale plan by next week. Sara to share projections.')] },
  {
    key: 'trailmarkGeorge', inbox: 'ib-whatsapp', contact: 'ct-george', client: 'cl-trailmark', assignee: 'u-priya', team: 't-accounts', status: 'RESOLVED',
    msgs: [
      I(6 * D + 2 * H, 'ct-george', 'Priya, Sana will email you about pausing the retainer. Wanted to tell you personally, the team has been great.'),
      O(6 * D + 1.5 * H, 'u-priya', "Thank you George, that means a lot. We'll make the handover smooth and be ready for the summer season."),
      I(6 * D + 1 * H, 'ct-george', "Let's catch up in February."),
      O(6 * D + 0.9 * H, 'u-priya', "It's a date 🙂"),
      A(6 * D + 0.8 * H, 'u-priya', 'marked the conversation as resolved'),
    ],
  },
  {
    key: 'trailmarkPause', inbox: 'ib-email', contact: 'ct-sana', client: 'cl-trailmark', subject: 'Pausing the retainer until March', assignee: 'u-priya', team: 't-accounts', status: 'RESOLVED',
    msgs: [
      I(6 * D, 'ct-sana', 'Hi Priya,\n\nAs discussed, we would like to pause the retainer from this month and resume in March before the summer season.\n\nSana'),
      O(6 * D - 3 * H, 'u-priya', "Hi Sana,\n\nUnderstood, and thank you for the notice. We'll wrap this month's deliverables, hand over the content bank and keep your ad accounts in maintenance mode.\n\nPriya"),
      I(5 * D, 'ct-sana', 'That works. Please also share the content bank folder.\n\nSana'),
      O(5 * D - 1 * H, 'u-priya', 'Here it is: https://drive.google.com/drive/folders/1TrailmarkContentBankOrbit\n\nSpeak in February to plan the summer push.\n\nPriya'),
      A(5 * D - 1.1 * H, 'u-priya', 'marked the conversation as resolved'),
    ],
  },
  {
    key: 'hotelLead', inbox: 'ib-whatsapp', contact: 'ct-ritika', client: null, assignee: null, team: 't-accounts', labels: ['lb-new-lead'],
    msgs: [
      I(2.1 * H, 'ct-ritika', 'Hi, got your number from a friend at Copper Pot. We run two boutique hotels and need help with social media and reviews.'),
      I(2 * H, 'ct-ritika', 'Do you have monthly packages?'),
    ],
  },
  { key: 'unknownCaller', inbox: 'ib-voice', contact: 'ct-unknown-caller', client: null, assignee: null, team: 't-accounts', msgs: [K('k-15')] },
  {
    key: 'candleLead', inbox: 'ib-web', contact: 'ct-marcus', client: null, assignee: 'u-neha', team: 't-accounts',
    msgs: [
      I(5 * H, 'ct-marcus', 'Hi, do you work with small D2C brands? We sell handmade candles online.'),
      G(5 * H - 0.2),
      O(4.9 * H, 'u-neha', 'Hi Marcus! Yes, we do. What are you looking for help with: ads, content or both?'),
      I(4.8 * H, 'ct-marcus', 'Mostly ads. We spend about 40k a month on Instagram ourselves and results are all over the place.'),
      O(4.7 * H, 'u-neha', "That's a common stage. We have a starter performance plan for brands under 1 lakh monthly spend. Can I send details to your email?"),
      I(4.6 * H, 'ct-marcus', 'Yes please, marcus@wickandwax.example'),
      O(4.5 * H, 'u-neha', "Sent. I've also added a short audit checklist you can run on your ad account today."),
    ],
  },
  { key: 'seoVisitor', inbox: 'ib-web', contact: 'ct-visitor', client: null, assignee: null, team: 't-accounts', msgs: [I(35, 'ct-visitor', 'Do you do one-time SEO audits or only retainers?'), G(34.8)] },
  {
    key: 'snackLead', inbox: 'ib-web', contact: 'ct-priyanka', client: null, assignee: null, team: 't-accounts', labels: ['lb-new-lead'],
    msgs: [
      I(12, 'ct-priyanka', 'Hi! We are launching a D2C snack brand in January and looking for an agency for the launch. Who can I speak to?'),
      G(11.8),
      I(11, 'ct-priyanka', 'My email is priyanka@crunchleaf.example'),
    ],
  },
  {
    key: 'creatorInquiry', inbox: 'ib-instagram', contact: 'ct-ishita', client: null, assignee: null, team: null, labels: ['lb-influencer'],
    msgs: [
      I(1.6 * H, 'ct-ishita', "Hi Orbit team! I'm a skincare creator (48k followers). I heard you handle Lumen & Leaf. Are you onboarding creators for the serum launch?"),
      I(1.5 * H, 'ct-ishita', 'My media kit: https://drive.google.com/file/d/1IshitaMediaKitSample01/view'),
    ],
  },
  {
    key: 'internInquiry', inbox: 'ib-facebook', contact: 'ct-harish', client: null, assignee: 'u-meera', team: null, status: 'RESOLVED',
    msgs: [
      I(4 * D, 'ct-harish', 'Hello, are you hiring interns for social media? I am a final year media student.'),
      O(4 * D - 40, 'u-meera', "Hi Harish, thanks for writing in. We open internship applications in January. Please send your portfolio to careers@orbitmedia.example and we'll keep it on file."),
      I(4 * D - 50, 'ct-harish', 'Thank you, will do.'),
      A(4 * D - 55, 'u-meera', 'marked the conversation as resolved'),
    ],
  },
  {
    key: 'printVendor', inbox: 'ib-email', contact: 'ct-suresh', client: null, subject: 'Quote for roll-up standees (20 units)', assignee: 'u-meera', team: null, priority: 'LOW',
    msgs: [
      O(28 * H, 'u-meera', 'Hi Suresh,\n\nWe need 20 roll-up standees (3 x 6 ft) for a client event on the 24th. Could you share a quote and turnaround time?\n\nMeera Iyer\nOrbit Media'),
      I(24 * H, 'ct-suresh', 'Dear Meera,\n\nQuote attached. We can deliver in 4 working days from artwork approval.\n\nRegards,\nSuresh\nPrintWorks Studio', { files: ['quote'] }),
      O(22 * H, 'u-meera', 'Thanks Suresh. Can you do matte lamination at the same price if we confirm today?\n\nMeera'),
      I(1.2 * H, 'ct-suresh', 'Yes, matte at the same price for 20 units. Please send the artwork by tomorrow noon.\n\nSuresh'),
    ],
  },
  {
    key: 'jobApplicant', inbox: 'ib-email', contact: 'ct-aarav', client: null, subject: 'Application: motion designer role', assignee: null, team: null,
    msgs: [
      I(26 * H, 'ct-aarav', 'Hello,\n\nI am a motion designer with four years of experience in brand films and social content. I saw the opening on your website and would like to apply. Portfolio: https://aaravshah.example/reel\n\nThanks,\nAarav Shah'),
      N(20 * H, 'u-meera', 'Holding this until the job description is final. Will reply with next steps this week.'),
    ],
  },
];

// ─── Team chat ───────────────────────────────────────────────────────────────

export interface ChatSeed {
  at: number;
  by: string | null;
  text: string;
  mentions?: string[];
  files?: string[];
  reactions?: Record<string, string[]>;
  replies?: { at: number; by: string; text: string; files?: string[] }[];
  system?: boolean;
}

export interface ChannelSeed {
  id: string;
  kind: 'PUBLIC' | 'PRIVATE' | 'DM' | 'GROUP_DM';
  name?: string;
  topic?: string;
  description?: string;
  client?: string;
  by: string;
  /** Days since the channel was created. */
  since: number;
  members: string[];
  /** Members who have read everything (everyone else last looked about two hours ago). */
  caughtUp?: string[];
  msgs: ChatSeed[];
}

const EVERYONE = ['u-aditi', 'u-meera', 'u-priya', 'u-arjun', 'u-neha', 'u-rahul', 'u-sara', 'u-vikram'];

export const CHANNELS: ChannelSeed[] = [
  {
    id: 'ch-general', kind: 'PUBLIC', name: 'general', topic: 'Agency-wide announcements', description: 'Everyone at Orbit Media. Keep it to things the whole team should see.', by: 'u-aditi', since: 6, members: EVERYONE,
    msgs: [
      { at: 6 * D, by: 'u-aditi', text: 'Welcome to AscenTalk 🎉 Client WhatsApp, email, calls and our own chat now live in one place. Please move client conversations here from your personal phones this week.', reactions: { '🎉': ['u-meera', 'u-priya', 'u-arjun', 'u-neha', 'u-sara'], '👍': ['u-rahul'] } },
      { at: 6 * D - 1 * H, by: 'u-meera', text: 'Housekeeping: everyone has an account now. If your role or team looks wrong, message me.' },
      {
        at: 3 * D, by: 'u-priya', text: 'Reminder: monthly client reviews are due Friday. Please update the Drive folders for your accounts before Thursday evening.', reactions: { '👍': ['u-arjun', 'u-neha'] },
        replies: [
          { at: 3 * D - 1 * H, by: 'u-arjun', text: 'Harvest Lane and Lumen & Leaf folders are updated ✅' },
          { at: 3 * D - 2 * H, by: 'u-neha', text: 'Northpeak and BrightPath by tomorrow end of day.' },
          { at: 3 * D - 3 * H, by: 'u-sara', text: 'Performance dashboards are refreshed for all five accounts.' },
        ],
      },
      { at: 2 * D, by: 'u-aditi', text: 'Big pitch alert: Skyline Habitat (real estate, 240 homes). Priya is leading. If you have real estate work in your portfolio, drop it in the pitch folder: https://drive.google.com/drive/folders/1SkylinePitchOrbitFolder', reactions: { '🔥': ['u-arjun', 'u-rahul', 'u-sara'] } },
      { at: 1 * D, by: 'u-meera', text: 'The office closes at 4 pm on Friday for the team lunch. Client calls after 4 go to voicemail and we call back on Monday.', reactions: { '🙌': ['u-vikram', 'u-neha', 'u-rahul', 'u-arjun'] } },
      { at: 5 * H, by: 'u-vikram', text: 'Our blog on festive campaign learnings is live. Shares appreciated 🙏' },
      { at: 70, by: 'u-aditi', text: '@channel the Friday review deck is due tomorrow noon. Two slides per client, numbers first.', mentions: ['channel'] },
      { at: 40, by: 'u-arjun', text: 'Harvest Lane slides are in.' },
    ],
  },
  {
    id: 'ch-creative-studio', kind: 'PUBLIC', name: 'creative-studio', topic: 'Design reviews, references and works in progress', by: 'u-rahul', since: 6, members: ['u-rahul', 'u-vikram', 'u-arjun', 'u-priya', 'u-alex', 'u-aditi', 'u-neha'],
    msgs: [
      { at: 4 * D, by: 'u-rahul', text: 'Mood board for the Harvest Lane festive film is up. Lamps, kitchens, no fireworks (brand guardrail).', files: ['moodboard'], reactions: { '❤️': ['u-vikram', 'u-arjun'], '👏': ['u-priya'] } },
      { at: 4 * D - 2 * H, by: 'u-vikram', text: 'Tagline options are in the doc: https://docs.google.com/document/d/1HarvestTaglinesOrbit/edit Current favourite: "Every home has a festive recipe."' },
      {
        at: 3 * D, by: 'u-rahul', text: '@Alex Fernandes the storyboard is final, please start the rough cut. Raw footage is in the shared folder.', mentions: ['u-alex'],
        replies: [
          { at: 3 * D - 1 * H, by: 'u-alex', text: 'Got it. First assembly by tomorrow evening.' },
          { at: 3 * D - 2 * H, by: 'u-rahul', text: 'Use the warm grade from the Copper Pot shoot as a starting point.' },
          { at: 2 * D, by: 'u-alex', text: 'Assembly is up. 42 seconds, needs a trim to 30.' },
        ],
      },
      { at: 2 * D - 2 * H, by: 'u-alex', text: 'Rough cut v1 of the festive film is in the folder. Music is a placeholder.', reactions: { '🔥': ['u-rahul'], '👀': ['u-arjun'] } },
      { at: 2 * D - 3 * H, by: 'u-priya', text: 'Watched it. The table scene is lovely. The pack shot needs to land in the first 3 seconds, the client was firm on that.' },
      { at: 2 * D - 4 * H, by: 'u-alex', text: 'Noted, moving the pack shot up and tightening the open.' },
      {
        at: 26 * H, by: 'u-rahul', text: 'Lumen & Leaf carousel v2, for a quick sanity check before it goes to the client.', files: ['carousel'],
        replies: [
          { at: 25 * H, by: 'u-vikram', text: 'The copy on frame 6 is small on mobile.' },
          { at: 24.5 * H, by: 'u-rahul', text: 'Fixing.' },
        ],
      },
      { at: 4 * H, by: 'u-alex', text: 'Festive film v2 exported: 30 seconds, pack shot at 0:02. Link: https://drive.google.com/file/d/1FestiveFilmV2OrbitCut/view', reactions: { '👏': ['u-rahul', 'u-priya'] } },
      { at: 3.5 * H, by: 'u-rahul', text: 'This is the one. @Arjun Mehta ready to share with the client.', mentions: ['u-arjun'] },
      { at: 50, by: 'u-alex', text: "Friday's Copper Pot shoot: I'm carrying the gimbal and two lenses. Do we need the slider?" },
      { at: 45, by: 'u-rahul', text: 'No slider, the kitchen is tight. Bring the extra battery though.' },
    ],
  },
  {
    id: 'ch-performance', kind: 'PUBLIC', name: 'performance', topic: 'Paid media: budgets, pacing and platform quirks', by: 'u-sara', since: 6, members: ['u-sara', 'u-priya', 'u-neha', 'u-arjun'],
    msgs: [
      { at: 3 * D, by: 'u-sara', text: 'Weekly pacing: Northpeak 96%, Loom & Thread 104%, BrightPath 88% (the masterclass push starts Thursday). Harvest Lane starts next week.' },
      { at: 2 * D, by: 'u-sara', text: 'Reminder that the platforms are stricter on claims this month. No "guaranteed" anything in ad copy please.' },
      {
        at: 7 * H, by: 'u-sara', text: 'BrightPath masterclass ads were rejected this morning for exactly that. Appeal filed, clean variant in review.',
        replies: [
          { at: 6.8 * H, by: 'u-neha', text: "The client is anxious, the webinar is on Saturday. Shout the moment it's approved." },
          { at: 6.5 * H, by: 'u-sara', text: 'Will do. It usually takes 3 to 6 hours.' },
          { at: 6 * H, by: 'u-priya', text: "Keep me in the loop. If it isn't back by 5, call the platform rep." },
        ],
      },
      { at: 3 * H, by: 'u-priya', text: '@Sara Khan can you add a ROAS trend slide for Loom & Thread to the Friday deck?', mentions: ['u-sara'] },
      { at: 2.5 * H, by: 'u-sara', text: 'Yes. The sheet is here if anyone wants the raw numbers: https://docs.google.com/spreadsheets/d/1LoomWeeklyRoasOrbit/edit' },
    ],
  },
  {
    id: 'ch-random', kind: 'PUBLIC', name: 'random', topic: 'Chai, lunch votes and everything else', by: 'u-aditi', since: 6, members: ['u-aditi', 'u-priya', 'u-arjun', 'u-neha', 'u-rahul', 'u-sara', 'u-vikram'],
    msgs: [
      { at: 2 * D, by: 'u-sara', text: 'Who is up for chai at 4? ☕', reactions: { '☕': ['u-arjun', 'u-rahul', 'u-vikram', 'u-neha'] } },
      { at: 2 * D - 1 * H, by: 'u-vikram', text: 'Only if we are going to the place with the bun maska.' },
      { at: 1 * D, by: 'u-rahul', text: 'Found a font called Gulab. It is exactly as dramatic as it sounds.' },
      { at: 1 * D - 20, by: 'u-priya', text: 'Do not put it in a client deck.' },
      { at: 1 * D - 25, by: 'u-rahul', text: 'Too late 😇', reactions: { '😂': ['u-sara', 'u-arjun', 'u-neha'] } },
      { at: 2 * H, by: 'u-neha', text: 'Friday lunch vote: biryani or pizza?', reactions: { '🍕': ['u-sara'], '🍛': ['u-arjun', 'u-vikram', 'u-rahul', 'u-aditi'] } },
      { at: 1.8 * H, by: 'u-arjun', text: 'Biryani. We have a client to support.' },
    ],
  },
  {
    id: 'ch-leadership', kind: 'PRIVATE', name: 'leadership', topic: 'Hiring, pricing and planning', by: 'u-aditi', since: 6, members: ['u-aditi', 'u-meera', 'u-priya'],
    msgs: [
      { at: 3 * D, by: 'u-aditi', text: 'Hiring: we need a second designer before the Skyline work starts, if we win it. Meera, can we open the role this week?' },
      { at: 3 * D - 1 * H, by: 'u-meera', text: 'The job description is drafted. The budget works if we push the motion designer hire to next quarter.' },
      { at: 3 * D - 2 * H, by: 'u-priya', text: "Rahul is stretched already. I'd rather hire motion first: Alex is carrying all our video as a freelancer." },
      { at: 2 * D, by: 'u-aditi', text: "Fair. Let's hire motion first and keep Alex on a monthly retainer till then." },
      { at: 1 * D, by: 'u-meera', text: 'Trailmark confirmed the pause until March. Revenue impact is small this quarter, flagged in the sheet.' },
      { at: 5 * H, by: 'u-priya', text: 'The Skyline pitch went well. They liked the phased plan. Decision next week.' },
      { at: 4.8 * H, by: 'u-aditi', text: 'Great work. What do they need from us to decide?' },
      { at: 90, by: 'u-priya', text: 'A reference call. Thinking of asking Harvest Lane.' },
    ],
  },
  {
    id: 'ch-accounts-huddle', kind: 'PRIVATE', name: 'accounts-huddle', topic: 'Daily check-in for the accounts team', by: 'u-priya', since: 6, members: ['u-priya', 'u-arjun', 'u-neha'],
    msgs: [
      { at: 2 * D, by: 'u-priya', text: 'Morning check: anything stuck?' },
      { at: 2 * D - 10, by: 'u-arjun', text: 'Harvest Lane media plan is waiting on client sign-off. Otherwise clear.' },
      { at: 2 * D - 15, by: 'u-neha', text: 'BrightPath masterclass creatives are going live today.' },
      { at: 7 * H, by: 'u-priya', text: 'Neha, saw the BrightPath escalation. Do you need me on a call with Sameer?' },
      { at: 6.9 * H, by: 'u-neha', text: "Not yet. If the appeal isn't back by evening, yes please." },
      { at: 2 * H, by: 'u-arjun', text: 'Heads up: a hotel owner messaged on WhatsApp via a Copper Pot referral. Unassigned for now, who has bandwidth?' },
      { at: 1.9 * H, by: 'u-priya', text: 'Neha, can you take it after the BrightPath fire is out?' },
    ],
  },
  {
    id: 'ch-harvest-lane', kind: 'PUBLIC', name: 'harvest-lane', topic: 'Internal discussion for Harvest Lane Foods', client: 'cl-harvest', by: 'u-arjun', since: 6, members: ['u-arjun', 'u-priya', 'u-rahul', 'u-sara', 'u-vikram', 'u-alex', 'u-aditi'],
    msgs: [
      { at: 5 * D, by: 'u-arjun', text: 'Client guardrails for the festive film: no fireworks, pack shot in the first 3 seconds, Hindi and English versions.' },
      { at: 4 * D, by: 'u-sara', text: 'Media plan v1 is in the client folder.' },
      {
        at: 3 * D, by: 'u-arjun', text: 'The client wants 15% on regional placements and creators as a separate line. @Sara Khan can you rework?', mentions: ['u-sara'],
        replies: [
          { at: 3 * D - 1 * H, by: 'u-sara', text: 'v3 uploaded.', files: ['mediaPlan'] },
          { at: 3 * D - 2 * H, by: 'u-arjun', text: 'Sent to the client.' },
        ],
      },
      { at: 26 * H, by: 'u-arjun', text: 'The client approved the festive budget 🎉 @Vikram Rao we need the Hindi and English taglines locked by tomorrow.', mentions: ['u-vikram'], reactions: { '🎉': ['u-sara', 'u-rahul', 'u-vikram', 'u-priya'] } },
      { at: 25 * H, by: 'u-vikram', text: 'On it. Drafts in https://docs.google.com/document/d/1HarvestTaglinesOrbit/edit by end of day.' },
      {
        at: 5 * H, by: 'u-arjun', text: '@Alex Fernandes the client asked if the pack shot can be a little bigger in the hero frame. Possible without re-exporting everything?', mentions: ['u-alex'],
        replies: [
          { at: 4.5 * H, by: 'u-alex', text: "Yes, it's a separate layer. Ten minutes." },
          { at: 4.4 * H, by: 'u-arjun', text: 'Legend.' },
        ],
      },
      { at: 3 * H, by: 'u-alex', text: 'Pack shot scaled up 12%. New frame attached.', files: ['heroFrame'], reactions: { '👏': ['u-arjun'] } },
      { at: 75, by: 'u-arjun', text: 'Anita is asking for the final media plan PDF with the week 4 reserve. @Sara Khan', mentions: ['u-sara'] },
      { at: 30, by: 'u-sara', text: 'Exporting now.' },
    ],
  },
  {
    id: 'ch-lumen-leaf', kind: 'PUBLIC', name: 'lumen-leaf', topic: 'Serum launch on the 28th', client: 'cl-lumen', by: 'u-arjun', since: 5, members: ['u-arjun', 'u-rahul', 'u-vikram', 'u-priya'],
    msgs: [
      { at: 4 * D, by: 'u-arjun', text: 'The launch is on the 28th: carousel, six creator reels and a launch day live.' },
      { at: 3 * D, by: 'u-vikram', text: 'Captions in two tones are in the doc. The clinical one tests better with dermatologist creators.' },
      { at: 5.5 * H, by: 'u-arjun', text: 'Meher will send carousel feedback straight to Rahul on WhatsApp. The conversation is assigned to you @Rahul Verma.', mentions: ['u-rahul'] },
      { at: 4.4 * H, by: 'u-rahul', text: 'v2 sent. She wants the offer text bigger, doing that now.' },
    ],
  },
  {
    id: 'ch-northpeak', kind: 'PUBLIC', name: 'northpeak', topic: 'Trial sign-ups and studio creatives', client: 'cl-northpeak', by: 'u-neha', since: 5, members: ['u-neha', 'u-sara', 'u-priya', 'u-rahul'],
    msgs: [
      { at: 2 * D, by: 'u-neha', text: '61 trials booked last week 🎉 Kabir wants to scale.', reactions: { '🎉': ['u-sara', 'u-priya'] } },
      { at: 2 * D - 1 * H, by: 'u-sara', text: 'We can go +30% on the same audiences.' },
      { at: 26 * H, by: 'u-neha', text: "Rahul, frame 2 of the offer carousel has last month's timings. The new ones are in the folder." },
      { at: 25 * H, by: 'u-rahul', text: 'Swapped. Re-exported all sizes.' },
    ],
  },
  {
    id: 'ch-loom-thread', kind: 'PRIVATE', name: 'loom-thread', topic: 'ROAS, feed health and the winter sale', client: 'cl-loom', by: 'u-sara', since: 5, members: ['u-neha', 'u-sara', 'u-priya'],
    msgs: [
      { at: 30 * H, by: 'u-sara', text: '38 SKUs rejected in the catalogue feed, missing size attribute. Told Nikhil.' },
      { at: 7 * H, by: 'u-sara', text: '30 fixed. Bundles left.' },
      { at: 6.5 * H, by: 'u-neha', text: 'Zoya wants a winter sale plan next week. Can you put projections together?' },
      { at: 6 * H, by: 'u-sara', text: 'Yes, by Tuesday.' },
    ],
  },
  {
    id: 'ch-skyline-pitch', kind: 'PRIVATE', name: 'skyline-pitch', topic: 'The Meridian launch pitch', client: 'cl-skyline', by: 'u-priya', since: 2, members: ['u-priya', 'u-arjun', 'u-aditi', 'u-rahul'],
    msgs: [
      { at: 2 * D, by: 'u-priya', text: 'Kick-off call with Dev is Thursday 11:00. We need three creative routes, a phased media plan and a team slide.' },
      { at: 2 * D - 2 * H, by: 'u-rahul', text: 'Routes by Wednesday night. Thinking: the skyline at dusk, resident stories, and a walk-through film.', files: ['sitePlan'] },
      { at: 29 * H, by: 'u-arjun', text: 'Case studies are in the folder: https://drive.google.com/drive/folders/1SkylinePitchOrbitFolder' },
      { at: 6 * H, by: 'u-priya', text: 'Proposal sent. Fingers crossed 🤞', reactions: { '🤞': ['u-arjun', 'u-aditi', 'u-rahul'] } },
      { at: 5 * H, by: 'u-aditi', text: "Well done all. Whatever happens, this is the best deck we've made." },
    ],
  },
  {
    id: 'ch-dm-aditi-priya', kind: 'DM', by: 'u-priya', since: 6, members: ['u-aditi', 'u-priya'],
    msgs: [
      { at: 2 * D, by: 'u-priya', text: 'Can we discuss the Skyline lead? Looks like a big one.' },
      { at: 2 * D - 10, by: 'u-aditi', text: 'Yes. Tomorrow at 10?' },
      { at: 2 * D - 12, by: 'u-priya', text: 'Works.' },
      { at: 100, by: 'u-aditi', text: 'How did the proposal land?' },
      { at: 95, by: 'u-priya', text: 'Sent this morning. They want a reference call. Can I ask Anita at Harvest Lane?' },
      { at: 20, by: 'u-aditi', text: 'Yes, go ahead. Brief her first.' },
    ],
  },
  {
    id: 'ch-dm-arjun-rahul', kind: 'DM', by: 'u-arjun', since: 6, members: ['u-arjun', 'u-rahul'],
    msgs: [
      { at: 26 * H, by: 'u-arjun', text: 'Thursday for the Harvest Lane first cut, doable?' },
      { at: 25.8 * H, by: 'u-rahul', text: 'Doable. Alex is fast.' },
      { at: 5.4 * H, by: 'u-arjun', text: "Assigned Meher's carousel chat to you, she wants to give feedback directly." },
      { at: 5.3 * H, by: 'u-rahul', text: 'Saw it. On it.' },
      { at: 55, by: 'u-rahul', text: "Can you check if Friday's shoot has parking for the van?" },
    ],
  },
  {
    id: 'ch-dm-arjun-priya', kind: 'DM', by: 'u-priya', since: 5, members: ['u-arjun', 'u-priya'],
    msgs: [
      { at: 29 * H, by: 'u-priya', text: 'Thanks for pulling the case studies so fast.' },
      { at: 28.9 * H, by: 'u-arjun', text: 'Anytime. Good luck on Thursday.' },
    ],
  },
  {
    id: 'ch-dm-arjun-neha', kind: 'DM', by: 'u-arjun', since: 5, members: ['u-arjun', 'u-neha'],
    msgs: [
      { at: 2 * H, by: 'u-arjun', text: 'The hotel lead on WhatsApp came through Vivek. Might be a good one for you.' },
      { at: 1.9 * H, by: 'u-neha', text: 'After BrightPath is sorted, yes!' },
    ],
  },
  {
    id: 'ch-dm-neha-sara', kind: 'DM', by: 'u-neha', since: 5, members: ['u-neha', 'u-sara'],
    msgs: [
      { at: 7 * H, by: 'u-neha', text: 'Please tell me the appeal is moving 😬' },
      { at: 6.9 * H, by: 'u-sara', text: 'In review. Breathing exercises recommended.' },
    ],
  },
  {
    id: 'ch-dm-aditi-meera', kind: 'DM', by: 'u-meera', since: 6, members: ['u-aditi', 'u-meera'],
    msgs: [
      { at: 1 * D, by: 'u-meera', text: 'The Trailmark pause is confirmed, paperwork done.' },
      { at: 1 * D - 5, by: 'u-aditi', text: 'Thanks Meera.' },
      { at: 3 * H, by: 'u-meera', text: 'Standee quote from the printer is in. 20 units, 4 working days.' },
    ],
  },
  {
    id: 'ch-dm-meera-priya', kind: 'DM', by: 'u-meera', since: 5, members: ['u-meera', 'u-priya'],
    msgs: [
      { at: 2 * D, by: 'u-meera', text: "Do you need a contractor agreement for Alex's retainer?" },
      { at: 2 * D - 1 * H, by: 'u-priya', text: 'Yes please, from the 1st.' },
    ],
  },
  {
    id: 'ch-gdm-festive-pod', kind: 'GROUP_DM', by: 'u-arjun', since: 4, members: ['u-arjun', 'u-rahul', 'u-vikram'],
    msgs: [
      { at: 3 * D, by: 'u-arjun', text: 'Festive pod: daily 5 pm check-in till the film ships?' },
      { at: 3 * D - 5, by: 'u-rahul', text: 'Fine by me.' },
      { at: 3 * D - 6, by: 'u-vikram', text: 'Same.' },
      { at: 4 * H, by: 'u-vikram', text: 'Hindi tagline: "Har ghar ka apna tyohaar." Thoughts?' },
      { at: 3.9 * H, by: 'u-rahul', text: 'Reads beautifully on the end frame.', },
      { at: 3.8 * H, by: 'u-arjun', text: 'Sending it to the client.' },
    ],
  },
];

// ─── Notifications, extra activity and the audit log ─────────────────────────

/** `link` uses `conv:<key>` for a client conversation (resolved to its id when the data set is built). */
export const NOTIFICATIONS: { user: string; type: string; title: string; body?: string; link: string; at: number; read?: boolean }[] = [
  { user: 'u-aditi', type: 'dm', title: 'Priya Sharma sent you a message', body: 'Sent this morning. They want a reference call. Can I ask Anita at Harvest Lane?', link: '/chat/ch-dm-aditi-priya', at: 95 },
  { user: 'u-aditi', type: 'mention', title: 'Priya Sharma mentioned you in a private note', body: '@Aditi Rao this looks like a big one: 240 homes and a three-agency pitch.', link: 'conv:skylineProposal', at: 49 * H },
  { user: 'u-aditi', type: 'dm', title: 'Meera Iyer sent you a message', body: 'Standee quote from the printer is in. 20 units, 4 working days.', link: '/chat/ch-dm-aditi-meera', at: 3 * H },
  { user: 'u-aditi', type: 'dm', title: 'Meera Iyer sent you a message', body: 'The Trailmark pause is confirmed, paperwork done.', link: '/chat/ch-dm-aditi-meera', at: 1 * D, read: true },

  { user: 'u-meera', type: 'new_message', title: 'Suresh Pillai (Client Desk Email)', body: 'Yes, matte at the same price for 20 units. Please send the artwork by tomorrow noon.', link: 'conv:printVendor', at: 1.2 * H },
  { user: 'u-meera', type: 'chat_mention', title: 'Aditi Rao mentioned you in #general', body: '@channel the Friday review deck is due tomorrow noon. Two slides per client, numbers first.', link: '/chat/ch-general', at: 70 },
  { user: 'u-meera', type: 'dm', title: 'Aditi Rao sent you a message', body: 'Thanks Meera.', link: '/chat/ch-dm-aditi-meera', at: 1 * D - 5, read: true },
  { user: 'u-meera', type: 'dm', title: 'Priya Sharma sent you a message', body: 'Yes please, from the 1st.', link: '/chat/ch-dm-meera-priya', at: 2 * D - 1 * H, read: true },

  { user: 'u-priya', type: 'dm', title: 'Aditi Rao sent you a message', body: 'Yes, go ahead. Brief her first.', link: '/chat/ch-dm-aditi-priya', at: 20 },
  { user: 'u-priya', type: 'mention', title: 'Neha Kapoor mentioned you in a private note', body: '@Priya Sharma flagging this, the webinar is on Saturday.', link: 'conv:brightpathAds', at: 6.8 * H },
  { user: 'u-priya', type: 'chat_mention', title: 'Aditi Rao mentioned you in #general', body: '@channel the Friday review deck is due tomorrow noon. Two slides per client, numbers first.', link: '/chat/ch-general', at: 70 },
  { user: 'u-priya', type: 'new_message', title: 'Dev Malhotra (Client Desk Email)', body: 'Thursday 11:00 works. Sending a calendar invite.', link: 'conv:skylineProposal', at: 30 * H, read: true },
  { user: 'u-priya', type: 'missed_call', title: 'Missed call from Tanya Bose', link: '/calls', at: 5 * D + 2 * H, read: true },

  { user: 'u-arjun', type: 'new_message', title: 'Anita Desai (Orbit WhatsApp)', body: 'When can we expect the media plan with the regional split?', link: 'conv:harvestGroup', at: 80 },
  { user: 'u-arjun', type: 'new_message', title: 'Hari Prasad (Client Desk Email)', body: 'Ok sir. What time should the kitchen be ready on Friday?', link: 'conv:copperMenu', at: 50 },
  { user: 'u-arjun', type: 'dm', title: 'Rahul Verma sent you a message', body: "Can you check if Friday's shoot has parking for the van?", link: '/chat/ch-dm-arjun-rahul', at: 55 },
  { user: 'u-arjun', type: 'chat_mention', title: 'Rahul Verma mentioned you in #creative-studio', body: 'This is the one. @Arjun Mehta ready to share with the client.', link: '/chat/ch-creative-studio', at: 3.5 * H },
  { user: 'u-arjun', type: 'new_message', title: 'Anita Desai (Client Desk Email)', body: 'Approved from our side. Rohan is copied for the purchase order.', link: 'conv:harvestMediaPlan', at: 5 * H, read: true },
  { user: 'u-arjun', type: 'mention', title: 'Priya Sharma mentioned you in a private note', body: '@Arjun Mehta can you pull our real estate case studies?', link: 'conv:skylineProposal', at: 49 * H, read: true },
  { user: 'u-arjun', type: 'missed_call', title: 'Voicemail from Vivek Menon', link: 'conv:copperCalls', at: 26 * H, read: true },

  { user: 'u-rahul', type: 'new_message', title: 'Meher Kohli (Orbit WhatsApp)', body: 'Sorry, one last thing. Can frame 1 say "New 50 ml" instead of "Now in 50 ml"?', link: 'conv:lumenFeedback', at: 25 },
  { user: 'u-rahul', type: 'chat_mention', title: 'Aditi Rao mentioned you in #general', body: '@channel the Friday review deck is due tomorrow noon. Two slides per client, numbers first.', link: '/chat/ch-general', at: 70 },
  { user: 'u-rahul', type: 'assigned', title: 'Arjun Mehta assigned you a conversation', body: 'Meher Kohli', link: 'conv:lumenFeedback', at: 5.4 * H, read: true },
  { user: 'u-rahul', type: 'chat_mention', title: 'Arjun Mehta mentioned you in #lumen-leaf', body: 'The conversation is assigned to you @Rahul Verma.', link: '/chat/ch-lumen-leaf', at: 5.5 * H, read: true },
  { user: 'u-rahul', type: 'mention', title: 'Arjun Mehta mentioned you in a private note', body: '@Rahul Verma are these usable for the menu, or do we reshoot the hero dishes on Friday?', link: 'conv:copperMenu', at: 21 * H, read: true },
  { user: 'u-rahul', type: 'mention', title: 'Arjun Mehta mentioned you in a private note', body: '@Rahul Verma client wants the first cut by Thursday. Can you confirm timelines?', link: 'conv:harvestGroup', at: 25 * H, read: true },

  { user: 'u-alex', type: 'chat_mention', title: 'Arjun Mehta mentioned you in #harvest-lane', body: '@Alex Fernandes the client asked if the pack shot can be a little bigger in the hero frame.', link: '/chat/ch-harvest-lane', at: 5 * H },
  { user: 'u-alex', type: 'chat_mention', title: 'Rahul Verma mentioned you in #creative-studio', body: '@Alex Fernandes the storyboard is final, please start the rough cut.', link: '/chat/ch-creative-studio', at: 3 * D, read: true },

  { user: 'u-neha', type: 'new_message', title: 'Sameer Joshi (Orbit WhatsApp)', body: 'Any update??', link: 'conv:brightpathAds', at: 4.2 * H },
  { user: 'u-neha', type: 'missed_call', title: 'Missed call from Kabir Singh', link: 'conv:northpeakCalls', at: 45 },
  { user: 'u-neha', type: 'mention', title: 'Sara Khan mentioned you in a private note', body: '@Neha Kapoor heads up, 38 SKUs are off catalogue ads until they fix the feed.', link: 'conv:loomReport', at: 24.5 * H, read: true },
  { user: 'u-sara', type: 'new_message', title: 'Nikhil Batra (Client Desk Email)', body: 'Done. Can you confirm they are approved now?', link: 'conv:loomReport', at: 2.2 * H },
  { user: 'u-sara', type: 'chat_mention', title: 'Arjun Mehta mentioned you in #harvest-lane', body: 'Anita is asking for the final media plan PDF with the week 4 reserve. @Sara Khan', link: '/chat/ch-harvest-lane', at: 75 },
  { user: 'u-vikram', type: 'new_message', title: 'Pooja Nair (Client Desk Email)', body: 'One more request: can we get the first draft of the parent guide by Monday?', link: 'conv:brightpathBlog', at: 3.5 * H },
];

/** Things in the oversight feed that are not a message, a call or a status change. */
export const EXTRA_ACTIVITY: { at: number; type: string; by: string; summary: string; client?: string }[] = [
  { at: 51 * H, type: 'client.created', by: 'u-priya', summary: 'Priya Sharma added client Skyline Habitat Realty', client: 'cl-skyline' },
  { at: 48.5 * H, type: 'chat.channel_created', by: 'u-priya', summary: 'Priya Sharma created private channel #skyline-pitch', client: 'cl-skyline' },
  { at: 46 * H, type: 'client.drive_link', by: 'u-arjun', summary: 'Arjun Mehta pinned a Drive link: Reels shoot: shot list and schedule', client: 'cl-copperpot' },
  { at: 45 * H, type: 'client.drive_link', by: 'u-vikram', summary: 'Vikram Rao pinned a Drive link: Blog calendar: November', client: 'cl-brightpath' },
  { at: 30 * H, type: 'client.drive_link', by: 'u-sara', summary: 'Sara Khan pinned a Drive link: Weekly ROAS report', client: 'cl-loom' },
  { at: 29 * H, type: 'client.drive_link', by: 'u-arjun', summary: 'Arjun Mehta pinned a Drive link: Real estate case studies', client: 'cl-skyline' },
  { at: 26 * H, type: 'client.drive_link', by: 'u-arjun', summary: 'Arjun Mehta pinned a Drive link: Festive film: storyboard v2', client: 'cl-harvest' },
  { at: 24 * H, type: 'client.updated', by: 'u-meera', summary: 'Meera Iyer updated client Trailmark Travel', client: 'cl-trailmark' },
  { at: 6 * H, type: 'client.drive_link', by: 'u-priya', summary: 'Priya Sharma pinned a Drive link: Pitch deck: The Meridian launch', client: 'cl-skyline' },
  { at: 5.9 * H, type: 'client.drive_link', by: 'u-arjun', summary: 'Arjun Mehta pinned a Drive link: Indiranagar launch one pager', client: 'cl-copperpot' },
  { at: 4.6 * H, type: 'contact.linked', by: 'u-priya', summary: 'Priya Sharma linked Ira Banerjee to Skyline Habitat Realty', client: 'cl-skyline' },
];

export const AUDIT: { at: number; by: string | null; action: string; type?: string; target?: string; data?: Record<string, unknown> }[] = [
  { at: 6 * D + 4 * H, by: 'u-aditi', action: 'workspace.updated', type: 'workspace', target: '1', data: { name: 'Orbit Media' } },
  { at: 6 * D + 3 * H, by: 'u-meera', action: 'inbox.email_connected', type: 'inbox', target: 'ib-email', data: { provider: 'google', email: 'hello@orbitmedia.example' } },
  { at: 6 * D + 2 * H, by: 'u-meera', action: 'inbox.created', type: 'inbox', target: 'ib-web', data: { channelType: 'WEBSITE', name: 'Orbit Website Chat' } },
  { at: 6 * D + 1 * H, by: 'u-meera', action: 'user.invited', type: 'user', target: 'u-alex', data: { email: 'alex@freelance.example', role: 'GUEST' } },
  { at: 6 * D, by: 'u-alex', action: 'auth.invite_accepted', type: 'user', target: 'u-alex' },
  { at: 5 * D + 6 * H, by: 'u-meera', action: 'team.updated', type: 'team', target: 't-performance' },
  { at: 5 * D, by: 'u-aditi', action: 'user.updated', type: 'user', target: 'u-neha', data: { role: 'ACCOUNT_MANAGER' } },
  { at: 4 * D + 2 * H, by: null, action: 'auth.login_failed', type: 'user', data: { email: 'rahul@orbitmedia.example' } },
  { at: 4 * D + 2 * H - 1, by: 'u-rahul', action: 'auth.login', type: 'user', target: 'u-rahul' },
  { at: 3 * D + 5 * H, by: 'u-meera', action: 'inbox.updated', type: 'inbox', target: 'ib-instagram', data: { memberIds: ['u-vikram'] } },
  { at: 3 * D + 4 * H, by: 'u-meera', action: 'oversight.internal_read', type: 'channel', target: 'ch-accounts-huddle', data: { kind: 'PRIVATE', name: 'accounts-huddle' } },
  { at: 51 * H, by: 'u-priya', action: 'client.created', type: 'client', target: 'cl-skyline', data: { name: 'Skyline Habitat Realty' } },
  { at: 2 * D, by: 'u-priya', action: 'auth.login', type: 'user', target: 'u-priya' },
  { at: 47 * H, by: 'u-aditi', action: 'oversight.internal_read', type: 'channel', target: 'ch-loom-thread', data: { kind: 'PRIVATE', name: 'loom-thread' } },
  { at: 30 * H, by: 'u-meera', action: 'label.deleted', type: 'label', target: 'lb-old-reporting' },
  { at: 26 * H, by: 'u-neha', action: 'auth.login', type: 'user', target: 'u-neha' },
  { at: 24 * H, by: 'u-meera', action: 'client.updated', type: 'client', target: 'cl-trailmark', data: { status: 'PAUSED' } },
  { at: 23 * H, by: 'u-arjun', action: 'client.updated', type: 'client', target: 'cl-copperpot', data: { notes: 'Four outlets, fifth opens in Indiranagar on the 22nd.' } },
  { at: 9 * H, by: 'u-aditi', action: 'auth.login', type: 'user', target: 'u-aditi' },
  { at: 8.8 * H, by: 'u-meera', action: 'auth.login', type: 'user', target: 'u-meera' },
  { at: 8.6 * H, by: 'u-arjun', action: 'auth.login', type: 'user', target: 'u-arjun' },
  { at: 8.5 * H, by: 'u-sara', action: 'auth.login', type: 'user', target: 'u-sara' },
  { at: 8.2 * H, by: 'u-rahul', action: 'auth.login', type: 'user', target: 'u-rahul' },
  { at: 6 * H, by: 'u-alex', action: 'auth.login', type: 'user', target: 'u-alex' },
  { at: 4.6 * H, by: 'u-meera', action: 'oversight.internal_read', type: 'channel', target: 'ch-skyline-pitch', data: { kind: 'PRIVATE', name: 'skyline-pitch' } },
  { at: 4.5 * H, by: 'u-meera', action: 'inbox.updated', type: 'inbox', target: 'ib-web', data: { greeting: WEBSITE_GREETING } },
  { at: 3 * H, by: 'u-aditi', action: 'user.updated', type: 'user', target: 'u-sara', data: { teamIds: ['t-performance'] } },
];
