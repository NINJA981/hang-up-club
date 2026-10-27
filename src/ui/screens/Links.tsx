import { ArrowLeft, Inbox as InboxIcon, Play, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp, useAppSnapshot } from '../../app/AppContext';
import { navigate } from '../../app/router';
import { playCheer } from '../../audio/cheer';
import { formatPercent } from '../../domain/format/format';
import { decodePayload, type DecodeResult, type LinkRoute } from '../../domain/links/links';
import type {
  CheerLinkV1,
  FamilyLinkV1,
  JoinLinkV1,
  PayloadByType,
  ResultCardV1,
} from '../../domain/links/payloads';
import { resultCardSentence, streakLine } from '../../domain/result/copy';
import { base64ToBlob } from '../../state/base64';
import { Page } from '../Shell';
import { Button, Card, CordMotif, Skeleton } from '../parts/base';
import { OutcomeTag } from '../parts/domain';
import { showToast } from '../parts/overlay';
import { LinkErrorScreen } from './LinkError';

type Loaded<T> = { status: 'loading' } | { status: 'bad' } | { status: 'ok'; value: T };

function useDecoded<T extends LinkRoute['type']>(link: LinkRoute & { type: T }): Loaded<PayloadByType[T]> {
  const [res, setRes] = useState<Loaded<PayloadByType[T]>>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    void decodePayload(link.type, link.encoded).then((r: DecodeResult<PayloadByType[T]>) => {
      if (!cancelled) setRes(r.ok ? { status: 'ok', value: r.value } : { status: 'bad' });
    });
    return () => {
      cancelled = true;
    };
  }, [link.type, link.encoded]);
  return res;
}

function Loading({ children }: { children: string }) {
  return (
    <Page withTabBar={false} className="pt-12" aria-busy>
      <p className="sr-only" role="status">
        {children}
      </p>
      <Skeleton className="h-12 w-4/5" />
      <Skeleton className="h-40 w-full" />
    </Page>
  );
}

function JoinLink({ link }: { link: LinkRoute & { type: 'join' } }) {
  const { actions } = useApp();
  const res = useDecoded(link);
  const [busy, setBusy] = useState(false);
  if (res.status === 'loading') return <Loading>Opening the setup…</Loading>;
  if (res.status === 'bad') {
    return (
      <Page withTabBar={false} className="min-h-dvh justify-between pt-12">
        <div className="flex flex-col gap-5">
          <TriangleAlert aria-hidden className="size-10 text-text-muted" />
          <h1 className="text-h1 text-text">This link is damaged</h1>
          <p className="max-w-prose text-lead text-text-muted">Ask the sender to send it again.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            navigate('/welcome', { replace: true });
          }}
        >
          Start without it
        </Button>
      </Page>
    );
  }
  const j: JoinLinkV1 = res.value;
  return (
    <Page withTabBar={false} className="min-h-dvh justify-between pt-12">
      <div className="flex flex-col gap-6">
        <CordMotif />
        <h1 className="text-h1 text-text md:text-result-display" dir="auto">
          {j.coach} set this up for you, {j.address}.
        </h1>
        <p className="max-w-prose text-lead text-text-muted">
          One practice call a day, about a minute. Some calls are real, so you&rsquo;ll learn to tell the
          difference.
        </p>
      </div>
      <Button
        variant="primary"
        loading={busy}
        onClick={() => {
          setBusy(true);
          void actions.applyJoin(j).then(() => {
            navigate('/welcome', { replace: true });
          });
        }}
      >
        Start
      </Button>
    </Page>
  );
}

function CheerLink({ link }: { link: LinkRoute & { type: 'cheer' } }) {
  const { actions } = useApp();
  const app = useAppSnapshot();
  const res = useDecoded(link);
  const [busy, setBusy] = useState(false);
  const [unplayable, setUnplayable] = useState(false);
  if (res.status === 'loading') return <Loading>Opening the cheer…</Loading>;
  if (res.status === 'bad') return <LinkErrorScreen />;
  const c: CheerLinkV1 = res.value;
  return (
    <Page withTabBar={false} className="min-h-dvh justify-between pt-12">
      <div className="flex flex-col gap-6">
        <h1 className="text-h1 text-text" dir="auto">
          {c.from} sent you a cheer
        </h1>
        {c.text !== undefined && (
          <Card className="p-6">
            <p className="text-headline text-text" dir="auto">
              {c.text}
            </p>
          </Card>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            void playCheer(base64ToBlob(c.b64, c.mime)).then((p) => {
              setUnplayable(!p.ok);
            });
          }}
        >
          <Play aria-hidden className="size-6" />
          Listen
        </Button>
        {unplayable && (
          <p className="text-body text-text-muted">
            This phone can&rsquo;t play the voice. You&rsquo;ll see {c.from}&rsquo;s words instead.
          </p>
        )}
      </div>
      <Button
        variant="primary"
        loading={busy}
        onClick={() => {
          setBusy(true);
          void actions.acceptCheer(c).then(() => {
            showToast('Cheer saved');
            navigate(app.profile ? '/today' : '/welcome', { replace: true });
          });
        }}
      >
        Keep this cheer
      </Button>
    </Page>
  );
}

function FamilyLink({ link }: { link: LinkRoute & { type: 'family' } }) {
  const { actions } = useApp();
  const app = useAppSnapshot();
  const res = useDecoded(link);
  const [busy, setBusy] = useState(false);
  if (res.status === 'loading') return <Loading>Opening the call…</Loading>;
  if (res.status === 'bad') return <LinkErrorScreen />;
  const f: FamilyLinkV1 = res.value;
  return (
    <Page withTabBar={false} className="min-h-dvh justify-between pt-12">
      <div className="flex flex-col gap-6">
        <h1 className="text-h1 text-text" dir="auto">
          {f.from} wrote you a practice call
        </h1>
        <Card className="flex flex-col gap-2 p-6">
          <p className="text-meta text-text-muted">Written by {f.from}</p>
          <p className="text-title text-text" dir="auto">
            A call from {f.call.caller}
          </p>
        </Card>
        <p className="max-w-prose text-body text-text-muted">
          It will come up as a call in the next week. It can&rsquo;t reach anyone: the app can&rsquo;t place
          calls or move money.
        </p>
      </div>
      <Button
        variant="primary"
        loading={busy}
        onClick={() => {
          setBusy(true);
          void actions.acceptFamilyCall(f).then(() => {
            showToast('Call added');
            navigate(app.profile ? '/today' : '/welcome', { replace: true });
          });
        }}
      >
        Add to my calls
      </Button>
    </Page>
  );
}

export function ResultCardView({ card }: { card: ResultCardV1 }) {
  const sentence = resultCardSentence({
    name: card.name,
    title: card.title,
    outcome: card.outcome,
    ...(card.tAction !== undefined ? { tAction: card.tAction } : {}),
    ...(card.tAsk !== undefined ? { tAsk: card.tAsk } : {}),
    streak: card.streak,
  });
  const streak = streakLine(card.streak);
  const rate = formatPercent(card.rate30);
  return (
    <Card className="flex flex-col gap-4 p-8">
      <OutcomeTag outcome={card.outcome} />
      <p className="text-headline text-text" dir="auto" data-testid="result-sentence">
        {sentence}
      </p>
      {(streak !== undefined || rate !== undefined) && (
        <p className="text-body text-text-muted">
          {streak}
          {streak !== undefined && rate !== undefined && ' · '}
          {rate !== undefined && `Right on ${rate} of calls this month`}
        </p>
      )}
      <p className="text-meta text-text-muted">{card.date}</p>
    </Card>
  );
}

function ResultLink({ link }: { link: LinkRoute & { type: 'result' } }) {
  const { actions } = useApp();
  const res = useDecoded(link);
  const [busy, setBusy] = useState(false);
  if (res.status === 'loading') return <Loading>Opening the result…</Loading>;
  if (res.status === 'bad') return <LinkErrorScreen result />;
  const card = res.value;
  return (
    <Page withTabBar={false} className="min-h-dvh justify-between pt-12">
      <div className="flex flex-col gap-6">
        <h1 className="text-h1 text-text">A result from {card.name}</h1>
        <ResultCardView card={card} />
      </div>
      <Button
        variant="primary"
        loading={busy}
        onClick={() => {
          setBusy(true);
          void actions.saveResultCard(card).then(() => {
            showToast('Saved to your Coach inbox');
            navigate('/inbox', { replace: true });
          });
        }}
      >
        Save to my Coach inbox
      </Button>
    </Page>
  );
}

export function LinkScreen({ link }: { link: LinkRoute }) {
  switch (link.type) {
    case 'join':
      return <JoinLink link={{ ...link, type: 'join' }} />;
    case 'cheer':
      return <CheerLink link={{ ...link, type: 'cheer' }} />;
    case 'family':
      return <FamilyLink link={{ ...link, type: 'family' }} />;
    case 'result':
      return <ResultLink link={{ ...link, type: 'result' }} />;
  }
}

/** Coach inbox: saved result cards, newest first, with the streak. */
export function InboxScreen() {
  const { actions } = useApp();
  const app = useAppSnapshot();
  const rows = [...app.inbox].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return (
    <Page withTabBar={false}>
      <div className="flex flex-col gap-3 pt-2">
        <Button
          variant="quiet"
          className="-ml-4 self-start"
          onClick={() => {
            navigate(app.profile ? '/settings' : '/coach');
          }}
        >
          <ArrowLeft aria-hidden className="size-6" />
          Back
        </Button>
        <h1 className="text-h1 text-text">Coach inbox</h1>
      </div>
      {rows.length === 0 ? (
        <Card className="flex flex-col items-start gap-4 p-6">
          <InboxIcon aria-hidden className="size-8 text-text-subtle" />
          <p className="max-w-prose text-body text-text-muted">
            When they send a result, open the link on this phone and save it here.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-meta text-text-muted">
                    <span dir="auto">{r.payload.name}</span> · {r.payload.date}
                  </p>
                  <Button
                    variant="quiet"
                    className="-mr-3"
                    onClick={() => {
                      void actions.removeInbox(r.id).then(() => {
                        showToast('Removed', {
                          label: 'Undo',
                          run: () => {
                            void actions.saveResultCard(r.payload);
                          },
                        });
                      });
                    }}
                  >
                    Remove
                  </Button>
                </div>
                <OutcomeTag outcome={r.payload.outcome} />
                <p className="text-body text-text" dir="auto">
                  {resultCardSentence({
                    name: r.payload.name,
                    title: r.payload.title,
                    outcome: r.payload.outcome,
                    ...(r.payload.tAction !== undefined ? { tAction: r.payload.tAction } : {}),
                    ...(r.payload.tAsk !== undefined ? { tAsk: r.payload.tAsk } : {}),
                    streak: r.payload.streak,
                  })}
                </p>
                {streakLine(r.payload.streak) && (
                  <p className="text-meta text-text-muted">{streakLine(r.payload.streak)}</p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
