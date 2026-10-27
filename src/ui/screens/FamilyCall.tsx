import { ArrowLeft, Copy, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { appBaseUrl, navigate } from '../../app/router';
import { newFamilyLinkId } from '../../domain/links/family';
import { makeLink } from '../../domain/links/links';
import { FamilyCallDraftSchema, type FamilyCallDraft } from '../../domain/links/payloads';
import { Page } from '../Shell';
import { Button } from '../parts/base';
import { TextArea, TextField } from '../parts/controls';
import { Segmented } from '../parts/segmented';
import { copyText, shareOrCopy } from '../share';

type Field = 'from' | 'caller' | 'opener' | 'warning' | 'ask' | 'advice';
type Errors = Partial<Record<Field, string>>;

const MESSAGES: Record<Field, string> = {
  from: 'Add your name, so the call is marked as written by you.',
  caller: 'Say who the caller claims to be, like “Sam” or “Officer Grant”.',
  opener: 'Add the first thing they say.',
  warning: 'Add the warning sign, so the replay can point at it.',
  ask: 'Add what they ask for, so the replay can mark it.',
  advice: 'Add one sentence of advice.',
};

function preview(d: { caller: string; opener: string; warning: string; ask: string }): string[] {
  return [d.opener, d.warning, d.ask].filter((l) => l.trim() !== '');
}

/** The guided form: no free-form scripting, just the few lines that make a call useful. */
export function FamilyCallScreen() {
  const [from, setFrom] = useState('');
  const [kind, setKind] = useState<'scam' | 'legit'>('scam');
  const [caller, setCaller] = useState('');
  const [opener, setOpener] = useState('');
  const [warning, setWarning] = useState('');
  const [ask, setAsk] = useState('');
  const [advice, setAdvice] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [url, setUrl] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [focusTick, setFocusTick] = useState(0);

  // After a failed submit, move focus to the first field with an error (once it is marked invalid).
  useEffect(() => {
    if (focusTick > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  const scam = kind === 'scam';

  const submit = async (): Promise<void> => {
    const values: Record<Field, string> = {
      from: from.trim(),
      caller: caller.trim(),
      opener: opener.trim(),
      warning: warning.trim(),
      ask: ask.trim(),
      advice: advice.trim(),
    };
    const found: Errors = {};
    for (const f of ['from', 'caller', 'opener', 'warning', 'ask', 'advice'] as const) {
      if (values[f] === '') found[f] = MESSAGES[f];
    }
    const draft: FamilyCallDraft = {
      kind,
      caller: values.caller,
      opener: values.opener,
      warning: values.warning,
      ask: values.ask,
      advice: values.advice,
    };
    const parsed = FamilyCallDraftSchema.safeParse(draft);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const f = issue.path[0] as Field | undefined;
        if (f && f !== ('from' as Field) && found[f] === undefined) {
          found[f] =
            f === 'advice' ? 'Keep the advice to 140 characters.' : 'Please shorten this to 200 characters.';
        }
      }
    }
    if (values.from.length > 30) found.from = 'Please shorten your name to 30 characters.';
    setErrors(found);
    const first = (['from', 'caller', 'opener', 'warning', 'ask', 'advice'] as const).find(
      (f) => found[f] !== undefined,
    );
    if (first) {
      setFocusTick((n) => n + 1);
      return;
    }
    const id = newFamilyLinkId(draft, crypto.randomUUID());
    try {
      setUrl(
        await makeLink(appBaseUrl(), 'family', { v: 1, t: 'family', from: values.from, id, call: draft }),
      );
    } catch {
      setErrors({ ask: 'That call is too long to send. Shorten the lines a little.' });
    }
  };

  if (url) {
    return (
      <Page withTabBar={false}>
        <div className="flex flex-col gap-3 pt-2">
          <h1 className="text-h1 text-text">Family call ready</h1>
          <p className="max-w-prose text-body text-text-muted">
            It will play once in the next week, marked as written by {from.trim()}.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            onClick={() => {
              void shareOrCopy({
                title: 'Hang Up Club',
                text: `${from.trim()} wrote you a practice call.`,
                url,
              });
            }}
          >
            <Share2 aria-hidden className="size-6" />
            Share link
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void copyText(url).then(() => {
                setCopied(true);
                window.setTimeout(() => {
                  setCopied(false);
                }, 2500);
              });
            }}
          >
            <Copy aria-hidden className="size-6" />
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              setUrl(undefined);
            }}
          >
            Write another
          </Button>
        </div>
      </Page>
    );
  }

  const lines = preview({ caller, opener, warning, ask });
  return (
    <Page withTabBar={false} wide className="lg:grid lg:grid-cols-[35rem_22.5rem] lg:gap-16">
      <div className="flex flex-col gap-8 lg:max-w-140">
        <div className="flex flex-col gap-3 pt-2">
          <Button
            variant="quiet"
            className="-ml-4 self-start"
            onClick={() => {
              navigate('/coach');
            }}
          >
            <ArrowLeft aria-hidden className="size-6" />
            Back
          </Button>
          <h1 className="text-h1 text-text">Write a practice call that sounds like your family</h1>
          <p className="max-w-prose text-body text-text-muted">
            Use real names if you like. The call stays on their phone, and it is read aloud by the
            phone&rsquo;s own voice.
          </p>
        </div>

        <form
          ref={formRef}
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <TextField
            label="Your name"
            value={from}
            maxLength={30}
            autoComplete="given-name"
            onChange={(e) => {
              setFrom(e.target.value);
            }}
            error={errors.from}
          />
          <div className="flex flex-col gap-2">
            <p className="text-ui text-text" id="kind-label">
              Real or scam?
            </p>
            <Segmented
              label="Real or scam?"
              value={kind}
              options={[
                { value: 'scam', label: 'A scam' },
                { value: 'legit', label: 'A real call' },
              ]}
              onChange={setKind}
            />
          </div>
          <TextField
            label="Caller says they are…"
            value={caller}
            maxLength={40}
            onChange={(e) => {
              setCaller(e.target.value);
            }}
            help="A name, like “Sam” or “Officer Grant”."
            error={errors.caller}
          />
          <TextArea
            label="First thing they say"
            value={opener}
            maxLength={200}
            onChange={(e) => {
              setOpener(e.target.value);
            }}
            error={errors.opener}
          />
          <TextArea
            label={scam ? 'The warning sign' : 'The middle of the call'}
            value={warning}
            maxLength={200}
            onChange={(e) => {
              setWarning(e.target.value);
            }}
            help={
              scam ? 'The moment a careful person would hang up.' : 'What they say once they have said hello.'
            }
            error={errors.warning}
          />
          <TextArea
            label={scam ? 'What they ask for' : 'How they say goodbye'}
            value={ask}
            maxLength={200}
            onChange={(e) => {
              setAsk(e.target.value);
            }}
            help={
              scam
                ? 'Money, a code, a card number. The replay marks this line.'
                : 'A real call asks for nothing.'
            }
            error={errors.ask}
          />
          <TextArea
            label="One sentence of advice"
            value={advice}
            maxLength={140}
            onChange={(e) => {
              setAdvice(e.target.value);
            }}
            help="Shown after the call. Up to 140 characters."
            error={errors.advice}
          />
          <Button type="submit" variant="primary">
            Make the family call
          </Button>
        </form>
      </div>

      <aside aria-label="Preview" className="hidden lg:block">
        <div className="sticky top-24 flex flex-col gap-3">
          <p className="text-meta text-text-muted">How it will look</p>
          <div
            data-surface="call"
            className="flex min-h-72 flex-col gap-4 rounded-lg bg-call-bg p-6 text-call-text"
          >
            <p className="text-ui text-call-text" dir="auto">
              {caller.trim() || 'The caller'}
            </p>
            {lines.length === 0 ? (
              <p className="text-body text-call-muted">The lines you write appear here.</p>
            ) : (
              lines.map((l, i) => (
                <p
                  key={i}
                  className={
                    i === lines.length - 1 ? 'text-caption-live text-call-text' : 'text-body text-call-muted'
                  }
                  dir="auto"
                >
                  {l}
                </p>
              ))
            )}
          </div>
        </div>
      </aside>
    </Page>
  );
}
