import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { m as motion } from 'motion/react';
import { useId } from 'react';
import { SPRING } from '../motion';
import { cn } from './base';

/**
 * Segmented control (theme, text size, real or scam). Radix ToggleGroup for
 * the keyboard model; the selected segment is a surface that slides between
 * options with a shared layoutId (the pattern animate-ui's toggle-group uses,
 * restyled to our tokens and spring).
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const group = useId();
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={label}
      // Radix reports '' when the selected item is pressed again; a segmented control never goes empty.
      onValueChange={(v) => {
        if (v) onChange(v as T);
      }}
      className={cn('relative flex h-15 w-full rounded-md bg-surface-2 p-0.5', className)}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <ToggleGroup.Item
            key={o.value}
            value={o.value}
            className={cn(
              'relative isolate min-w-0 flex-1 rounded-sm px-2 text-ui transition-colors duration-100',
              selected ? 'text-text' : 'text-text-muted hover:text-text',
            )}
          >
            {selected && (
              <motion.span
                layoutId={`seg-${group}`}
                transition={SPRING.snappy}
                aria-hidden
                className="absolute inset-0 -z-10 rounded-sm bg-surface shadow-e1"
              />
            )}
            {o.label}
          </ToggleGroup.Item>
        );
      })}
    </ToggleGroup.Root>
  );
}
