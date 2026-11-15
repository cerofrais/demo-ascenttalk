/** Feature flags as the demo "server" reports them (config/features.json and resolvedFlags() in routes/misc.ts). */
import type { ChannelType, Features } from '@/lib/api';

/**
 * The shipped defaults, with two deliberate differences:
 * - automation.auto_assign is off, so new conversations land in "Unassigned" for someone to pick up, which is
 *   what the demo data shows.
 * - nothing else: every channel is on, exactly like a fresh install.
 */
export const DEMO_FEATURES: Record<string, any> = {
  internal_chat: { enabled: true, dms: true, group_dms: true, threads: true, reactions: true, client_linked_channels: true },
  inbox: { enabled: true, private_notes: true, labels: true, canned_responses: true, priority: true, snooze: true },
  channels: {
    whatsapp: { enabled: true, groups: true, sync_from_me: true },
    email: { enabled: true, google_oauth: true, microsoft_oauth: true, imap_password: true },
    voice: { enabled: true, browser_softphone: true, mobile_bridge: true, recording: true, voicemail: true },
    website: { enabled: true },
    telegram: { enabled: true },
    facebook: { enabled: true },
    instagram: { enabled: true },
    sms: { enabled: false },
  },
  clients: { enabled: true, drive_links: true },
  oversight: { enabled: true, activity_feed: true, workload: true, attention_hours: 4, internal_visibility: 'channels' },
  reports: { enabled: true },
  files: { enabled: true, google_drive_previews: true },
  search: { enabled: true },
  notifications: { enabled: true, browser: true, sound: true },
  automation: { auto_assign: false, auto_assign_strategy: 'account_manager_then_round_robin', auto_reopen: true },
  audit_log: { enabled: true },
  sso: { enabled: true, auto_provision: true, role_from_keycloak: true },
  ai: { enabled: false, summaries: false, reply_suggestions: false, call_transcription: false },
};

export const ATTENTION_HOURS: number = DEMO_FEATURES.oversight.attention_hours;
export const INTERNAL_VISIBILITY: 'none' | 'channels' | 'all' = DEMO_FEATURES.oversight.internal_visibility;

const CHANNELS_ON: Record<ChannelType, boolean> = { WHATSAPP: true, EMAIL: true, VOICE: true, WEBSITE: true, TELEGRAM: true, FACEBOOK: true, INSTAGRAM: true, SMS: false };

/**
 * resolvedFlags(). In the API `voice.enabled` also needs Plivo credentials; the demo reports it as on so the
 * Calls page shows the call history without a "connect Plivo" banner, while GET /voice/config says the
 * softphone is not configured, which keeps the browser SDK from ever starting.
 */
export function resolvedFlags(): Features {
  return {
    internalChat: true,
    dms: true,
    groupDms: true,
    threads: true,
    reactions: true,
    clientLinkedChannels: true,
    inbox: true,
    privateNotes: true,
    labels: true,
    cannedResponses: true,
    priority: true,
    snooze: true,
    channels: { ...CHANNELS_ON },
    voice: { enabled: true, softphone: true, mobileBridge: true, recording: true },
    clients: true,
    driveLinks: true,
    oversight: true,
    activityFeed: true,
    workload: true,
    internalVisibility: INTERNAL_VISIBILITY,
    reports: true,
    files: true,
    drivePreviews: true,
    search: true,
    notifications: true,
    browserNotifications: true,
    sound: true,
    auditLog: true,
    ai: false,
    raw: DEMO_FEATURES,
  };
}
