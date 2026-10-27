import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VoiceDef } from '../../../src/domain/scenario/schema';
import type { EngineId } from './plan';

/**
 * Engine adapters (ADR §4.1): each turns text into a mono WAV on disk.
 *
 *   sapi    Windows System.Speech via scripts/tts/sapi.ps1. Verified on the dev machine.
 *   piper   `python -m piper`. Written to the documented CLI but NOT run in Stage 2
 *           (piper-tts and a voice model are not installed here).
 *   kitten  scripts/tts/kitten.py. Same: written, not run.
 */

export interface SynthJob {
  text: string;
  voiceId: string;
  def: VoiceDef;
  /** Absolute path of the WAV to write. */
  out: string;
}

export interface TtsEngine {
  id: EngineId;
  /** Which voice definitions this machine can speak with this engine. */
  canSpeak(def: VoiceDef): boolean;
  synthesize(jobs: readonly SynthJob[], scratchDir: string): void;
}

const SCRIPT_DIR = join(import.meta.dirname, '..', '..', 'tts');

function run(cmd: string, args: string[], input?: string): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, stdout: r.stdout, stderr: r.stderr };
}

export function installedSapiVoices(): Set<string> {
  if (process.platform !== 'win32') return new Set();
  const r = run('powershell', [
    '-NoProfile',
    '-Command',
    'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }',
  ]);
  return new Set(
    r.ok
      ? r.stdout
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  );
}

export function sapiEngine(): TtsEngine {
  const voices = installedSapiVoices();
  return {
    id: 'sapi',
    canSpeak: (def) => def.sapi !== undefined && voices.has(def.sapi),
    synthesize(jobs, scratchDir) {
      mkdirSync(scratchDir, { recursive: true });
      const file = join(scratchDir, 'sapi-jobs.json');
      const payload = jobs.map((j) => ({
        voice: j.def.sapi,
        rate: j.def.sapiRate ?? 0,
        text: j.text,
        out: j.out,
      }));
      writeFileSync(file, JSON.stringify(payload), 'utf8');
      const r = run('powershell', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        join(SCRIPT_DIR, 'sapi.ps1'),
        '-JobsFile',
        file,
      ]);
      if (!r.ok) throw new Error(`SAPI failed: ${r.stderr.trim()}`);
    },
  };
}

function pythonHas(module: string): boolean {
  return run('python', ['-c', `import ${module}`]).ok;
}

export function piperEngine(modelDir: string): TtsEngine {
  const ready = pythonHas('piper');
  return {
    id: 'piper',
    canSpeak: (def) =>
      ready && def.piper !== undefined && existsSync(join(modelDir, `${def.piper.model}.onnx`)),
    synthesize(jobs) {
      for (const j of jobs) {
        const piper = j.def.piper;
        if (!piper) continue;
        const args = ['-m', 'piper', '-m', join(modelDir, `${piper.model}.onnx`), '-f', j.out];
        if (piper.speaker !== undefined) args.push('--speaker', String(piper.speaker));
        const r = run('python', args, j.text);
        if (!r.ok) throw new Error(`Piper failed: ${r.stderr.trim()}`);
      }
    },
  };
}

export function kittenEngine(): TtsEngine {
  const ready = pythonHas('kittentts');
  return {
    id: 'kitten',
    canSpeak: (def) => ready && def.kitten !== undefined,
    synthesize(jobs, scratchDir) {
      mkdirSync(scratchDir, { recursive: true });
      const file = join(scratchDir, 'kitten-jobs.json');
      writeFileSync(
        file,
        JSON.stringify(jobs.map((j) => ({ voice: j.def.kitten, text: j.text, out: j.out }))),
        'utf8',
      );
      const r = run('python', ['-I', join(SCRIPT_DIR, 'kitten.py'), file]);
      if (!r.ok) throw new Error(`Kitten failed: ${r.stderr.trim()}`);
    },
  };
}

export function ffmpeg(args: string[]): void {
  const r = run('ffmpeg', args);
  if (!r.ok) throw new Error(`ffmpeg ${args.slice(-1).join(' ')} failed: ${r.stderr.trim()}`);
}

/** Duration in whole milliseconds, rounded up so a cue never lands after the clip. */
export function probeDurationMs(file: string): number {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  const seconds = Number(r.stdout.trim());
  if (!r.ok || !Number.isFinite(seconds) || seconds <= 0) throw new Error(`ffprobe failed for ${file}`);
  return Math.ceil(seconds * 1000);
}
