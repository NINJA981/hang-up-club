import { CircleAlert } from 'lucide-react';
import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cn } from './base';

/** A labelled on/off row. The whole row is the target (56px or taller). */
export function Switch({
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div id={`${id}-l`} className="text-ui text-text">
          {label}
        </div>
        {help !== undefined && (
          <div id={`${id}-h`} className="text-meta text-text-muted">
            {help}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={help !== undefined ? `${id}-h` : undefined}
        disabled={disabled}
        onClick={() => {
          onChange(!checked);
        }}
        className="group relative -my-2 flex h-14 w-20 shrink-0 touch-manipulation items-center justify-center disabled:opacity-60"
      >
        <span
          aria-hidden
          className={cn(
            'flex h-9 w-16 items-center rounded-sm border p-1 transition-colors duration-100',
            checked ? 'border-accent bg-accent' : 'border-border-strong bg-surface-2',
          )}
        >
          <span
            className={cn(
              'size-6 rounded-xs transition-transform duration-150 ease-out',
              checked ? 'translate-x-7 bg-on-accent' : 'translate-x-0 bg-text-muted',
            )}
          />
        </span>
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  label: string;
  help?: string;
  error?: string | undefined;
  /** Shown inside the field's wrapper after the input (a unit or action). */
  suffix?: ReactNode;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/** 60px field, `body` 20px (never smaller, so iOS does not magnify the page), inline error with an icon. */
export function TextField({ label, help, error, suffix, className, ...rest }: FieldProps) {
  const id = useId();
  const described = [help !== undefined ? `${id}-h` : '', error !== undefined ? `${id}-e` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-ui text-text">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          dir="auto"
          aria-invalid={error !== undefined || undefined}
          aria-describedby={described || undefined}
          className={cn(
            'h-15 min-w-0 flex-1 rounded-md border bg-surface px-4 text-body text-text placeholder:text-text-subtle focus:border-accent focus:shadow-[0_0_0_4px_color-mix(in_oklch,var(--accent)_25%,transparent)] focus:outline-none',
            error !== undefined ? 'border-danger' : 'border-border-strong',
          )}
          {...rest}
        />
        {suffix}
      </div>
      {help !== undefined && (
        <p id={`${id}-h`} className="text-meta text-text-muted">
          {help}
        </p>
      )}
      {error !== undefined && (
        <p id={`${id}-e`} role="alert" className="flex items-start gap-2 text-meta text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/** A multi-line field with the same grammar (family call builder). */
export function TextArea({
  label,
  help,
  error,
  className,
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'> & {
  ref?: Ref<HTMLTextAreaElement>;
  label: string;
  help?: string;
  error?: string | undefined;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-ui text-text">
        {label}
      </label>
      <textarea
        id={id}
        dir="auto"
        rows={3}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={error !== undefined ? `${id}-e` : help !== undefined ? `${id}-h` : undefined}
        className={cn(
          'min-h-24 resize-y rounded-md border bg-surface px-4 py-3 text-body text-text placeholder:text-text-subtle focus:border-accent focus:shadow-[0_0_0_4px_color-mix(in_oklch,var(--accent)_25%,transparent)] focus:outline-none',
          error !== undefined ? 'border-danger' : 'border-border-strong',
        )}
        {...rest}
      />
      {help !== undefined && (
        <p id={`${id}-h`} className="text-meta text-text-muted">
          {help}
        </p>
      )}
      {error !== undefined && (
        <p id={`${id}-e`} role="alert" className="flex items-start gap-2 text-meta text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
