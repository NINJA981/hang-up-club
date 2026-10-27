import {
  Check,
  Clock,
  CreditCard,
  EyeOff,
  Flag,
  IdCard,
  Info,
  KeyRound,
  MonitorSmartphone,
  Minus,
  Moon,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Timer,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { OutcomeCopy } from '../../domain/result/copy';
import { TACTIC_LABELS, type Tactic } from '../../domain/scenario/schema';
import type { Outcome } from '../../domain/scoring/score';
import type { CalendarDay, DayStatus } from '../../domain/streak/streak';
import { cn } from './base';

// ── Tactic stamps ───────────────────────────────────────────────────────────

export const TACTIC_ICONS: Record<Tactic, LucideIcon> = {
  urgency: Timer,
  authority: ShieldCheck,
  fear: TriangleAlert,
  secrecy: EyeOff,
  'unusual-payment': CreditCard,
  'code-request': KeyRound,
  'remote-access': MonitorSmartphone,
  'personal-info': IdCard,
  'too-good': Sparkles,
  isolation: PhoneCall,
};

/** 36px stamp: a 20px icon and the plain label. Never coloured by severity. */
export function TacticStamp({ tactic }: { tactic: Tactic }) {
  const Icon = TACTIC_ICONS[tactic];
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-xs bg-surface-2 px-2.5 text-meta text-text">
      <Icon aria-hidden className="size-5 shrink-0" />
      {TACTIC_LABELS[tactic]}
    </span>
  );
}

// ── Outcome glyphs: always a word and an icon (colour is never the only signal)

export const OUTCOME_ICONS: Record<OutcomeCopy['icon'], LucideIcon> = {
  check: Check,
  info: Info,
  clock: Clock,
  flag: Flag,
};

/** Short words for lists and the coach inbox. */
export const OUTCOME_WORDS: Record<Outcome, string> = {
  sharp: 'Hung up in time',
  late: 'Hung up late',
  jumpy: 'Hung up early',
  caught: 'Stayed on the line',
  verified: 'Called back',
  stayed: 'Stayed on, right call',
  missed: 'Hung up on a real call',
};

export const OUTCOME_ICON_KEY: Record<Outcome, OutcomeCopy['icon']> = {
  sharp: 'check',
  late: 'clock',
  jumpy: 'check',
  caught: 'flag',
  verified: 'check',
  stayed: 'check',
  missed: 'info',
};

export function OutcomeTag({ outcome, className }: { outcome: Outcome; className?: string }) {
  const Icon = OUTCOME_ICONS[OUTCOME_ICON_KEY[outcome]];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-ui',
        outcome === 'late' ? 'text-warning' : 'text-text',
        className,
      )}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      {OUTCOME_WORDS[outcome]}
    </span>
  );
}

// ── Streak days ─────────────────────────────────────────────────────────────

export const DAY_WORDS: Record<DayStatus, string> = {
  done: 'Call done',
  rest: 'Rest day',
  missed: 'Missed',
  today: 'Today',
  future: 'Not yet',
  none: 'No call',
};

function DayGlyph({ status }: { status: DayStatus }) {
  if (status === 'done') return <Check aria-hidden className="size-5" strokeWidth={3} />;
  if (status === 'rest') return <Moon aria-hidden className="size-5" />;
  if (status === 'missed') return <Minus aria-hidden className="size-5" />;
  return null;
}

/** What the calendar's glyphs mean, as icon plus word. */
export function DayLegend() {
  const items = [
    { glyph: <Check aria-hidden className="size-5" strokeWidth={3} />, word: 'Call done' },
    { glyph: <Moon aria-hidden className="size-5" />, word: 'Rest day, streak kept' },
    { glyph: <Minus aria-hidden className="size-5" />, word: 'No call' },
  ];
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-meta text-text-muted">
      {items.map((i) => (
        <li key={i.word} className="flex items-center gap-2">
          {i.glyph}
          {i.word}
        </li>
      ))}
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-4 rounded-xs ring-2 ring-accent" />
        Today
      </li>
    </ul>
  );
}

/** One day: a number and an icon, with the status in words for screen readers. Never colour alone. */
export function DayCell({ day, weekday }: { day: CalendarDay; weekday?: { short: string; long: string } }) {
  const { status, isToday } = day;
  const num = Number(day.date.slice(8));
  return (
    <li
      className={cn(
        'flex min-w-0 flex-col items-center justify-center rounded-sm text-meta',
        weekday !== undefined ? 'h-20' : 'h-14',
        status === 'done' && 'bg-accent-soft text-accent-text',
        status === 'rest' && 'bg-surface-2 text-text-muted',
        (status === 'missed' || status === 'none') && 'text-text-subtle',
        status === 'future' && 'text-text-subtle',
        isToday && 'bg-surface text-text ring-2 ring-accent',
      )}
    >
      {weekday !== undefined && (
        <span className="text-meta leading-none text-text-muted" aria-hidden>
          <span className="md:hidden">{weekday.short}</span>
          <span className="hidden md:inline">{weekday.long}</span>
        </span>
      )}
      <span className="tabular leading-none">{num}</span>
      <span className="mt-0.5 flex h-5 items-center">
        <DayGlyph status={status} />
      </span>
      <span className="sr-only">
        {day.date}: {isToday && status !== 'done' ? DAY_WORDS.today : DAY_WORDS[status]}
        {isToday && status === 'done' ? ', today' : ''}
      </span>
    </li>
  );
}
