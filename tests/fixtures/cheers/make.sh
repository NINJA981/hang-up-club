#!/usr/bin/env bash
# One-off generator for the cheer audio fixtures (ADR §6). Output is committed;
# rerun only if a fixture must change. Needs ffmpeg with libopus and aac.
# Each file is 1 s of a soft 440 Hz tone with a fade, mono, at the cheer bitrate (12 kbps).
set -euo pipefail
cd "$(dirname "$0")"
SRC='sine=frequency=440:duration=1,afade=t=in:d=0.1,afade=t=out:st=0.8:d=0.2,volume=0.5'
ffmpeg -v error -y -f lavfi -i "$SRC" -ac 1 -ar 16000 -c:a libopus -b:a 12k -application voip -f webm cheer-opus.webm
ffmpeg -v error -y -f lavfi -i "$SRC" -ac 1 -ar 16000 -c:a aac -b:a 12k -movflags +faststart -f ipod cheer-aac.m4a
