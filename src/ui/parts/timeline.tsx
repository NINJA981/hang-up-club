import { Check, Clock, Flag, Info } from 'lucide-react';
import { m as motion } from 'motion/react';
import { formatClock } from '../../domain/format/format';
import { TACTIC_LABELS, type Tactic } from '../../domain/scenario/schema';
import type { Outcome } from '../../domain/scoring/score';
import { EASE_OUT, SPRING } from '../motion';
import { cn } from './base';
import { TACTIC_ICONS } from './domain';

// ── Timeline (signature data component) ─────────────────────────────────────

export interface TimelineProps {
  outcome: Outcome;
  action: 'hangup' | 'callback' | 'none';
  tActionMs: number | undefined;
  tAskMs: number | undefined;
  tEndMs: number;
  /** Cue times of flag lines, with the tactic stamped there. */
  flags: { ms: number; tactic: Tactic | undefined }[];
  askQuote: string | undefined;
  /** Which parts have been drawn (The Cut reveals them in order). */
  reveal: { track: boolean; ask: boolean; you: boolean };
  instant: boolean;
}

function niceDomain(ms: number): number {
  const s = Math.ceil(ms / 1000);
  const step = s > 80 ? 30 : s > 40 ? 20 : 10;
  return Math.max(30, Math.ceil(s / step) * step) * 1000;
}

function tickStep(domainMs: number): number {
  return domainMs > 80_000 ? 30_000 : domainMs > 40_000 ? 20_000 : 10_000;
}

export function youLabel(action: TimelineProps['action'], t: number | undefined): string {
  if (action === 'none' || t === undefined) return 'You stayed on';
  return `${action === 'callback' ? 'You called back' : 'You hung up'} · ${formatClock(t)}`;
}

/**
 * Seconds on a bar. The moss segment is the time you stayed on; the hatch is
 * the time you did not give them, between your action and their ask.
 */
export function Timeline(p: TimelineProps) {
  const { reveal, instant } = p;
  const youMs = p.action === 'none' ? p.tEndMs : (p.tActionMs ?? 0);
  const domain = niceDomain(Math.max(p.tAskMs ?? 0, youMs) * 1.08);
  const pct = (ms: number): number => Math.min(100, Math.max(0, (ms / domain) * 100));
  const youPct = pct(youMs);
  const askPct = p.tAskMs !== undefined ? pct(p.tAskMs) : undefined;
  const ok =
    p.outcome !== 'missed' && p.outcome !== 'caught' && p.outcome !== 'late' && p.outcome !== 'cautious';
  const MarkerIcon =
    p.outcome === 'missed' || p.outcome === 'cautious'
      ? Info
      : p.outcome === 'caught'
        ? Flag
        : p.outcome === 'late'
          ? Clock
          : Check;
  const ticks: number[] = [];
  for (let t = 0; t <= domain; t += tickStep(domain)) ticks.push(t);
  const dur = instant ? 0 : 0.6;
  const showHatch = askPct !== undefined && p.action !== 'none' && youPct < askPct;
  const label = youLabel(p.action, p.tActionMs);
  const labelRight = youPct > 58;

  return (
    <figure className="@container w-full" aria-label="Timeline of the call">
      <div className="relative h-36">
        {/* You marker, dropping onto its stem */}
        <motion.div
          className="absolute top-0 z-10 flex h-14 w-0 flex-col items-center"
          style={{ left: `${String(youPct)}%` }}
          initial={false}
          animate={{ opacity: reveal.you ? 1 : 0, y: reveal.you ? 0 : -12 }}
          transition={instant ? { duration: 0 } : SPRING.playful}
        >
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full border-2',
              ok
                ? 'border-accent bg-accent text-on-accent'
                : p.outcome === 'late'
                  ? 'border-warning bg-warning-soft text-warning'
                  : 'border-border-strong bg-surface text-text',
            )}
          >
            <MarkerIcon aria-hidden className="size-4" strokeWidth={3} />
          </span>
          <span className={cn('w-1 flex-1', ok ? 'bg-accent' : 'bg-border-strong')} />
        </motion.div>
        <motion.p
          className={cn(
            'absolute top-0 z-10 flex h-7 items-center font-mono text-mono-number whitespace-nowrap text-text',
            labelRight ? 'right-0 pr-0' : '',
          )}
          style={
            labelRight
              ? { right: `calc(${String(100 - youPct)}% + 24px)` }
              : { left: `calc(${String(youPct)}% + 24px)` }
          }
          initial={false}
          animate={{ opacity: reveal.you ? 1 : 0 }}
          transition={{ duration: instant ? 0 : 0.15 }}
        >
          <span className="font-sans text-meta text-text">{label}</span>
        </motion.p>

        {/* Track */}
        <motion.div
          className="absolute inset-x-0 top-14 h-3 origin-left rounded-xs bg-surface-2"
          initial={false}
          animate={{ scaleX: reveal.track ? 1 : 0 }}
          transition={{ duration: dur, ease: EASE_OUT }}
        />
        {/* Moss segment and hatch */}
        <motion.div
          className="absolute top-14 left-0 h-3 origin-left rounded-xs bg-accent"
          style={{ width: `${String(youPct)}%` }}
          initial={false}
          animate={{ scaleX: reveal.you ? 1 : 0 }}
          transition={{ duration: instant ? 0 : 0.2, ease: EASE_OUT }}
        />
        {showHatch && (
          <motion.div
            className="huc-hatch absolute top-14 h-3 origin-left"
            style={{ left: `${String(youPct)}%`, width: `${String(askPct - youPct)}%` }}
            initial={false}
            animate={{ scaleX: reveal.you ? 1 : 0 }}
            transition={{ duration: instant ? 0 : 0.2, ease: EASE_OUT, delay: instant ? 0 : 0.1 }}
          />
        )}
        {/* Flag ticks with their tactic icons */}
        {p.flags.map((f, i) => {
          const Icon = f.tactic ? TACTIC_ICONS[f.tactic] : Flag;
          return (
            <motion.div
              key={`${String(f.ms)}-${String(i)}`}
              className="absolute top-17 flex w-0 flex-col items-center"
              style={{ left: `${String(pct(f.ms))}%` }}
              initial={false}
              animate={{ opacity: reveal.track ? 1 : 0 }}
              transition={{ duration: 0.15, delay: instant ? 0 : (pct(f.ms) / 100) * 0.6 }}
            >
              <span className="h-4 w-0.5 bg-border-strong" />
              <Icon aria-hidden className="mt-1 size-5 text-text-muted" />
            </motion.div>
          );
        })}
        {/* ASK marker */}
        {askPct !== undefined && (
          <motion.div
            className="absolute top-12 h-10 w-1 origin-bottom bg-danger"
            style={{ left: `calc(${String(askPct)}% - 2px)` }}
            initial={false}
            animate={{ scaleY: reveal.ask ? 1 : 0 }}
            transition={{ duration: instant ? 0 : 0.2, ease: EASE_OUT }}
          />
        )}
        {/* Scale in seconds, mono */}
        <div className="absolute inset-x-0 bottom-0 h-7 font-mono text-meta text-text-muted">
          {ticks.map((t, i) => (
            <span
              key={t}
              className={cn(
                'tabular absolute top-0',
                i % 2 === 1 && '@max-sm:hidden',
                t === 0 ? 'left-0' : '-translate-x-1/2',
                pct(t) > 94 && t !== 0 && '-translate-x-full',
              )}
              style={t === 0 ? undefined : { left: `${String(pct(t))}%` }}
            >
              {formatClock(t)}
            </span>
          ))}
        </div>
      </div>

      {askPct !== undefined && p.tAskMs !== undefined && (
        <motion.figcaption
          className={cn('mt-3 flex flex-col gap-1', askPct > 55 ? 'items-end text-right' : 'items-start')}
          initial={false}
          animate={{ opacity: reveal.ask ? 1 : 0 }}
          transition={{ duration: instant ? 0 : 0.15, delay: instant ? 0 : 0.1 }}
        >
          <span className="inline-flex items-center gap-2 text-ui text-danger">
            <Flag aria-hidden className="size-5" />
            Their ask · <span className="tabular font-mono text-mono-number">{formatClock(p.tAskMs)}</span>
          </span>
          {p.askQuote !== undefined && (
            <q className="max-w-prose text-body text-text-muted [quotes:'\201C''\201D']">{p.askQuote}</q>
          )}
        </motion.figcaption>
      )}

      <ol className="sr-only">
        {p.flags.map((f, i) => (
          <li key={i}>
            {formatClock(f.ms)}: {f.tactic ? TACTIC_LABELS[f.tactic] : 'a warning sign'}
          </li>
        ))}
        <li>
          {p.action === 'none' ? 'You stayed on' : formatClock(p.tActionMs ?? 0)}: {label}
        </li>
        {p.tAskMs !== undefined && <li>{formatClock(p.tAskMs)}: their ask</li>}
      </ol>
    </figure>
  );
}
