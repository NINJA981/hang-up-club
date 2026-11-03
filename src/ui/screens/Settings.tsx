import { CalendarPlus, Download, Inbox, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useApp, useAppSnapshot } from '../../app/AppContext';
import { appBaseUrl, navigate } from '../../app/router';
import { chooseAudioFormat } from '../../audio/formats';
import { clipUrl } from '../../domain/audio/manifest';
import { ICS_FILENAME, ICS_MIME, buildReminderIcs, isReminderTime } from '../../domain/reminders/ics';
import { Page } from '../Shell';
import { Button, Card } from '../parts/base';
import { Switch, TextField } from '../parts/controls';
import { Segmented } from '../parts/segmented';
import { ConfirmSheet, showToast } from '../parts/overlay';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="text-title text-text">{title}</h2>
      <Card className="flex flex-col divide-y divide-border px-5 py-2">{children}</Card>
    </section>
  );
}

function WarmAudio() {
  const { state } = useApp();
  const [progress, setProgress] = useState<{ done: number; total: number } | undefined>();
  const [problem, setProblem] = useState<string | undefined>();

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const d: unknown = e.data;
      if (typeof d === 'object' && d !== null && (d as { type?: unknown }).type === 'WARM_PROGRESS') {
        const { done, total } = d as { done: number; total: number };
        setProgress({ done, total });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);

  const start = async (): Promise<void> => {
    const content = state.content;
    if (!content) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const worker = reg?.active;
    if (!worker) {
      setProblem('Offline downloads need the installed app. Open it from your home screen and try again.');
      return;
    }
    setProblem(undefined);
    const format = chooseAudioFormat(document.createElement('audio'));
    // Every clip the manifest holds, in the format this phone plays.
    const urls = Object.values(content.manifest.clips).map((c) => clipUrl(c, format));
    setProgress({ done: 0, total: urls.length });
    worker.postMessage({ type: 'WARM_AUDIO', urls });
  };

  const done = progress !== undefined && progress.done >= progress.total && progress.total > 0;
  return (
    <div className="flex flex-col gap-3 py-4">
      <div>
        <p className="text-ui text-text">Download every call</p>
        <p className="text-meta text-text-muted">So all of them work with no signal. About 4 MB.</p>
      </div>
      <Button variant="secondary" onClick={() => void start()} disabled={!('serviceWorker' in navigator)}>
        <Download aria-hidden className="size-6" />
        {done ? 'Downloaded' : 'Download for offline'}
      </Button>
      {progress && !done && (
        <p className="tabular text-meta text-text-muted" role="status">
          {progress.done} of {progress.total}
        </p>
      )}
      {problem !== undefined && (
        <p role="alert" className="text-meta text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}

export function SettingsScreen() {
  const { actions } = useApp();
  const app = useAppSnapshot();
  const { settings, profile } = app;
  const [reminderError, setReminderError] = useState<string | undefined>();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canVibrate = typeof navigator.vibrate === 'function';
  const reminder = settings.reminderTime ?? '09:00';

  const addReminder = (): void => {
    if (!isReminderTime(reminder)) {
      setReminderError('Choose a time first, like 9:00.');
      return;
    }
    try {
      const ics = buildReminderIcs({
        time: reminder,
        startDate: app.today,
        appUrl: appBaseUrl(),
        uid: `${profile?.id ?? 'hang-up-club'}@hang-up-club`,
        now: new Date(),
      });
      const url = URL.createObjectURL(new Blob([ics], { type: ICS_MIME }));
      const a = document.createElement('a');
      a.href = url;
      a.download = ICS_FILENAME;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 4000);
      setReminderError(undefined);
      void actions.updateSettings({ reminderTime: reminder });
      showToast('Reminder file saved. Open it to add it to your calendar.');
    } catch {
      setReminderError(
        'Your browser didn’t save the reminder. Try again, or add a daily 9:00 alarm yourself.',
      );
    }
  };

  const deleteAll = async (): Promise<void> => {
    setDeleting(true);
    await actions.deleteEverything();
    setConfirm(false);
    setDeleting(false);
    navigate('/welcome', { replace: true });
  };

  return (
    <Page className="gap-8">
      <h1 className="pt-2 text-h1 text-text">Settings</h1>

      <Group title="Calls">
        <Switch
          label="Captions"
          help="Show the words on screen while the caller speaks."
          checked={settings.captions}
          onChange={(v) => void actions.updateSettings({ captions: v })}
        />
        <Switch
          label="Sound"
          help="Off makes a captions-only call."
          checked={settings.sound}
          onChange={(v) => void actions.updateSettings({ sound: v })}
        />
        {canVibrate && (
          <Switch
            label="Vibrate when it rings"
            checked={settings.vibrate}
            onChange={(v) => void actions.updateSettings({ vibrate: v })}
          />
        )}
        <div className="flex flex-col gap-3 py-4">
          <p className="text-ui text-text">Text size</p>
          <Segmented
            label="Text size"
            value={settings.textSize}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'larger', label: 'Larger' },
            ]}
            onChange={(v) => void actions.updateSettings({ textSize: v })}
          />
        </div>
        <WarmAudio />
      </Group>

      <Group title="Reminder">
        <div className="flex flex-col gap-4 py-4">
          <TextField
            label="Time each day"
            type="time"
            value={reminder}
            onChange={(e) => {
              void actions.updateSettings({ reminderTime: e.target.value });
            }}
            help="Your calendar app will remind you. Nothing is sent from this phone."
            error={reminderError}
          />
          <Button variant="secondary" onClick={addReminder}>
            <CalendarPlus aria-hidden className="size-6" />
            Add to my calendar
          </Button>
        </div>
      </Group>

      <Group title="Look">
        <div className="py-4">
          <Segmented
            label="Theme"
            value={settings.theme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(v) => void actions.updateSettings({ theme: v })}
          />
        </div>
      </Group>

      <Group title="Family">
        <div className="flex flex-col gap-1 py-3">
          <p className="text-ui text-text">Cheers received</p>
          {app.cheers.length === 0 ? (
            <p className="text-body text-text-muted">
              None yet. A cheer is a short voice message from your family.
            </p>
          ) : (
            <ul className="flex flex-col">
              {app.cheers.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-1">
                  <span className="min-w-0 text-body text-text" dir="auto">
                    From {c.from}
                    {c.text !== undefined && <span className="text-text-muted">: {c.text}</span>}
                  </span>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      void actions.removeCheer(c.id);
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-1 py-3">
          <p className="text-ui text-text">Family calls received</p>
          <p className="text-body text-text-muted">
            {app.familyCalls.length === 0
              ? 'None yet.'
              : `${String(app.familyCalls.length)} written by your family, played one at a time.`}
          </p>
        </div>
        <div className="flex flex-col gap-2 py-4">
          <Button
            variant="secondary"
            onClick={() => {
              navigate('/coach');
            }}
          >
            <UserPlus aria-hidden className="size-6" />
            Set up for someone else
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              navigate('/inbox');
            }}
          >
            <Inbox aria-hidden className="size-6" />
            Coach inbox
          </Button>
        </div>
      </Group>

      <Group title="What this app is">
        <p className="max-w-prose py-4 text-body text-text-muted" data-testid="training-note">
          This is practice, not protection. It can&rsquo;t screen, block or spot your real calls. If a real
          call worries you, hang up and call a number you already trust, like the one on your card or a bill.
        </p>
      </Group>

      <Group title="Privacy">
        <div className="flex flex-col gap-4 py-4">
          <p className="max-w-prose text-body text-text-muted">
            Everything stays on this phone. There is no account, no tracking and no server. A result leaves
            only when you tap Send to family.
          </p>
          <Button
            variant="destructive"
            onClick={() => {
              setConfirm(true);
            }}
          >
            <Trash2 aria-hidden className="size-6" />
            Delete everything on this device
          </Button>
        </div>
      </Group>

      <ConfirmSheet
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete everything on this device?"
        body="Your calls, streak, cheers and settings are removed from this phone. This can’t be undone."
        confirmLabel="Delete everything"
        keepLabel="Keep my data"
        busy={deleting}
        onConfirm={() => void deleteAll()}
      />
    </Page>
  );
}
