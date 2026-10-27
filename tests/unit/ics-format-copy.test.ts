import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatPercent,
  formatPhone,
  formatSeconds,
  groupCode,
  pluralDays,
  wholeSeconds,
} from '../../src/domain/format/format';
import {
  buildReminderIcs,
  escapeText,
  foldLine,
  isReminderTime,
  REMINDER_TITLE,
} from '../../src/domain/reminders/ics';
import { outcomeCopy, resultCardSentence, shareText, streakLine } from '../../src/domain/result/copy';
import { OUTCOMES } from '../../src/domain/scoring/score';

const NB = ' ';

describe('reminder .ics (AC-F10-5)', () => {
  const opts = {
    time: '09:00',
    startDate: '2026-10-21',
    appUrl: 'https://example.org/hang-up-club/',
    uid: 'huc-daily-1234@hang-up-club',
    now: new Date('2026-10-20T14:30:15Z'),
  };

  it('matches the hand-written RFC 5545 fixture exactly', () => {
    const expected = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Hang Up Club//Daily reminder//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:huc-daily-1234@hang-up-club',
      'DTSTAMP:20261020T143015Z',
      'DTSTART:20261021T090000',
      'DTEND:20261021T090500',
      'RRULE:FREQ=DAILY',
      "SUMMARY:Hang Up Club: today's practice call",
      'DESCRIPTION:One practice call\\, about a minute. Some calls are real\\, so li', // 75 octets
      ' sten before you hang up.\\nhttps://example.org/hang-up-club/', // folded: CRLF + one space
      'URL:https://example.org/hang-up-club/',
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      "DESCRIPTION:Hang Up Club: today's practice call",
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
    expect(buildReminderIcs(opts)).toBe(expected);
  });

  it('uses CRLF line endings and never exceeds 75 octets per line', () => {
    const ics = buildReminderIcs({ ...opts, title: 'Ünïcödé reminder with a really long title, '.repeat(4) });
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics).not.toMatch(/(?<!\r)\n/);
    for (const line of ics.split('\r\n'))
      expect(new TextEncoder().encode(line).length, line).toBeLessThanOrEqual(75);
  });
  it('recurs daily at a floating local time (no zone, no Z), so 9:00 stays 9:00', () => {
    const ics = buildReminderIcs({ ...opts, time: '07:45' });
    expect(ics).toContain('RRULE:FREQ=DAILY');
    expect(ics).toContain('DTSTART:20261021T074500');
    expect(ics).not.toMatch(/DTSTART[^\r\n]*(Z|TZID)/);
  });
  it('keeps late reminders inside the same day', () => {
    const ics = buildReminderIcs({ ...opts, time: '23:58' });
    expect(ics).toContain('DTSTART:20261021T235800');
    expect(ics).toContain('DTEND:20261021T235900');
  });
  it('carries the app URL in both the URL property and the description', () => {
    const ics = buildReminderIcs(opts).replace(/\r\n /g, '');
    expect(ics).toContain('URL:https://example.org/hang-up-club/');
    expect(ics).toContain('https://example.org/hang-up-club/\r\n');
    expect(ics).toContain(REMINDER_TITLE);
  });
  it('rejects bad input', () => {
    expect(() => buildReminderIcs({ ...opts, time: '9:00' })).toThrow(RangeError);
    expect(() => buildReminderIcs({ ...opts, time: '24:00' })).toThrow(RangeError);
    expect(() => buildReminderIcs({ ...opts, startDate: '2026-02-30' })).toThrow(RangeError);
    expect(() => buildReminderIcs({ ...opts, appUrl: 'javascript:alert(1)' })).toThrow(RangeError);
  });
  it('validates reminder times', () => {
    for (const ok of ['00:00', '09:30', '23:59']) expect(isReminderTime(ok)).toBe(true);
    for (const bad of ['', '9:30', '24:00', '12:60', '12:5', 'noon']) expect(isReminderTime(bad)).toBe(false);
  });
  it('escapes TEXT values (RFC 5545 section 3.3.11)', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    expect(escapeText('no specials')).toBe('no specials');
  });
  it('never splits a multi-byte character when folding', () => {
    const line = 'SUMMARY:' + 'é'.repeat(60);
    const folded = foldLine(line);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    for (const part of folded.split('\r\n'))
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(foldLine('short')).toBe('short');
  });
});

describe('formatting what the player must read exactly', () => {
  it('formats a clock as m:ss, floored', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(999)).toBe('0:00');
    expect(formatClock(6400)).toBe('0:06');
    expect(formatClock(65_400)).toBe('1:05');
    expect(formatClock(600_000)).toBe('10:00');
  });
  it('survives nonsense', () => {
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(wholeSeconds(-1)).toBe(0);
  });
  it('writes durations for prose with a non-breaking unit gap', () => {
    expect(formatSeconds(0)).toBe(`0${NB}s`);
    expect(formatSeconds(4900)).toBe(`4${NB}s`);
    expect(formatSeconds(60_000)).toBe(`1${NB}min`);
    expect(formatSeconds(65_000)).toBe(`1${NB}min 5${NB}s`);
  });
  it('groups codes in threes', () => {
    expect(groupCode('482913')).toBe('482 913');
    expect(groupCode('48 29 13')).toBe('482 913');
    expect(groupCode('1234')).toBe('123 4');
    expect(groupCode('')).toBe('');
  });
  it('formats North American numbers and leaves others alone', () => {
    expect(formatPhone('6145550148')).toBe('(614) 555-0148');
    expect(formatPhone('+1 614-555-0148')).toBe('(614) 555-0148');
    expect(formatPhone('(614) 555-0148')).toBe('(614) 555-0148');
    expect(formatPhone('555-0148')).toBe('555-0148');
  });
  it('pluralises days and formats percentages', () => {
    expect(pluralDays(1)).toBe('1 day');
    expect(pluralDays(0)).toBe('0 days');
    expect(pluralDays(12)).toBe('12 days');
    expect(formatPercent(0.873)).toBe('87%');
    expect(formatPercent(1.4)).toBe('100%');
    expect(formatPercent(-1)).toBe('0%');
    expect(formatPercent(undefined)).toBeUndefined();
    expect(formatPercent(Number.NaN)).toBeUndefined();
  });
});

describe('result copy (facts, not cheers)', () => {
  it('states the signature headline from SPEC section 1', () => {
    const c = outcomeCopy({ kind: 'scam', outcome: 'sharp', tActionMs: 6400, tAskMs: 40_200 });
    expect(c.headline).toBe('Hung up at 0:06.');
    expect(c.subline).toBe('The scammer needed 0:40.');
  });
  it('says how long after the ask a late hang-up came', () => {
    const c = outcomeCopy({
      kind: 'scam',
      outcome: 'late',
      tActionMs: 44_900,
      tAskMs: 40_900,
      askFor: 'the code',
    });
    expect(c.headline).toBe(`Hung up 4${NB}s after they asked for the code.`);
    expect(outcomeCopy({ kind: 'scam', outcome: 'late', tActionMs: 50_000, tAskMs: 40_000 }).headline).toBe(
      `Hung up 10${NB}s after they asked.`,
    );
  });
  it('names what the player did on a call back', () => {
    expect(
      outcomeCopy({ kind: 'scam', outcome: 'verified', trustedSource: 'the number on your card' }).headline,
    ).toBe('You called the number on your card.');
    expect(outcomeCopy({ kind: 'legit', outcome: 'verified' }).subline).toBe(
      'Calling back on a number you trust is always safe.',
    );
  });
  it('confirms a real call plainly and never mocks a miss', () => {
    expect(outcomeCopy({ kind: 'legit', outcome: 'stayed', who: 'the real pharmacy' }).headline).toBe(
      'That was the real pharmacy.',
    );
    const missed = outcomeCopy({
      kind: 'legit',
      outcome: 'missed',
      missCost: "you'd have missed your refill",
    });
    expect(missed.headline).toBe('That one was real.');
    expect(missed.subline).toContain("you'd have missed your refill");
    for (const o of OUTCOMES) {
      const c = outcomeCopy({
        kind: o === 'stayed' || o === 'missed' ? 'legit' : 'scam',
        outcome: o,
        tActionMs: 1000,
        tAskMs: 2000,
      });
      expect(`${c.headline} ${c.subline}`, o).not.toMatch(/stupid|fool|fail|wrong|bad|!/i);
      expect(['check', 'info', 'clock', 'flag']).toContain(c.icon);
    }
  });
  it('writes the sentence a coach reads in the family chat', () => {
    const base = { name: 'Paati', title: 'a fake bank call', streak: 4 };
    expect(resultCardSentence({ ...base, outcome: 'sharp', tAction: 6400, tAsk: 40_200 })).toBe(
      `Paati hung up 6${NB}s into a fake bank call. The scammer needed 40${NB}s.`,
    );
    expect(resultCardSentence({ ...base, outcome: 'sharp' })).toBe('Paati hung up on a fake bank call.');
    expect(resultCardSentence({ ...base, outcome: 'caught' })).toBe(
      'Paati stayed on a fake bank call until the scammer asked.',
    );
    expect(resultCardSentence({ ...base, outcome: 'verified' })).toBe(
      'Paati hung up on a fake bank call and called the real number.',
    );
    expect(resultCardSentence({ ...base, title: 'a real pharmacy call', outcome: 'stayed' })).toBe(
      'Paati stayed on a real pharmacy call. That was the right call.',
    );
    expect(resultCardSentence({ ...base, title: 'a real pharmacy call', outcome: 'missed' })).toBe(
      'Paati hung up on a real pharmacy call.',
    );
    expect(resultCardSentence({ ...base, outcome: 'late', tAction: 45_000 })).toContain('hung up');
    expect(resultCardSentence({ ...base, outcome: 'jumpy' })).toContain('hung up');
  });
  it('adds the streak to the share text only when there is one', () => {
    expect(streakLine(0)).toBeUndefined();
    expect(streakLine(1)).toBe('Day 1');
    expect(streakLine(12)).toBe('Day 12 in a row');
    const c = { name: 'Nana', title: 'a fake bank call', outcome: 'caught' as const };
    expect(shareText({ ...c, streak: 0 })).toBe('Nana stayed on a fake bank call until the scammer asked.');
    expect(shareText({ ...c, streak: 3 })).toBe(
      'Nana stayed on a fake bank call until the scammer asked. Day 3 in a row.',
    );
  });
});
