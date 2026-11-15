/**
 * Ninety days of back history for the reports.
 *
 * The inbox itself only holds the last week of conversations (content.ts). Older, long-resolved work is
 * represented here as compact records: enough for the reports to count (when it was opened, answered and
 * resolved, by whom, on which channel), without a message history. They start seven days back, so the
 * "last 7 days" view is computed purely from the conversations a visitor can open, and are regenerated from
 * the same seed on every load, so nothing here needs saving.
 */
import type { ChannelType } from '@/lib/api';
import { mulberry32, startOfDay } from './util';

export interface PastConversation {
  createdAt: number;
  firstResponseAt: number;
  resolvedAt: number;
  inboxId: string;
  channelType: ChannelType;
  assigneeId: string;
  teamId: string | null;
  clientId: string | null;
  incoming: number;
  outgoing: number;
}

export interface PastCall {
  startedAt: number;
  userId: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  status: 'COMPLETED' | 'MISSED' | 'VOICEMAIL' | 'NO_ANSWER' | 'BUSY';
  durationSec: number;
}

export const HISTORY_STARTS_DAYS_AGO = 7;
const HISTORY_DAYS = 96;
const DAY = 86_400_000;

const CHANNEL_MIX: [string, ChannelType, number][] = [
  ['ib-whatsapp', 'WHATSAPP', 38],
  ['ib-email', 'EMAIL', 24],
  ['ib-web', 'WEBSITE', 12],
  ['ib-instagram', 'INSTAGRAM', 9],
  ['ib-telegram', 'TELEGRAM', 7],
  ['ib-facebook', 'FACEBOOK', 6],
  ['ib-voice', 'VOICE', 4],
];

/** client, account manager, team, weight. `null` is a walk-in lead that never became a client. */
const CLIENT_MIX: [string | null, string, string | null, number][] = [
  ['cl-harvest', 'u-arjun', 't-accounts', 22],
  ['cl-northpeak', 'u-neha', 't-accounts', 16],
  ['cl-lumen', 'u-arjun', 't-accounts', 15],
  ['cl-copperpot', 'u-arjun', 't-accounts', 12],
  ['cl-brightpath', 'u-neha', 't-accounts', 12],
  ['cl-loom', 'u-sara', 't-performance', 10],
  ['cl-trailmark', 'u-priya', 't-accounts', 8],
  [null, 'u-neha', 't-accounts', 5],
];

function pick<T extends unknown[]>(rand: () => number, rows: T[], weight: (row: T) => number): T {
  const total = rows.reduce((s, r) => s + weight(r), 0);
  let x = rand() * total;
  for (const r of rows) {
    x -= weight(r);
    if (x <= 0) return r;
  }
  return rows[rows.length - 1];
}

let cache: { baseTime: number; conversations: PastConversation[]; calls: PastCall[] } | null = null;

export function history(baseTime: number): { conversations: PastConversation[]; calls: PastCall[] } {
  if (cache?.baseTime === baseTime) return cache;
  const rand = mulberry32(0x51ab07c3);
  const conversations: PastConversation[] = [];
  const calls: PastCall[] = [];
  const today = startOfDay(baseTime);
  // Nothing in the history may still be "happening" in the week the inbox covers.
  const cutoff = startOfDay(today - (HISTORY_STARTS_DAYS_AGO - 1) * DAY + DAY / 2) - 60_000;

  for (let d = HISTORY_DAYS; d >= HISTORY_STARTS_DAYS_AGO; d--) {
    const dayStart = startOfDay(today - d * DAY + DAY / 2);
    const weekday = new Date(dayStart).getDay();
    const weekend = weekday === 0 || weekday === 6;
    // A slowly growing agency: about three conversations a day three months ago, about five last week.
    const base = 3 + ((HISTORY_DAYS - d) / HISTORY_DAYS) * 2.2;
    const count = Math.round(base * (weekend ? 0.3 : 1) * (0.55 + rand() * 0.9));
    for (let i = 0; i < count; i++) {
      const [inboxId, channelType] = pick(rand, CHANNEL_MIX, (r) => r[2]);
      // Trailmark went quiet before the pause; Skyline did not exist yet.
      const clientRow = pick(rand, CLIENT_MIX, (r) => (r[0] === 'cl-trailmark' && d < 30 ? 1 : r[3]));
      const [clientId, manager, teamId] = clientRow;
      const social = channelType === 'INSTAGRAM' || channelType === 'FACEBOOK';
      const roll = rand();
      const assigneeId = roll < 0.72 ? manager : roll < 0.82 ? 'u-priya' : social && roll < 0.93 ? 'u-vikram' : roll < 0.9 ? 'u-arjun' : 'u-neha';
      const createdAt = dayStart + (9 + rand() * 10) * 3_600_000;
      const slow = rand() < 0.08;
      const responseMin = (slow ? 120 + rand() * 260 : 3 + rand() * rand() * 70) * (channelType === 'EMAIL' ? 2.4 : 1);
      const resolveHours = 1 + rand() * rand() * 52;
      const firstResponseAt = Math.min(createdAt + responseMin * 60_000, cutoff - 120_000);
      conversations.push({
        createdAt,
        firstResponseAt,
        resolvedAt: Math.min(Math.max(createdAt + resolveHours * 3_600_000, firstResponseAt + 20 * 60_000), cutoff),
        inboxId,
        channelType,
        assigneeId,
        teamId: clientId ? teamId : inboxId === 'ib-whatsapp' || inboxId === 'ib-web' || inboxId === 'ib-voice' ? 't-accounts' : null,
        clientId,
        incoming: 2 + Math.floor(rand() * 5),
        outgoing: 2 + Math.floor(rand() * 5),
      });
    }

    const callCount = Math.round((weekend ? 0.3 : 1.7) * (0.3 + rand() * 1.4));
    for (let i = 0; i < callCount; i++) {
      const roll = rand();
      const status = roll < 0.72 ? 'COMPLETED' : roll < 0.86 ? 'MISSED' : roll < 0.9 ? 'VOICEMAIL' : roll < 0.97 ? 'NO_ANSWER' : 'BUSY';
      const inbound = status === 'MISSED' || status === 'VOICEMAIL' ? true : status === 'COMPLETED' ? rand() < 0.5 : false;
      const who = rand();
      calls.push({
        startedAt: dayStart + (9.5 + rand() * 9) * 3_600_000,
        userId: status === 'MISSED' || status === 'VOICEMAIL' ? null : who < 0.4 ? 'u-arjun' : who < 0.72 ? 'u-neha' : who < 0.9 ? 'u-priya' : 'u-sara',
        direction: inbound ? 'INBOUND' : 'OUTBOUND',
        status,
        durationSec: status === 'COMPLETED' ? Math.round(40 + rand() * rand() * 860) : 0,
      });
    }
  }
  cache = { baseTime, conversations, calls };
  return cache;
}
