import * as Checkbox from '@radix-ui/react-checkbox';
import { ArrowLeft, Check, Copy, Mic, Pencil, Play, RotateCcw, Share2, Square } from 'lucide-react';
import { m as motion, useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { appBaseUrl, navigate } from '../../app/router';
import { playCheer } from '../../audio/cheer';
import { recordCheer, type ActiveRecording } from '../../audio/recorder';
import { MAX_JOIN_URL, type JoinLinkV1 } from '../../domain/links/payloads';
import { makeLink } from '../../domain/links/links';
import { SCAM_GROUPS, type Group } from '../../domain/scenario/schema';
import { blobToBase64 } from '../../state/base64';
import { Page } from '../Shell';
import { Button, Card, cn } from '../parts/base';
import { TextField } from '../parts/controls';
import { AddressPicker } from '../parts/people';
import { QrCode } from '../parts/Qr';
import { copyText, shareOrCopy } from '../share';

export const GROUP_LABELS: Record<Exclude<Group, 'real'>, string> = {
  bank: 'Bank calls',
  government: 'Government and tax calls',
  family: 'A relative in trouble',
  tech: 'Computer help calls',
  delivery: 'Package delivery calls',
  utility: 'Utility bill calls',
  prize: 'Prize and lottery calls',
  romance: 'Online friend calls',
};

type Step = 1 | 2 | 3 | 4 | 'done';

interface Cheer {
  blob: Blob;
  mime: string;
}

const MAX_COACH_NAME = 30;

/** Copy to the clipboard with an inline check morph on the button (no toast). */
function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      onClick={() => {
        void copyText(text).then((r) => {
          if (r === 'copied') {
            setCopied(true);
            window.setTimeout(() => {
              setCopied(false);
            }, 2500);
          }
        });
      }}
    >
      {copied ? <Check aria-hidden className="size-6" /> : <Copy aria-hidden className="size-6" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

function RecordStep({
  term,
  cheer,
  text,
  onText,
  onCheer,
}: {
  term: string;
  cheer: Cheer | undefined;
  text: string;
  onText: (v: string) => void;
  onCheer: (c: Cheer | undefined) => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<'idle' | 'recording' | 'denied' | 'unsupported'>('idle');
  const active = useRef<ActiveRecording | undefined>(undefined);
  const [playback, setPlayback] = useState<'idle' | 'failed'>('idle');

  const start = async (): Promise<void> => {
    if (typeof MediaRecorder === 'undefined' || typeof navigator.mediaDevices === 'undefined') {
      setPhase('unsupported');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase('denied');
      return;
    }
    try {
      const rec = recordCheer({ stream, isTypeSupported: (m) => MediaRecorder.isTypeSupported(m) });
      active.current = rec;
      setPhase('recording');
      const result = await rec.done;
      onCheer({ blob: result.blob, mime: result.mime });
      setPhase('idle');
    } catch {
      for (const t of stream.getTracks()) t.stop();
      setPhase('unsupported');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-h1 text-text">Record a cheer</h2>
      <p className="max-w-prose text-body text-text-muted">
        A few words in your own voice, up to 2.5 seconds. {term || 'They'} will hear it after a good call. You
        can skip this and send one later.
      </p>

      {phase === 'recording' ? (
        <Card className="flex flex-col items-center gap-5 p-6" role="status">
          <div className="relative flex size-44 items-center justify-center">
            <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="60" cy="60" r="54" fill="none" stroke="var(--surface-2)" strokeWidth="8" />
              <motion.circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="8"
                strokeLinecap="round"
                initial={{ pathLength: reduced ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: reduced ? 0 : 2.5, ease: 'linear' }}
              />
            </svg>
            <span className="flex items-center gap-2 text-ui text-text">
              <span aria-hidden className="size-3 rounded-full bg-text" />
              Recording
            </span>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              active.current?.stop();
            }}
          >
            <Square aria-hidden className="size-5" />
            Stop
          </Button>
        </Card>
      ) : cheer ? (
        <Card className="flex flex-col gap-4 p-5">
          <p className="flex items-center gap-2 text-ui text-text">
            <Check aria-hidden className="size-6 text-accent-text" />
            Cheer recorded
          </p>
          <div className="sm:flex-row flex flex-col gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                void playCheer(cheer.blob).then((p) => {
                  setPlayback(p.ok ? 'idle' : 'failed');
                });
              }}
            >
              <Play aria-hidden className="size-5" />
              Listen
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                onCheer(undefined);
              }}
            >
              <RotateCcw aria-hidden className="size-5" />
              Record again
            </Button>
          </div>
          {playback === 'failed' && (
            <p className="text-meta text-text-muted">
              This browser can&rsquo;t play it back, but it will still be sent.
            </p>
          )}
        </Card>
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            void start();
          }}
        >
          <Mic aria-hidden className="size-6" />
          Record a cheer
        </Button>
      )}

      {phase === 'denied' && (
        <p role="alert" className="text-body text-text-muted">
          Your browser blocked the microphone. You can still send setup without a cheer, or allow the
          microphone in your browser settings.
        </p>
      )}
      {phase === 'unsupported' && (
        <p role="alert" className="text-body text-text-muted">
          This browser can&rsquo;t record here. You can still send setup without a cheer.
        </p>
      )}

      <TextField
        label="Words to show with the cheer"
        value={text}
        maxLength={80}
        onChange={(e) => {
          onText(e.target.value);
        }}
        help="Shown on screen, and used instead if the other phone can’t play your voice."
      />
    </div>
  );
}

function CategoryStep({ cats, onChange }: { cats: Group[]; onChange: (c: Group[]) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-h1 text-text">Which calls should they practise?</h2>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Scam calls to practise</legend>
        {SCAM_GROUPS.map((g) => {
          const on = cats.includes(g);
          return (
            <label
              key={g}
              className="flex min-h-14 cursor-pointer items-center gap-4 rounded-md border border-border-strong bg-surface px-4 py-2 text-ui text-text has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-ring"
            >
              <Checkbox.Root
                checked={on}
                onCheckedChange={(v) => {
                  onChange(v === true ? [...cats, g] : cats.filter((c) => c !== g));
                }}
                className="flex size-7 shrink-0 items-center justify-center rounded-xs border-2 border-border-strong bg-surface outline-none data-[state=checked]:border-accent data-[state=checked]:bg-accent"
              >
                <Checkbox.Indicator>
                  <Check aria-hidden className="size-5 text-on-accent" strokeWidth={3} />
                </Checkbox.Indicator>
              </Checkbox.Root>
              {GROUP_LABELS[g]}
            </label>
          );
        })}
      </fieldset>
      <p className="text-body text-text-muted">
        Real calls: about 4 in 10. They are always on, so hanging up on everything doesn&rsquo;t win.
      </p>
    </div>
  );
}

/** What the player will see, kept next to the form on wide screens. */
function Preview({
  coach,
  term,
  cheer,
  cats,
}: {
  coach: string;
  term: string;
  cheer: boolean;
  cats: number;
}) {
  return (
    <aside aria-label="What they will see" className="flex flex-col gap-4 lg:sticky lg:top-24">
      <p className="text-meta text-text-muted">What they will see</p>
      <Card className="flex flex-col gap-3 p-6">
        <p className="text-headline text-text" dir="auto">
          {coach.trim() || 'Your name'} set this up for you{term ? `, ${term}` : ''}.
        </p>
        <p className="text-body text-text-muted">
          {cats} kinds of scam call to practise, and real calls mixed in.
          {cheer ? ' A cheer in your voice after a good call.' : ''}
        </p>
        <p className="text-meta text-text-muted">One practice call a day, about a minute.</p>
      </Card>
    </aside>
  );
}

export function CoachScreen() {
  const { state } = useApp();
  const terms = state.content?.library.addressTerms ?? [];
  const [step, setStep] = useState<Step>(1);
  const [term, setTerm] = useState('');
  const [player, setPlayer] = useState('');
  const [coach, setCoach] = useState('');
  const [cats, setCats] = useState<Group[]>([...SCAM_GROUPS]);
  const [cheer, setCheer] = useState<Cheer | undefined>();
  const [cheerText, setCheerText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<{ join: string; cheer?: string } | undefined>();
  const coachRef = useRef<HTMLInputElement>(null);

  const text = cheerText || (term ? `Nice one, ${term}!` : '');

  const next = (): void => {
    setError(undefined);
    if (step === 1) {
      if (term.trim() === '') {
        setError('Pick what they are called, or type it under “Something else”.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (coach.trim() === '') {
        setError('Add your name, so they know who set this up.');
        coachRef.current?.focus();
        return;
      }
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      if (cats.length === 0) {
        setError('Keep at least one kind of call switched on.');
        return;
      }
      void make();
    }
  };

  const make = async (): Promise<void> => {
    setBusy(true);
    try {
      const join: JoinLinkV1 = {
        v: 1,
        t: 'join',
        coach: coach.trim(),
        address: term.trim(),
        cats: cats.filter((c): c is Exclude<Group, 'real'> => c !== 'real'),
      };
      if (player.trim() !== '') join.player = player.trim();
      const joinUrl = await makeLink(appBaseUrl(), 'join', join);
      if (joinUrl.length > MAX_JOIN_URL) throw new Error('long');
      let cheerUrl: string | undefined;
      if (cheer) {
        try {
          cheerUrl = await makeLink(appBaseUrl(), 'cheer', {
            v: 1,
            t: 'cheer',
            from: coach.trim(),
            mime: cheer.mime,
            b64: await blobToBase64(cheer.blob),
            ...(text.trim() !== '' ? { text: text.trim() } : {}),
          });
        } catch {
          setCheer(undefined);
          setStep(3);
          setError('That recording is too long to send. Record it again, a little shorter.');
          return;
        }
      }
      setLinks(cheerUrl ? { join: joinUrl, cheer: cheerUrl } : { join: joinUrl });
      setStep('done');
    } catch {
      setError('The setup link came out too long. Try a shorter name.');
    } finally {
      setBusy(false);
    }
  };

  const back = (): void => {
    setError(undefined);
    if (typeof step === 'number' && step > 1) setStep((step - 1) as Step);
    else navigate('/welcome');
  };

  if (step === 'done' && links) {
    return (
      <Page withTabBar={false} wide className="lg:grid lg:grid-cols-[35rem_22.5rem] lg:gap-16">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3 pt-2">
            <h1 className="text-h1 text-text">Setup link ready</h1>
            <p className="max-w-prose text-body text-text-muted">
              Send it to {term}, or let them scan the code. It opens the app already set up with your name.
            </p>
          </div>
          <QrCode value={links.join} label={`QR code that opens Hang Up Club set up by ${coach}`} />
          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              onClick={() => {
                void shareOrCopy({
                  title: 'Hang Up Club',
                  text: `${coach.trim()} set up Hang Up Club for you.`,
                  url: links.join,
                });
              }}
            >
              <Share2 aria-hidden className="size-6" />
              Share link
            </Button>
            <CopyButton text={links.join} />
          </div>
          {links.cheer && (
            <section
              className="flex flex-col gap-3 border-t border-border pt-8"
              aria-labelledby="cheer-share"
            >
              <h2 id="cheer-share" className="text-title text-text">
                Send the cheer
              </h2>
              <p className="text-body text-text-muted">
                This is a second link, so the voice message stays separate.
              </p>
              <div className="flex flex-col gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    void shareOrCopy({
                      title: 'Hang Up Club',
                      text: `${coach.trim()} sent you a cheer.`,
                      url: links.cheer ?? '',
                    });
                  }}
                >
                  <Share2 aria-hidden className="size-6" />
                  Share the cheer
                </Button>
                <CopyButton text={links.cheer} label="Copy the cheer link" />
              </div>
            </section>
          )}
          <div className="flex flex-col gap-2 border-t border-border pt-6">
            <Button
              variant="quiet"
              className="justify-start"
              onClick={() => {
                navigate('/coach/call');
              }}
            >
              <Pencil aria-hidden className="size-6" />
              Write a practice call for the family
            </Button>
            <Button
              variant="quiet"
              className="justify-start"
              onClick={() => {
                setStep(1);
                setLinks(undefined);
              }}
            >
              Start over
            </Button>
          </div>
        </div>
        <Preview coach={coach} term={term} cheer={links.cheer !== undefined} cats={cats.length} />
      </Page>
    );
  }

  const n = typeof step === 'number' ? step : 4;
  return (
    <Page
      withTabBar={false}
      wide
      className={cn(
        'min-h-dvh justify-between lg:grid lg:min-h-0 lg:grid-cols-[35rem_22.5rem] lg:justify-start lg:gap-16',
      )}
    >
      <div className="flex flex-col gap-8 lg:max-w-140">
        <div className="flex flex-col gap-2 pt-2">
          <Button variant="quiet" className="-ml-4 self-start" onClick={back}>
            <ArrowLeft aria-hidden className="size-6" />
            Back
          </Button>
          <p className="text-meta text-text-muted" aria-live="polite">
            Step {n} of 4
          </p>
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-6">
            <h1 className="text-h1 text-text">What do they call you?</h1>
            <p className="max-w-prose text-body text-text-muted">
              Choose the name your family uses for the person you are setting this up for. Callers will use it
              too.
            </p>
            <AddressPicker terms={terms} value={term} onChange={setTerm} error={error} />
            <TextField
              label="Their first name (optional)"
              value={player}
              maxLength={MAX_COACH_NAME}
              onChange={(e) => {
                setPlayer(e.target.value);
              }}
              help="Shown on the result cards they send you."
            />
          </div>
        )}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <h1 className="text-h1 text-text">What should we call you?</h1>
            <TextField
              ref={coachRef}
              label="Your name"
              value={coach}
              maxLength={MAX_COACH_NAME}
              autoComplete="given-name"
              onChange={(e) => {
                setCoach(e.target.value);
                setError(undefined);
              }}
              error={error}
              help="They will see your name in the greeting."
            />
          </div>
        )}
        {step === 3 && (
          <>
            <RecordStep term={term} cheer={cheer} text={text} onText={setCheerText} onCheer={setCheer} />
            {error !== undefined && (
              <p role="alert" className="text-meta text-danger">
                {error}
              </p>
            )}
          </>
        )}
        {step === 4 && (
          <>
            <CategoryStep cats={cats} onChange={setCats} />
            {error !== undefined && (
              <p role="alert" className="text-meta text-danger">
                {error}
              </p>
            )}
          </>
        )}

        <div className="flex flex-col gap-3">
          <Button variant="primary" loading={busy} onClick={next}>
            {step === 4
              ? 'Make the setup link'
              : step === 3
                ? cheer
                  ? 'Next'
                  : 'Next, without a cheer'
                : 'Next'}
          </Button>
          {step === 3 && !cheer && (
            <p className="text-meta text-text-muted">You can send a cheer later from this screen.</p>
          )}
        </div>
      </div>
      <div className="hidden lg:block">
        <Preview coach={coach} term={term} cheer={cheer !== undefined} cats={cats.length} />
      </div>
    </Page>
  );
}
