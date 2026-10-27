import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { recentDays, type StreakResult } from '../../domain/streak/streak';
import { weekdayIndex, type LocalDate } from '../../domain/time/dates';
import { cn } from './base';
import { TextField } from './controls';
import { DayCell } from './domain';

const LONG = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

export function weekdayLabels(date: LocalDate): { short: string; long: string } {
  const i = weekdayIndex(date);
  return { short: SHORT[i] ?? '', long: LONG[i] ?? '' };
}

/** The last seven days as a strip: a number, an icon and a word for each day. */
export function StreakStrip({ streak, today }: { streak: Pick<StreakResult, 'days'>; today: LocalDate }) {
  const days = recentDays(streak, today, 7);
  return (
    <ol aria-label="The last seven days" className="grid grid-cols-7 gap-1.5">
      {days.map((d) => (
        <DayCell key={d.date} day={d} weekday={weekdayLabels(d.date)} />
      ))}
    </ol>
  );
}

const OTHER = '__other__';

/**
 * "What do callers call you?" Fifteen terms and "Something else". Selected is
 * shown with a check and a border, not by colour alone.
 */
export function AddressPicker({
  terms,
  value,
  onChange,
  error,
}: {
  terms: readonly string[];
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
}) {
  const known = terms.includes(value);
  const [other, setOther] = useState(!known && value !== '');
  const selected = other ? OTHER : known ? value : '';
  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup.Root
        type="single"
        value={selected}
        aria-label="What should callers call you?"
        onValueChange={(v) => {
          if (v === OTHER) {
            setOther(true);
            if (known) onChange('');
          } else if (v) {
            setOther(false);
            onChange(v);
          }
        }}
        className="sm:grid-cols-3 grid grid-cols-2 gap-3"
      >
        {[...terms, OTHER].map((t) => (
          <ToggleGroup.Item
            key={t}
            value={t}
            className={cn(
              'group flex h-14 items-center justify-between gap-2 rounded-md border px-4 text-ui transition-colors duration-100',
              t === OTHER && 'sm:col-span-3 col-span-2',
              'border-border-strong bg-surface text-text hover:bg-surface-2',
              'data-[state=on]:border-accent data-[state=on]:bg-accent-soft data-[state=on]:text-accent-text',
            )}
          >
            <span dir="auto" className="min-w-0 truncate">
              {t === OTHER ? 'Something else' : t}
            </span>
            <Check aria-hidden className="size-5 shrink-0 opacity-0 group-data-[state=on]:opacity-100" />
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      {other && (
        <TextField
          label="What would you like to be called?"
          value={value}
          maxLength={30}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
          }}
          error={error}
        />
      )}
      {!other && error !== undefined && (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
