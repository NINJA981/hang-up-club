"""Kitten TTS batch renderer (ADR section 4.1, engine 2).

Usage: python -I scripts/tts/kitten.py jobs.json
jobs.json: [{"voice": "expr-voice-2-f", "text": "...", "out": "x.wav"}]

Status: written against the source of kittentts 0.1.3 (read from its wheel on
2026-10-27: class KittenTTS(model_path=None, voices_path=None) with
generate(text, voice, speed) returning a 24 kHz float array), but NOT run in
Stage 2, because kittentts is not installed on the dev machine. The first call
downloads the model from Hugging Face (a build-time network call, never at app
runtime). kittentts imports the GPL-3.0 espeak-ng phonemizer, so it stays a
build tool whose audio output we ship, never code we ship.
"""
import json
import sys


def main() -> None:
    from kittentts import KittenTTS  # type: ignore[import-not-found]
    import soundfile as sf  # type: ignore[import-not-found]

    with open(sys.argv[1], encoding="utf-8") as f:
        jobs = json.load(f)
    model = KittenTTS()
    for job in jobs:
        audio = model.generate(job["text"], voice=job["voice"])
        sf.write(job["out"], audio, 24000)


if __name__ == "__main__":
    main()
