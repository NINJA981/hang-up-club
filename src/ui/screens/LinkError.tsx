import { TriangleAlert } from 'lucide-react';
import { navigate } from '../../app/router';
import { Page } from '../Shell';
import { Button } from '../parts/base';

/** A damaged or too-old link: a friendly screen, never a crash (AC-F8-7). */
export function LinkErrorScreen({ result = false }: { result?: boolean }) {
  return (
    <Page withTabBar={false} className="min-h-dvh justify-between pt-12">
      <div className="flex flex-col gap-5">
        <TriangleAlert aria-hidden className="size-10 text-text-muted" />
        <h1 className="text-h1 text-text">
          {result ? 'This result link is damaged' : 'This link is damaged or too old'}
        </h1>
        <p className="max-w-prose text-lead text-text-muted">Ask the sender to share it again.</p>
      </div>
      <Button
        variant="primary"
        onClick={() => {
          navigate('/today', { replace: true });
        }}
      >
        Open Hang Up Club
      </Button>
    </Page>
  );
}
