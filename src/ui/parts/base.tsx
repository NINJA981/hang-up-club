import { LoaderCircle } from 'lucide-react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive';

const BASE =
  'relative inline-flex shrink-0 touch-manipulation select-none items-center justify-center gap-3 rounded-md text-ui transition-[background-color,transform,color] duration-100 ease-out active:scale-97 aria-busy:cursor-progress';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'h-16 bg-accent px-6 text-on-accent hover:bg-accent-hover active:bg-accent-hover',
  secondary:
    'h-14 border border-border-strong bg-surface px-5 text-text hover:bg-surface-2 active:bg-surface-2',
  quiet: 'h-14 px-4 text-accent-text hover:bg-accent-soft active:bg-accent-soft',
  destructive:
    'h-14 border border-danger bg-surface px-5 text-danger hover:bg-danger-soft active:bg-danger-soft',
};

export function buttonClass(variant: ButtonVariant, extra?: string): string {
  return cn(BASE, VARIANT[variant], extra);
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cn('size-5 animate-spin', className)} />;
}

/** A keyboard hint, shown only where there is a keyboard (pointer: fine). */
export function Keycap({
  children,
  className,
  tone = 'notebook',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'notebook' | 'line';
}) {
  return (
    <kbd
      aria-hidden
      className={cn(
        'hidden h-7 min-w-7 items-center justify-center rounded-xs px-2 font-mono text-keycap pointer-fine:inline-flex',
        tone === 'line' ? 'bg-call-surface text-call-muted' : 'bg-surface-2 text-text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Keeps the label, prepends a spinner and locks the width (DESIGN.md Buttons: Loading). */
  loading?: boolean;
  keycap?: string;
}

export function Button({
  variant = 'secondary',
  loading = false,
  keycap,
  className,
  children,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, className)}
      aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
      {keycap !== undefined && <Keycap className="absolute right-3">{keycap}</Keycap>}
    </button>
  );
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
}

export function ButtonLink({ variant = 'secondary', className, ...rest }: ButtonLinkProps) {
  // eslint-disable-next-line jsx-a11y/anchor-has-content -- content comes through props
  return <a className={buttonClass(variant, className)} {...rest} />;
}

/** Cards: `surface` on `bg`, 1px hairline ring, `lg` radius, flat at rest. */
export function Card({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn('rounded-lg bg-surface p-5 shadow-e1', className)} {...rest}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('huc-skeleton rounded-md bg-surface-2', className)} />;
}

/** The handset-cord motif, one 1.75px monoline coil (DESIGN.md Shapes: Motif). */
export function CordMotif({ className }: { className?: string }) {
  const turns = 5;
  const k = 11;
  const r = 15;
  const pts: string[] = [];
  for (let i = 0; i <= turns * 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    const x = 6 + (i / 24) * k - r * 0.55 * Math.sin(t);
    const y = 24 + r * 0.7 * Math.cos(t);
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 72 48"
      className={cn('h-12 w-18 text-text-subtle', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={pts.join('')} />
    </svg>
  );
}
