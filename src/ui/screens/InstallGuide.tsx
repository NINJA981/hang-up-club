import { Phone, Share, SquarePlus } from 'lucide-react';
import { Sheet } from '../parts/overlay';

/** The iOS "Share, then Add to Home Screen" guide. Loaded only when opened. */
export function InstallGuide({ onClose }: { onClose: () => void }) {
  const steps = [
    { Icon: Share, text: 'Tap the Share button at the bottom of Safari.' },
    { Icon: SquarePlus, text: 'Scroll down and tap “Add to Home Screen”.' },
    { Icon: Phone, text: 'Tap “Add”. Hang Up Club is now on your home screen.' },
  ];
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Add to your home screen"
    >
      <ol className="flex flex-col gap-4">
        {steps.map(({ Icon, text }) => (
          <li key={text} className="flex items-center gap-4 text-body">
            <span
              aria-hidden
              className="flex size-14 shrink-0 items-center justify-center rounded-md bg-surface-2"
            >
              <Icon className="size-7" />
            </span>
            {text}
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
