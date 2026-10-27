# Build-time text to speech

`pnpm audio:render` turns the lines in `scenarios/` into telephone-quality clips in `public/audio/`.
CI never renders: `pnpm audio:check` only verifies that the committed clips match the scripts.

## Engines, in priority order (one engine per voice)

| Engine | Status in Stage 2 | How it runs |
|---|---|---|
| Piper | Adapter written, **not run** (`piper-tts` is not installed here) | `python -m piper -m <model>.onnx -f out.wav`. Put `.onnx` models in `.tts-cache/piper/`. |
| Kitten TTS | Adapter written, **not run** | `python -I scripts/tts/kitten.py jobs.json` (see the file header). |
| Windows SAPI | **Used** for every clip | `scripts/tts/sapi.ps1`, one PowerShell process for the whole batch. Voices installed here: Zira, David. |

## Adding or editing a line

1. Edit the YAML in `scenarios/`.
2. `pnpm scenarios:build` then `pnpm audio:render`. Only clips whose hash changed are re-rendered.
3. Commit the changed files in `public/scenarios/` and `public/audio/`.

A clip's `sha` in `audio-manifest.json` is sha256 of the text, the voice id, the engine, the filter version and
the voice's engine settings. Changing any of them makes `audio:check` fail until you re-render.

## The filter chain

`scripts/lib/tts/filter.ts` (`FILTER_VERSION` 2): high-pass 300 Hz, low-pass 3400 Hz, compressor, a round trip
through 8 kHz for the narrowband character, limiter, loudness -18 LUFS. Opus is 16 kbps mono (VoIP mode); AAC is
16 kbps mono at 16 kHz.
