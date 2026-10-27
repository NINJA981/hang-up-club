import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp, useAppSnapshot } from '../../app/AppContext';
import { navigate } from '../../app/router';
import { calendarMonth } from '../../domain/streak/streak';
import { weekdayIndex } from '../../domain/time/dates';
import { streakOf } from '../../state/selectors';
import { Page } from '../Shell';
import { scenarioOf } from '../attemptInfo';
import { Button, CordMotif, Card } from '../parts/base';
import { DayCell, DayLegend, OutcomeTag } from '../parts/domain';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKDAY_FIRST = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

function monthName(y: number, m: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

function dayLabel(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

/** My calls: the month at a glance, then every call, newest first. */
export function CallsScreen() {
  const app = useAppSnapshot();
  const { state } = useApp();
  const streak = streakOf(app);
  const [y0, m0] = app.today.split('-').map(Number) as [number, number];
  const [cursor, setCursor] = useState({ y: y0, m: m0 });
  const earliest = app.attempts.reduce<string>(
    (min, a) => (a.localDate < min ? a.localDate : min),
    app.today,
  );
  const [ey, em] = earliest.split('-').map(Number) as [number, number];
  const atEnd = cursor.y === y0 && cursor.m === m0;
  const atStart = cursor.y < ey || (cursor.y === ey && cursor.m <= em);

  const days = useMemo(
    () => calendarMonth(cursor.y, cursor.m, streak, app.today),
    [cursor, streak, app.today],
  );
  const lead = days[0] ? weekdayIndex(days[0].date) : 0;

  const move = (delta: number): void => {
    setCursor((c) => {
      const total = c.y * 12 + (c.m - 1) + delta;
      return { y: Math.floor(total / 12), m: (total % 12) + 1 };
    });
  };

  const rows = app.attempts.map((a, index) => ({ a, index })).reverse();

  if (app.attempts.length === 0) {
    return (
      <Page>
        <h1 className="pt-2 text-h1 text-text">My calls</h1>
        <Card className="flex flex-col items-start gap-5 p-6">
          <CordMotif />
          <p className="max-w-prose text-body text-text-muted">
            Your calls will show up here after today&rsquo;s call.
          </p>
          <Button
            variant="primary"
            onClick={() => {
              navigate('/today');
            }}
          >
            Take today&rsquo;s call
          </Button>
        </Card>
      </Page>
    );
  }

  return (
    <Page className="gap-8">
      <h1 className="pt-2 text-h1 text-text">My calls</h1>

      <section aria-labelledby="month" className="@container flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Button
            variant="quiet"
            aria-label="Previous month"
            disabled={atStart}
            className="w-14 px-0"
            onClick={() => {
              move(-1);
            }}
          >
            <ChevronLeft aria-hidden className="size-6" />
          </Button>
          <h2 id="month" className="text-title text-text" aria-live="polite">
            {monthName(cursor.y, cursor.m)}
          </h2>
          <Button
            variant="quiet"
            aria-label="Next month"
            disabled={atEnd}
            className="w-14 px-0"
            onClick={() => {
              move(1);
            }}
          >
            <ChevronRight aria-hidden className="size-6" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-center text-meta text-text-muted" aria-hidden>
          {WEEKDAY_FIRST.map((d, i) => (
            <span key={i}>
              <span className="md:hidden">{d}</span>
              <span className="hidden md:inline">{WEEKDAYS[i]}</span>
            </span>
          ))}
        </div>
        <ol aria-label={monthName(cursor.y, cursor.m)} className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: Math.max(0, lead) }, (_, i) => (
            <li key={`b${String(i)}`} aria-hidden />
          ))}
          {days.map((d) => (
            <DayCell key={d.date} day={d} />
          ))}
        </ol>
        <DayLegend />
      </section>

      <section aria-labelledby="list" className="flex flex-col">
        <h2 id="list" className="mb-2 text-title text-text">
          Every call
        </h2>
        <ul>
          {rows.map(({ a, index }) => {
            const sc = state.content ? scenarioOf(a, state.content, app.familyCalls) : undefined;
            return (
              <li key={index} className="border-t border-border first:border-t-0">
                <a
                  href={`#/calls/${String(index)}`}
                  className="flex min-h-18 items-center justify-between gap-4 rounded-md py-3 hover:bg-surface-2"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-meta text-text-muted">
                      {dayLabel(a.localDate)}
                      {!a.scored && ' · Practice'}
                    </span>
                    <span className="truncate text-body text-text" dir="auto">
                      {sc?.caller.display ?? 'A practice call'}
                    </span>
                    <OutcomeTag outcome={a.outcome} className="text-meta" />
                  </span>
                  <ChevronRight aria-hidden className="size-6 shrink-0 text-text-subtle" />
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    </Page>
  );
}
