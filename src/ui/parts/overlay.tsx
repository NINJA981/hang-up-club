import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useStore } from '../../state/hooks';
import { createStore } from '../../state/store';
import { Button, Keycap, cn } from './base';

/**
 * Bottom sheet on phones, centred 560px dialog from 768px (DESIGN.md Layout).
 * Radix Dialog gives focus trapping, Esc and scroll lock; the enter and exit
 * motion is CSS (app.css) so it follows the 500ms / 300ms sheet tokens.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-slot="sheet-scrim" className="fixed inset-0 z-40 bg-scrim" />
        <Dialog.Content
          data-slot="sheet-content"
          className={cn(
            'huc-safe-bottom fixed inset-x-0 bottom-0 z-40 max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-lg bg-surface p-6 text-text shadow-e4',
            'md:inset-auto md:top-1/2 md:left-1/2 md:w-140 md:max-w-[calc(100vw-4rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <Dialog.Title className="text-title text-text">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="-mt-3 -mr-3 inline-flex size-14 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2"
              >
                <X aria-hidden className="size-6" />
              </button>
            </Dialog.Close>
          </div>
          {description !== undefined ? (
            <Dialog.Description className="mb-4 text-body text-text-muted">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A confirmation that names the consequence and labels both buttons with their action. */
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  keepLabel,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  keepLabel: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={body}>
      <div className="flex flex-col gap-3">
        <Button variant="destructive" loading={busy === true} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          {keepLabel}
          <Keycap>Esc</Keycap>
        </Button>
      </div>
    </Sheet>
  );
}

// ── Toasts: only for action results ("Link copied"), 6 s, 8 s with an action ──

export interface ToastItem {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const toasts = createStore<ToastItem[]>([]);
let nextId = 1;

export function showToast(text: string, action?: ToastItem['action']): void {
  const id = nextId++;
  const item: ToastItem = action ? { id, text, action } : { id, text };
  toasts.set((all) => [...all.slice(-1), item]);
  window.setTimeout(
    () => {
      toasts.set((all) => all.filter((t) => t.id !== id));
    },
    action ? 8000 : 6000,
  );
}

export function ToastHost({ aboveTabBar }: { aboveTabBar: boolean }) {
  const items = useStore(toasts, (all) => all);
  useEffect(
    () => () => {
      toasts.set([]);
    },
    [],
  );
  return (
    <div
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed inset-x-0 z-60 flex flex-col items-center gap-2 px-5',
        aboveTabBar ? 'bottom-24 md:bottom-6' : 'bottom-6',
      )}
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex max-w-md items-center gap-4 rounded-md bg-text px-5 py-4 text-body text-bg shadow-e3"
        >
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="-my-3 h-14 shrink-0 rounded-sm px-3 text-ui underline"
              onClick={() => {
                t.action?.run();
                toasts.set((all) => all.filter((x) => x.id !== t.id));
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
