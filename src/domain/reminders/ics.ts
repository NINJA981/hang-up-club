import { isLocalDate, type LocalDate } from '../time/dates';

/**
 * The daily calendar reminder (SPEC §3, AC-F10-5): a locally generated
 * RFC 5545 VCALENDAR with one recurring VEVENT. The phone's own calendar app
 * does the ringing, so no server or push is needed.
 *
 * Times are "floating" local times (no TZID, no Z): 9:00 stays 9:00 wherever
 * the player travels, which is what a daily habit wants.
 */

export interface ReminderOptions {
  /** "HH:MM", 24-hour. */
  time: string;
  /** First day of the reminder. */
  startDate: LocalDate;
  /** The app URL opened from the event. */
  appUrl: string;
  /** Stable UID so re-importing replaces rather than duplicates (where calendars support it). */
  uid: string;
  /** DTSTAMP instant (UTC). Injected so output is deterministic in tests. */
  now: Date;
  durationMinutes?: number;
  title?: string;
}

export const REMINDER_TITLE = "Hang Up Club: today's practice call";
export const REMINDER_DESCRIPTION =
  'One practice call, about a minute. Some calls are real, so listen before you hang up.';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isReminderTime(value: string): boolean {
  return TIME_RE.test(value);
}

/** RFC 5545 §3.3.11 TEXT escaping. */
export function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/**
 * RFC 5545 §3.1 line folding: lines longer than 75 octets are split with
 * CRLF + one space. Splits never cut a UTF-8 sequence.
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(current);
      current = ' ';
      bytes = 1;
      limit = 75;
    }
    current += ch;
    bytes += n;
  }
  out.push(current);
  return out.join('\r\n');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function utcStamp(d: Date): string {
  return (
    `${String(d.getUTCFullYear())}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function floating(date: LocalDate, hh: number, mm: number): string {
  return `${date.replace(/-/g, '')}T${pad(hh)}${pad(mm)}00`;
}

export function buildReminderIcs(opts: ReminderOptions): string {
  const m = TIME_RE.exec(opts.time);
  if (!m) throw new RangeError(`Reminder time must be HH:MM, got "${opts.time}"`);
  if (!isLocalDate(opts.startDate)) throw new RangeError('Reminder start date must be YYYY-MM-DD');
  if (!/^https?:\/\//.test(opts.appUrl)) throw new RangeError('appUrl must be http(s)');
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const duration = opts.durationMinutes ?? 5;
  const endTotal = hh * 60 + mm + duration;
  // Keep the event inside the same day; a 23:58 reminder simply ends at 23:59.
  const endClamped = Math.min(endTotal, 23 * 60 + 59);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hang Up Club//Daily reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${utcStamp(opts.now)}`,
    `DTSTART:${floating(opts.startDate, hh, mm)}`,
    `DTEND:${floating(opts.startDate, Math.floor(endClamped / 60), endClamped % 60)}`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${escapeText(opts.title ?? REMINDER_TITLE)}`,
    `DESCRIPTION:${escapeText(`${REMINDER_DESCRIPTION}\n${opts.appUrl}`)}`,
    `URL:${opts.appUrl}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(opts.title ?? REMINDER_TITLE)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export const ICS_MIME = 'text/calendar;charset=utf-8';
export const ICS_FILENAME = 'hang-up-club-reminder.ics';
