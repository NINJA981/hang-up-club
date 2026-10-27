import { Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { useApp, useAppSnapshot } from '../../app/AppContext';
import { navigate } from '../../app/router';
import { playRingTest } from '../../audio/soundCheck';
import { Page } from '../Shell';
import { Button, CordMotif } from '../parts/base';
import { AddressPicker } from '../parts/people';

type Step = 'intro' | 'name' | 'sound';

/** First open with no link: what this is, what to call you, and a sound check. */
export function WelcomeScreen() {
  const { state, actions, meta } = useApp();
  const existing = useAppSnapshot().profile;
  // Someone who opened a setup link already has a profile: they only need the sound check.
  const [step, setStep] = useState<Step>(existing ? 'sound' : 'intro');
  const [term, setTerm] = useState(existing?.addressTerm ?? '');
  const [error, setError] = useState<string | undefined>();
  const [heard, setHeard] = useState<'unknown' | 'no'>('unknown');
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const terms = state.content?.library.addressTerms ?? [];

  const finish = async (sound: boolean): Promise<void> => {
    setSaving(true);
    await actions.setupProfile({ addressTerm: term.trim() });
    if (!sound) await actions.updateSettings({ sound: false });
    meta.runner?.reset();
    navigate('/today', { replace: true });
  };

  const play = async (): Promise<void> => {
    setPlaying(true);
    try {
      await playRingTest();
    } finally {
      window.setTimeout(() => {
        setPlaying(false);
      }, 1400);
    }
  };

  return (
    <Page withTabBar={false} className="min-h-dvh justify-between pt-10 md:pt-16">
      {step === 'intro' && (
        <>
          <div className="flex flex-col gap-6">
            <CordMotif />
            <h1 className="text-h1 text-text md:text-result-display">
              Practice saying no to phone scams, one call a day.
            </h1>
            <p className="max-w-prose text-lead text-text-muted">
              Some calls are real, so you&rsquo;ll learn to tell the difference. Every caller is made up, and
              nothing leaves this phone unless you send it.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              onClick={() => {
                setStep('name');
              }}
            >
              Set up for me
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                navigate('/coach');
              }}
            >
              I&rsquo;m setting this up for someone else
            </Button>
          </div>
        </>
      )}

      {step === 'name' && (
        <>
          <div className="flex flex-col gap-6">
            <h1 className="text-h1 text-text">What should callers call you?</h1>
            <p className="max-w-prose text-body text-text-muted">
              Real callers use a name like this. Pick the one your family uses, so the practice calls sound
              right.
            </p>
            <AddressPicker
              terms={terms}
              value={term}
              onChange={(v) => {
                setTerm(v);
                setError(undefined);
              }}
              error={error}
            />
          </div>
          <Button
            variant="primary"
            onClick={() => {
              if (term.trim() === '') {
                setError('Pick a name, or choose “Something else” and type one.');
                return;
              }
              setStep('sound');
            }}
          >
            Continue
          </Button>
        </>
      )}

      {step === 'sound' && (
        <>
          <div className="flex flex-col gap-6">
            <h1 className="text-h1 text-text">Can you hear the ring?</h1>
            <p className="max-w-prose text-body text-text-muted">
              The calls use sound, like a real phone. Press the button and listen for two seconds of ringing.
            </p>
            <Button variant="secondary" loading={playing} onClick={() => void play()}>
              <Volume2 aria-hidden className="size-6" />
              Play the ring
            </Button>
            {heard === 'no' && (
              <div role="status" className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-e1">
                <p className="flex items-center gap-3 text-ui text-text">
                  <VolumeX aria-hidden className="size-6" />
                  No sound
                </p>
                <p className="text-body text-text-muted">
                  Turn the volume up with the buttons on the side of the phone, and check that silent mode is
                  off. Then play the ring again.
                </p>
                <p className="text-body text-text-muted">
                  You can also go on without sound. The calls then show every word as captions.
                </p>
                <Button
                  variant="secondary"
                  loading={saving}
                  onClick={() => {
                    void finish(false);
                  }}
                >
                  Go on with captions only
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              loading={saving}
              onClick={() => {
                void finish(true);
              }}
            >
              Yes, I hear it
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setHeard('no');
              }}
            >
              No sound
            </Button>
          </div>
        </>
      )}
    </Page>
  );
}
