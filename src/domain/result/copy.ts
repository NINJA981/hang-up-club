import { formatClock, formatSeconds } from '../format/format';
import type { Kind } from '../scenario/schema';
import type { Outcome } from '../scoring/score';

/**
 * Result-screen and result-card copy (DESIGN.md §Screen specs → Result).
 * Facts, not cheers: the headline states what happened in seconds. A miss is
 * never mocked.
 */

export interface OutcomeCopyInput {
  kind: Kind;
  outcome: Outcome;
  tActionMs?: number;
  tAskMs?: number;
  /** Scam: "the code". */
  askFor?: string;
  /** Legit: "the real pharmacy". */
  who?: string;
  /** Legit: "you'd have missed your refill". */
  missCost?: string;
  /** Completes "You called …". */
  trustedSource?: string;
}

export interface OutcomeCopy {
  headline: string;
  subline: string;
  /** Icon role paired with the words (colour is never the only signal). */
  icon: 'check' | 'info' | 'clock' | 'flag';
}

export function outcomeCopy(i: OutcomeCopyInput): OutcomeCopy {
  const tAction = i.tActionMs ?? 0;
  switch (i.outcome) {
    case 'sharp':
      return {
        headline: `Hung up at ${formatClock(tAction)}.`,
        subline:
          i.tAskMs !== undefined
            ? `The scammer needed ${formatClock(i.tAskMs)}.`
            : 'You hung up before they could ask for anything.',
        icon: 'check',
      };
    case 'late': {
      const after = formatSeconds(Math.max(0, tAction - (i.tAskMs ?? tAction)));
      return {
        headline:
          i.askFor !== undefined
            ? `Hung up ${after} after they asked for ${i.askFor}.`
            : `Hung up ${after} after they asked.`,
        subline: 'You got out. Next time, hang up at the first warning sign.',
        icon: 'clock',
      };
    }
    case 'jumpy':
      return {
        headline: 'You hung up before they gave anything away.',
        subline: 'Safe. Next time, listen for the first warning sign.',
        icon: 'check',
      };
    case 'caught':
      return {
        headline: 'They got to the ask, and you were still on the line.',
        subline: "Here's what gave it away.",
        icon: 'flag',
      };
    case 'verified': {
      const headline = `You called ${i.trustedSource ?? 'a number you already trust'}.`;
      return {
        headline,
        subline:
          i.kind === 'scam'
            ? 'That beats this scam every time.'
            : 'Calling back on a number you trust is always safe.',
        icon: 'check',
      };
    }
    case 'stayed':
      return {
        headline: `That was ${i.who ?? 'a real call'}.`,
        subline: "Staying on was right. They didn't ask for anything.",
        icon: 'check',
      };
    case 'cautious':
      return {
        headline: `You called ${i.trustedSource ?? 'a number you already trust'}.`,
        subline: "Calling back is always safe. This one was real and asked for nothing, so you could have stayed on.",
        icon: 'info',
      };
    case 'missed':
      return {
        headline: 'That one was real.',
        subline:
          i.missCost !== undefined
            ? `They didn't ask you for anything. Hanging up isn't dangerous, but ${i.missCost}.`
            : "They didn't ask you for anything. Hanging up isn't dangerous, but this one was safe to hear out.",
        icon: 'info',
      };
  }
}

export interface ResultCardCopyInput {
  name: string;
  title: string;
  outcome: Outcome;
  tAction?: number;
  tAsk?: number;
  streak: number;
}

/** The one-paragraph card a coach sees: "Paati hung up 6 s into a fake bank call. The scammer needed 40 s." */
export function resultCardSentence(c: ResultCardCopyInput): string {
  const into = c.tAction !== undefined ? formatSeconds(c.tAction) : undefined;
  switch (c.outcome) {
    case 'sharp': {
      const first =
        into !== undefined
          ? `${c.name} hung up ${into} into ${c.title}.`
          : `${c.name} hung up on ${c.title}.`;
      return c.tAsk !== undefined ? `${first} The scammer needed ${formatSeconds(c.tAsk)}.` : first;
    }
    case 'late':
    case 'jumpy':
      return into !== undefined
        ? `${c.name} hung up ${into} into ${c.title}.`
        : `${c.name} hung up on ${c.title}.`;
    case 'verified':
    case 'cautious':
      return `${c.name} hung up on ${c.title} and called the real number.`;
    case 'caught':
      return `${c.name} stayed on ${c.title} until the scammer asked.`;
    case 'stayed':
      return `${c.name} stayed on ${c.title}. That was the right call.`;
    case 'missed':
      return `${c.name} hung up on ${c.title}.`;
  }
}

export function streakLine(streak: number): string | undefined {
  if (streak <= 0) return undefined;
  return streak === 1 ? 'Day 1' : `Day ${String(streak)} in a row`;
}

/** Text for the share sheet: one line plus the URL. */
export function shareText(c: ResultCardCopyInput): string {
  const streak = streakLine(c.streak);
  return streak !== undefined ? `${resultCardSentence(c)} ${streak}.` : resultCardSentence(c);
}
